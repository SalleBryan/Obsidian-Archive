import json
import os
import base64

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
}

# Injected by CDK from frontend/src/config/adminConfig.json.
SUPER_ADMIN_EMAILS = [
    e.strip().lower() for e in os.environ.get('SUPER_ADMIN_EMAILS', '').split(',') if e.strip()
]

def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str)
    }

def get_auth_context(event):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    user_id = claims.get('sub')
    email = (claims.get('email') or '').lower()
    # Cognito emails are mutable, so an unverified address is not proof of
    # identity — admin elevation requires the address to be verified.
    verified = str(claims.get('email_verified', '')).lower() == 'true'
    is_super_admin = verified and email in SUPER_ADMIN_EMAILS
    return {
        "userId": user_id,
        "email": email,
        "isSuperAdmin": is_super_admin,
        "claims": claims
    }

def parse_body(event):
    raw_body = event.get('body') or '{}'
    if event.get('isBase64Encoded'):
        try:
            raw_body = base64.b64decode(raw_body).decode('utf-8')
        except Exception:
            return {}
    try:
        return json.loads(raw_body)
    except Exception:
        return {}


def log(event, level="INFO", **fields):
    """Emit one JSON line per log record.

    CloudWatch Logs Insights can filter and aggregate on JSON fields, but not
    on free text, so `print(f"Batch delete failed for book {bid}: {e}")` can
    only ever be grepped. Structured records make questions like "which books
    failed to delete this week" answerable.

    Values are coerced to strings rather than trusted to serialise: a log call
    must never be the thing that raises inside an exception handler. Callers
    pass identifiers, never tokens or request bodies - log lines outlive the
    request and are readable by anyone with CloudWatch access.
    """
    record = {"level": level, "event": event}
    for key, value in fields.items():
        record[key] = value if isinstance(value, (str, int, float, bool, type(None))) else str(value)
    try:
        print(json.dumps(record))
    except Exception:
        print(json.dumps({"level": "ERROR", "event": "log_serialisation_failed",
                          "original_event": str(event)}))
