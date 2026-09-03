import json
import boto3
import os
import uuid
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr
from utils import respond, get_auth_context, parse_body

cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

USER_POOL_ID   = os.environ.get('USER_POOL_ID')
BOOKS_TABLE    = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
COVERS_BUCKET  = os.environ.get('COVERS_BUCKET')
FILES_BUCKET   = os.environ.get('FILES_BUCKET')

books_table    = dynamodb.Table(BOOKS_TABLE)    if BOOKS_TABLE    else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
profiles_table = dynamodb.Table(PROFILES_TABLE) if PROFILES_TABLE else None


def _now():
    return datetime.now(timezone.utc).isoformat()


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


def _resolve_username(user_id):
    """Cognito Admin* APIs accept an alias (email) in place of the username."""
    resp = profiles_table.get_item(Key={"userId": user_id}) if profiles_table else {}
    profile = resp.get("Item", {})
    return profile.get("email", user_id)


# ── STATS ──────────────────────────────────────────────────────────────────
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


# ── USERS (Cognito Admin API) ─────────────────────────────────────────────
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


def create_user(body):
    email = (body.get("email") or "").strip()
    name = (body.get("name") or "").strip() or email.split("@")[0]
    if not email:
        return respond(400, {"error": "Email is required"})

    resp = cognito_client.admin_create_user(
        UserPoolId=USER_POOL_ID,
        Username=email,
        UserAttributes=[
            {"Name": "email", "Value": email},
            {"Name": "email_verified", "Value": "true"},
            {"Name": "name", "Value": name},
        ],
        DesiredDeliveryMediums=["EMAIL"],
    )
    attrs = {a["Name"]: a["Value"] for a in resp["User"].get("Attributes", [])}
    user_id = attrs.get("sub")
    if user_id and profiles_table:
        profiles_table.put_item(Item={
            "userId": user_id,
            "email": email,
            "displayName": name,
            "requestNotifications": True,
            "createdAt": _now(),
        })
    return respond(201, {"message": "User created — temporary password emailed", "userId": user_id})


def update_user(user_id, body):
    if not user_id:
        return respond(400, {"error": "Missing userId"})
    username = _resolve_username(user_id)
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()

    attrs = []
    if name:
        attrs.append({"Name": "name", "Value": name})
    if email:
        attrs.append({"Name": "email", "Value": email})
        attrs.append({"Name": "email_verified", "Value": "true"})
    if attrs:
        cognito_client.admin_update_user_attributes(
            UserPoolId=USER_POOL_ID, Username=username, UserAttributes=attrs
        )

    if profiles_table:
        update_fields = {}
        if name:
            update_fields["displayName"] = name
        if email:
            update_fields["email"] = email
        if update_fields:
            expr = "SET " + ", ".join(f"#{k} = :{k}" for k in update_fields)
            profiles_table.update_item(
                Key={"userId": user_id},
                UpdateExpression=expr,
                ExpressionAttributeNames={f"#{k}": k for k in update_fields},
                ExpressionAttributeValues={f":{k}": v for k, v in update_fields.items()},
            )
    return respond(200, {"message": "User updated"})


def delete_user(user_id):
    if not user_id:
        return respond(400, {"error": "Missing userId"})
    username = _resolve_username(user_id)
    cognito_client.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)
    if profiles_table:
        try:
            profiles_table.delete_item(Key={"userId": user_id})
        except Exception as e:
            print(f"Profile cleanup failed: {e}")
    return respond(200, {"message": "User deleted"})


def toggle_user(user_id, disable):
    if not user_id:
        return respond(400, {"error": "Missing userId"})
    username = _resolve_username(user_id)
    if disable:
        cognito_client.admin_disable_user(UserPoolId=USER_POOL_ID, Username=username)
    else:
        cognito_client.admin_enable_user(UserPoolId=USER_POOL_ID, Username=username)
    return respond(200, {"message": f"User {'disabled' if disable else 'enabled'} successfully"})


# ── BOOKS ──────────────────────────────────────────────────────────────────
def list_all_books():
    items = []
    resp = books_table.scan() if books_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = books_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    safe = [{k: v for k, v in b.items() if k != "fileKey"} for b in items]
    return respond(200, {"books": safe})


def create_book_admin(body, auth):
    now = _now()
    book_id = str(uuid.uuid4())
    item = {
        "bookId": book_id,
        "ownerId": auth["userId"],
        "title": body.get("title", "Untitled"),
        "author": body.get("author", "Unknown Author"),
        "category": body.get("category", "Uncategorized"),
        "categories": body.get("categories") or [body.get("category", "Uncategorized")],
        "description": body.get("description", ""),
        "visibility": body.get("visibility", "public"),
        "createdAt": now,
        "updatedAt": now,
    }
    books_table.put_item(Item=item)
    return respond(201, {"message": "Book created", "bookId": book_id})


def update_book_admin(book_id, body):
    if not book_id or not books_table:
        return respond(400, {"error": "Missing bookId"})
    resp = books_table.get_item(Key={"bookId": book_id})
    if not resp.get("Item"):
        return respond(404, {"error": "Book not found"})

    fields = ["title", "author", "category", "categories", "description", "visibility", "seriesName", "seriesOrder"]
    update_exp = "SET updatedAt = :upd"
    exp_vals = {":upd": _now()}
    exp_names = {}
    for field in fields:
        if field in body:
            val = body[field]
            if field == "seriesOrder":
                try:
                    val = int(val)
                except (TypeError, ValueError):
                    continue
            update_exp += f", #{field} = :{field}"
            exp_names[f"#{field}"] = field
            exp_vals[f":{field}"] = val

    kwargs = {"Key": {"bookId": book_id}, "UpdateExpression": update_exp, "ExpressionAttributeValues": exp_vals}
    if exp_names:
        kwargs["ExpressionAttributeNames"] = exp_names
    books_table.update_item(**kwargs)
    return respond(200, {"message": "Book updated"})


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


# ── REQUESTS ───────────────────────────────────────────────────────────────
def list_all_requests():
    items = []
    resp = requests_table.scan() if requests_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = requests_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return respond(200, {"requests": items})


def create_request_admin(body, auth):
    req_id = str(uuid.uuid4())
    item = {
        "requestId": req_id,
        "requesterId": auth["userId"],
        "requesterName": auth["claims"].get("name", auth["email"].split("@")[0] if auth["email"] else "Admin"),
        "title": body.get("title", "Untitled"),
        "author": body.get("author", ""),
        "description": body.get("description", ""),
        "status": "open",
        "createdAt": _now(),
    }
    requests_table.put_item(Item=item)
    return respond(201, {"message": "Request created", "requestId": req_id})


def update_request_admin(req_id, body):
    if not req_id or not requests_table:
        return respond(400, {"error": "Missing requestId"})
    resp = requests_table.get_item(Key={"requestId": req_id})
    if not resp.get("Item"):
        return respond(404, {"error": "Request not found"})

    fields = ["title", "author", "description", "status", "fulfilledBy"]
    update_exp_parts = []
    exp_vals = {}
    exp_names = {}
    for field in fields:
        if field in body:
            update_exp_parts.append(f"#{field} = :{field}")
            exp_names[f"#{field}"] = field
            exp_vals[f":{field}"] = body[field]
    if not update_exp_parts:
        return respond(400, {"error": "No fields to update"})

    requests_table.update_item(
        Key={"requestId": req_id},
        UpdateExpression="SET " + ", ".join(update_exp_parts),
        ExpressionAttributeNames=exp_names,
        ExpressionAttributeValues=exp_vals,
    )
    return respond(200, {"message": "Request updated"})


def delete_request_admin(req_id):
    if not req_id or not requests_table:
        return respond(400, {"error": "Missing requestId"})
    resp = requests_table.get_item(Key={"requestId": req_id})
    req = resp.get("Item")
    if not req:
        return respond(404, {"error": "Request not found"})
    if COVERS_BUCKET and req.get("coverKey"):
        try:
            s3.delete_object(Bucket=COVERS_BUCKET, Key=req["coverKey"])
        except Exception as e:
            print(f"S3 delete failed: {e}")
    requests_table.delete_item(Key={"requestId": req_id})
    return respond(200, {"message": "Request deleted"})


# ── ROUTER ─────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    auth = get_auth_context(event)
    if not auth["isSuperAdmin"]:
        return respond(403, {"error": "Forbidden"})

    resource = event.get("resource", "")
    method = event.get("httpMethod", "")
    path_params = event.get("pathParameters") or {}
    body = parse_body(event) if method in ("POST", "PUT") else {}

    try:
        if resource == "/admin/stats":
            return get_stats()

        if resource == "/admin/users":
            if method == "GET":
                return list_users()
            if method == "POST":
                return create_user(body)

        if resource == "/admin/users/{userId}":
            if method == "PUT":
                return update_user(path_params.get("userId"), body)
            if method == "DELETE":
                return delete_user(path_params.get("userId"))

        if resource == "/admin/users/{userId}/disable" and method == "PUT":
            return toggle_user(path_params.get("userId"), disable=True)

        if resource == "/admin/users/{userId}/enable" and method == "PUT":
            return toggle_user(path_params.get("userId"), disable=False)

        if resource == "/admin/books":
            if method == "GET":
                return list_all_books()
            if method == "POST":
                return create_book_admin(body, auth)

        if resource == "/admin/books/{bookId}":
            if method == "PUT":
                return update_book_admin(path_params.get("bookId"), body)
            if method == "DELETE":
                return delete_book_admin(path_params.get("bookId"))

        if resource == "/admin/requests":
            if method == "GET":
                return list_all_requests()
            if method == "POST":
                return create_request_admin(body, auth)

        if resource == "/admin/requests/{requestId}":
            if method == "PUT":
                return update_request_admin(path_params.get("requestId"), body)
            if method == "DELETE":
                return delete_request_admin(path_params.get("requestId"))

        return respond(404, {"error": "Not found"})
    except cognito_client.exceptions.UsernameExistsException:
        return respond(409, {"error": "A user with that email already exists"})
    except cognito_client.exceptions.UserNotFoundException:
        return respond(404, {"error": "User not found in Cognito"})
    except Exception as e:
        print(f"Admin error [{method} {resource}]: {e}")
        return respond(500, {"error": "Internal server error"})
