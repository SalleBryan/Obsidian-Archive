import json
import boto3
import os
from boto3.dynamodb.conditions import Attr
from utils import respond, get_auth_context

cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

USER_POOL_ID  = os.environ.get('USER_POOL_ID')
BOOKS_TABLE   = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET  = os.environ.get('FILES_BUCKET')

books_table    = dynamodb.Table(BOOKS_TABLE)    if BOOKS_TABLE    else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
profiles_table = dynamodb.Table(PROFILES_TABLE) if PROFILES_TABLE else None


def _list_cognito_users():
    users = []
    kwargs = {"UserPoolId": USER_POOL_ID, "Limit": 60}
    while True:
        resp = cognito_client.list_users(**kwargs)
        users.extend(resp.get("Users", []))
        token = resp.get("PaginationToken")
        if not token:
            break
        kwargs["PaginationToken"] = token
    return users


def get_stats():
    books_count = books_table.scan(Select="COUNT").get("Count", 0) if books_table else 0
    public_count = books_table.scan(
        Select="COUNT",
        FilterExpression=Attr("visibility").eq("public")
    ).get("Count", 0) if books_table else 0
    requests_count = requests_table.scan(Select="COUNT").get("Count", 0) if requests_table else 0
    users = _list_cognito_users()
    return respond(200, {
        "totalBooks": books_count,
        "publicBooks": public_count,
        "privateBooks": books_count - public_count,
        "totalUsers": len(users),
        "totalRequests": requests_count,
    })


def list_users():
    raw = _list_cognito_users()
    users = []
    for u in raw:
        attrs = {a["Name"]: a["Value"] for a in u.get("Attributes", [])}
        users.append({
            "userId": attrs.get("sub", ""),
            "email": attrs.get("email", u["Username"]),
            "name": attrs.get("name", ""),
            "status": u.get("UserStatus", ""),
            "enabled": u.get("Enabled", True),
            "createdAt": u.get("UserCreateDate", "").isoformat() if hasattr(u.get("UserCreateDate", ""), "isoformat") else str(u.get("UserCreateDate", "")),
        })
    return respond(200, {"users": users})


def toggle_user(user_id, disable):
    if not user_id or not USER_POOL_ID:
        return respond(400, {"error": "Missing userId"})
    # Resolve Cognito username from sub via profile table
    resp = profiles_table.get_item(Key={"userId": user_id}) if profiles_table else {}
    profile = resp.get("Item", {})
    username = profile.get("email", user_id)
    if disable:
        cognito_client.admin_disable_user(UserPoolId=USER_POOL_ID, Username=username)
    else:
        cognito_client.admin_enable_user(UserPoolId=USER_POOL_ID, Username=username)
    return respond(200, {"message": f"User {'disabled' if disable else 'enabled'} successfully"})


def list_all_books():
    items = []
    resp = books_table.scan() if books_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = books_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    # Strip internal fields for display
    safe = [{k: v for k, v in b.items() if k != "fileKey"} for b in items]
    return respond(200, {"books": safe})


def delete_book_admin(book_id):
    if not book_id or not books_table:
        return respond(400, {"error": "Missing bookId"})
    resp = books_table.get_item(Key={"bookId": book_id})
    book = resp.get("Item")
    if not book:
        return respond(404, {"error": "Book not found"})
    for bucket, key_field in [(COVERS_BUCKET, "coverKey"), (FILES_BUCKET, "fileKey")]:
        key = book.get(key_field)
        if bucket and key:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception as e:
                print(f"S3 delete failed: {e}")
    books_table.delete_item(Key={"bookId": book_id})
    return respond(200, {"message": "Book deleted"})


def list_all_requests():
    items = []
    resp = requests_table.scan() if requests_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = requests_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return respond(200, {"requests": items})


def lambda_handler(event, context):
    auth = get_auth_context(event)
    if not auth["isSuperAdmin"]:
        return respond(403, {"error": "Forbidden"})

    resource = event.get("resource", "")
    method = event.get("httpMethod", "")
    path_params = event.get("pathParameters") or {}

    try:
        if resource == "/admin/stats":
            return get_stats()

        if resource == "/admin/users" and method == "GET":
            return list_users()

        if resource == "/admin/users/{userId}/disable" and method == "PUT":
            return toggle_user(path_params.get("userId"), disable=True)

        if resource == "/admin/users/{userId}/enable" and method == "PUT":
            return toggle_user(path_params.get("userId"), disable=False)

        if resource == "/admin/books" and method == "GET":
            return list_all_books()

        if resource == "/admin/books/{bookId}" and method == "DELETE":
            return delete_book_admin(path_params.get("bookId"))

        if resource == "/admin/requests" and method == "GET":
            return list_all_requests()

        return respond(404, {"error": "Not found"})
    except Exception as e:
        print(f"Admin error [{resource}]: {e}")
        return respond(500, {"error": "Internal server error"})
