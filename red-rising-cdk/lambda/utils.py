import json
import os
import base64

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
}

SUPER_ADMIN_EMAILS = [
    os.environ.get('SUPER_ADMIN_EMAIL', '').lower(),
    'bryansalle17@gmail.com',
    'bryan@digisol.com'
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
    is_super_admin = email in SUPER_ADMIN_EMAILS or email.startswith('bryan')
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
