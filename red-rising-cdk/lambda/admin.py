import boto3
import os
import uuid
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr
from utils import respond, get_auth_context, parse_body

cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

USER_POOL_ID = os.environ.get('USER_POOL_ID')
BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
NOTIFICATIONS_TABLE = os.environ.get('NOTIFICATIONS_TABLE')
AUDIT_LOG_TABLE = os.environ.get('AUDIT_LOG_TABLE')
ANNOUNCEMENT_TABLE = os.environ.get('ANNOUNCEMENT_TABLE')
COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
profiles_table = dynamodb.Table(PROFILES_TABLE) if PROFILES_TABLE else None
notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE) if NOTIFICATIONS_TABLE else None
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE) if AUDIT_LOG_TABLE else None
announcement_table = dynamodb.Table(ANNOUNCEMENT_TABLE) if ANNOUNCEMENT_TABLE else None

_MAX_AUDIT_LOG_ITEMS = 500


def _now():
    return datetime.now(timezone.utc).isoformat()


def _audit(auth, action, target_type="", target_id=""):
    if not audit_log_table:
        return
    try:
        audit_log_table.put_item(Item={
            "logId": str(uuid.uuid4()),
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
            "adminEmail": auth.get("email", ""),
            "timestamp": _now(),
        })
    except Exception as e:
        print(f"Audit log write failed: {e}")


def _logged(resp, auth, action, target_type="", target_id=""):
    """Wrap a mutating handler's response: log an audit entry only if the
    action actually succeeded (2xx), leaving the response itself untouched."""
    if 200 <= resp.get("statusCode", 500) < 300:
        _audit(auth, action, target_type, target_id)
    return resp


def list_audit_log():
    if not audit_log_table:
        return respond(200, {"entries": []})
    items = []
    resp = audit_log_table.scan()
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp and len(items) < _MAX_AUDIT_LOG_ITEMS:
        resp = audit_log_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return respond(200, {"entries": items[:_MAX_AUDIT_LOG_ITEMS]})


def set_announcement(body):
    message = (body.get("message") or "").strip()
    if not message:
        return respond(400, {"error": "Message is required"})
    if not announcement_table:
        return respond(500, {"error": "Announcement table not configured"})
    announcement_table.put_item(Item={
        "id": "current",
        "message": message,
        "active": True,
        "updatedAt": _now(),
    })
    return respond(200, {"message": "Announcement published"})


def clear_announcement():
    if not announcement_table:
        return respond(500, {"error": "Announcement table not configured"})
    announcement_table.put_item(Item={"id": "current", "active": False, "updatedAt": _now()})
    return respond(200, {"message": "Announcement cleared"})


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
    pending_count = books_table.scan(
        Select="COUNT",
        FilterExpression=Attr("moderationStatus").eq("pending")
    ).get("Count", 0) if books_table else 0
    requests_count = requests_table.scan(Select="COUNT").get("Count", 0) if requests_table else 0
    users = _list_cognito_users()
    return respond(200, {
        "totalBooks": books_count,
        "publicBooks": public_count,
        "privateBooks": books_count - public_count,
        "pendingBooks": pending_count,
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


def batch_delete_users(user_ids):
    if not user_ids:
        return respond(400, {"error": "No userIds provided"})
    deleted, failed = [], []
    for uid in user_ids:
        try:
            username = _resolve_username(uid)
            cognito_client.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)
            if profiles_table:
                profiles_table.delete_item(Key={"userId": uid})
            deleted.append(uid)
        except Exception as e:
            print(f"Batch delete failed for user {uid}: {e}")
            failed.append(uid)
    return respond(200, {"deleted": deleted, "failed": failed})


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
# Hard cap on admin list scans — the admin panel loads a tab's full list once
# and does search/pagination client-side, which is the right call at this
# table size. This cap just stops a single Lambda call from ballooning in
# time/memory if the archive ever grows very large before that gets revisited.
_MAX_SCAN_ITEMS = 2000

def _resolve_owner_emails(owner_ids):
    """Batch-fetch emails for a set of ownerIds via DynamoDB batch_get_item
    (max 100 keys per call) instead of one get_item per book (N+1)."""
    unique_ids = list({oid for oid in owner_ids if oid})
    if not unique_ids or not profiles_table:
        return {}
    emails = {}
    for i in range(0, len(unique_ids), 100):
        chunk = unique_ids[i:i + 100]
        resp = dynamodb.batch_get_item(RequestItems={
            PROFILES_TABLE: {"Keys": [{"userId": uid} for uid in chunk]}
        })
        for item in resp.get("Responses", {}).get(PROFILES_TABLE, []):
            emails[item["userId"]] = item.get("email", "")
    return emails


def list_all_books():
    items = []
    resp = books_table.scan() if books_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp and len(items) < _MAX_SCAN_ITEMS:
        resp = books_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    owner_emails = _resolve_owner_emails([b.get("ownerId") for b in items])
    safe = [
        {**{k: v for k, v in b.items() if k != "fileKey"}, "ownerEmail": owner_emails.get(b.get("ownerId"), "")}
        for b in items
    ]
    return respond(200, {"books": safe, "truncated": "LastEvaluatedKey" in resp})


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
        "moderationStatus": "approved",  # admin-created books skip the review queue
        "createdAt": now,
        "updatedAt": now,
    }
    books_table.put_item(Item=item)
    return respond(201, {"message": "Book created", "bookId": book_id})


def _notify_matching_requesters(book_id, book_title, uploader_name, now):
    """Auto-fulfill matching open requests and notify requesters — runs on
    approval, not upload, so a rejected book never generates a false notice."""
    if not requests_table or not notifications_table or not book_title:
        return
    resp = requests_table.scan(
        FilterExpression="#s = :open",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":open": "open"},
    )
    for req in resp.get("Items", []):
        if req.get("title", "").strip().lower() != book_title.strip().lower():
            continue
        requests_table.update_item(
            Key={"requestId": req["requestId"]},
            UpdateExpression="SET #s = :s, fulfilledBy = :fb, fulfilledBookId = :fbi",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "fulfilled", ":fb": uploader_name, ":fbi": book_id},
        )
        notifications_table.put_item(Item={
            "userId": req["requesterId"],
            "notificationId": str(uuid.uuid4()),
            "title": "Book Request Available!",
            "message": f'"{book_title}" requested by you was just uploaded by {uploader_name}!',
            "bookId": book_id,
            "isRead": False,
            "createdAt": now,
        })


def approve_book_admin(book_id):
    if not book_id or not books_table:
        return respond(400, {"error": "Missing bookId"})
    resp = books_table.get_item(Key={"bookId": book_id})
    book = resp.get("Item")
    if not book:
        return respond(404, {"error": "Book not found"})

    now = _now()
    books_table.update_item(
        Key={"bookId": book_id},
        UpdateExpression="SET moderationStatus = :s, updatedAt = :u",
        ExpressionAttributeValues={":s": "approved", ":u": now},
    )

    if book.get("visibility") == "public":
        owner_resp = profiles_table.get_item(Key={"userId": book.get("ownerId", "")}) if profiles_table else {}
        uploader_name = owner_resp.get("Item", {}).get("displayName") or "A fellow reader"
        try:
            _notify_matching_requesters(book_id, book.get("title", ""), uploader_name, now)
        except Exception as e:
            print(f"Notify matching requesters failed: {e}")

    return respond(200, {"message": "Book approved"})


def reject_book_admin(book_id):
    if not book_id or not books_table:
        return respond(400, {"error": "Missing bookId"})
    resp = books_table.get_item(Key={"bookId": book_id})
    if not resp.get("Item"):
        return respond(404, {"error": "Book not found"})

    # Rejected books stay in the table (not deleted) so the uploader can see
    # their book was rejected instead of it just silently vanishing.
    books_table.update_item(
        Key={"bookId": book_id},
        UpdateExpression="SET moderationStatus = :s, updatedAt = :u",
        ExpressionAttributeValues={":s": "rejected", ":u": _now()},
    )
    return respond(200, {"message": "Book rejected"})


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


def _delete_book_row(book_id):
    resp = books_table.get_item(Key={"bookId": book_id})
    book = resp.get("Item")
    if not book:
        return False
    for bucket, key_field in [(COVERS_BUCKET, "coverKey"), (FILES_BUCKET, "fileKey")]:
        key = book.get(key_field)
        if bucket and key:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception as e:
                print(f"S3 delete failed: {e}")
    books_table.delete_item(Key={"bookId": book_id})
    return True


def delete_book_admin(book_id):
    if not book_id or not books_table:
        return respond(400, {"error": "Missing bookId"})
    if not _delete_book_row(book_id):
        return respond(404, {"error": "Book not found"})
    return respond(200, {"message": "Book deleted"})


def batch_delete_books(book_ids):
    if not book_ids:
        return respond(400, {"error": "No bookIds provided"})
    deleted, failed = [], []
    for bid in book_ids:
        try:
            (deleted if _delete_book_row(bid) else failed).append(bid)
        except Exception as e:
            print(f"Batch delete failed for book {bid}: {e}")
            failed.append(bid)
    return respond(200, {"deleted": deleted, "failed": failed})


# ── REQUESTS ───────────────────────────────────────────────────────────────
def list_all_requests():
    items = []
    resp = requests_table.scan() if requests_table else {"Items": []}
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp and len(items) < _MAX_SCAN_ITEMS:
        resp = requests_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return respond(200, {"requests": items, "truncated": "LastEvaluatedKey" in resp})


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


def _delete_request_row(req_id):
    resp = requests_table.get_item(Key={"requestId": req_id})
    req = resp.get("Item")
    if not req:
        return False
    if COVERS_BUCKET and req.get("coverKey"):
        try:
            s3.delete_object(Bucket=COVERS_BUCKET, Key=req["coverKey"])
        except Exception as e:
            print(f"S3 delete failed: {e}")
    requests_table.delete_item(Key={"requestId": req_id})
    return True


def delete_request_admin(req_id):
    if not req_id or not requests_table:
        return respond(400, {"error": "Missing requestId"})
    if not _delete_request_row(req_id):
        return respond(404, {"error": "Request not found"})
    return respond(200, {"message": "Request deleted"})


def batch_delete_requests(request_ids):
    if not request_ids:
        return respond(400, {"error": "No requestIds provided"})
    deleted, failed = [], []
    for rid in request_ids:
        try:
            (deleted if _delete_request_row(rid) else failed).append(rid)
        except Exception as e:
            print(f"Batch delete failed for request {rid}: {e}")
            failed.append(rid)
    return respond(200, {"deleted": deleted, "failed": failed})


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

        if resource == "/admin/audit-log" and method == "GET":
            return list_audit_log()

        if resource == "/admin/announcement":
            if method == "PUT":
                return _logged(set_announcement(body), auth, "set_announcement", "announcement", body.get("message", ""))
            if method == "DELETE":
                return _logged(clear_announcement(), auth, "clear_announcement", "announcement", "")

        if resource == "/admin/users":
            if method == "GET":
                return list_users()
            if method == "POST":
                return _logged(create_user(body), auth, "create_user", "user", body.get("email", ""))

        if resource == "/admin/users/{userId}":
            uid = path_params.get("userId")
            if method == "PUT":
                return _logged(update_user(uid, body), auth, "update_user", "user", uid)
            if method == "DELETE":
                return _logged(delete_user(uid), auth, "delete_user", "user", uid)

        if resource == "/admin/users/batch-delete" and method == "POST":
            ids = body.get("userIds", [])
            return _logged(batch_delete_users(ids), auth, "batch_delete_users", "user", f"{len(ids)} users")

        if resource == "/admin/users/{userId}/disable" and method == "PUT":
            uid = path_params.get("userId")
            return _logged(toggle_user(uid, disable=True), auth, "disable_user", "user", uid)

        if resource == "/admin/users/{userId}/enable" and method == "PUT":
            uid = path_params.get("userId")
            return _logged(toggle_user(uid, disable=False), auth, "enable_user", "user", uid)

        if resource == "/admin/books":
            if method == "GET":
                return list_all_books()
            if method == "POST":
                return _logged(create_book_admin(body, auth), auth, "create_book", "book", body.get("title", ""))

        if resource == "/admin/books/batch-delete" and method == "POST":
            ids = body.get("bookIds", [])
            return _logged(batch_delete_books(ids), auth, "batch_delete_books", "book", f"{len(ids)} books")

        if resource == "/admin/books/{bookId}":
            bid = path_params.get("bookId")
            if method == "PUT":
                return _logged(update_book_admin(bid, body), auth, "update_book", "book", bid)
            if method == "DELETE":
                return _logged(delete_book_admin(bid), auth, "delete_book", "book", bid)

        if resource == "/admin/books/{bookId}/approve" and method == "PUT":
            bid = path_params.get("bookId")
            return _logged(approve_book_admin(bid), auth, "approve_book", "book", bid)

        if resource == "/admin/books/{bookId}/reject" and method == "PUT":
            bid = path_params.get("bookId")
            return _logged(reject_book_admin(bid), auth, "reject_book", "book", bid)

        if resource == "/admin/requests":
            if method == "GET":
                return list_all_requests()
            if method == "POST":
                return _logged(create_request_admin(body, auth), auth, "create_request", "request", body.get("title", ""))

        if resource == "/admin/requests/batch-delete" and method == "POST":
            ids = body.get("requestIds", [])
            return _logged(batch_delete_requests(ids), auth, "batch_delete_requests", "request", f"{len(ids)} requests")

        if resource == "/admin/requests/{requestId}":
            rid = path_params.get("requestId")
            if method == "PUT":
                return _logged(update_request_admin(rid, body), auth, "update_request", "request", rid)
            if method == "DELETE":
                return _logged(delete_request_admin(rid), auth, "delete_request", "request", rid)

        return respond(404, {"error": "Not found"})
    except cognito_client.exceptions.UsernameExistsException:
        return respond(409, {"error": "A user with that email already exists"})
    except cognito_client.exceptions.UserNotFoundException:
        return respond(404, {"error": "User not found in Cognito"})
    except Exception as e:
        print(f"Admin error [{method} {resource}]: {e}")
        return respond(500, {"error": "Internal server error"})
