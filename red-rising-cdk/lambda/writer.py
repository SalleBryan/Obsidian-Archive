import json
import boto3
import os

sqs = boto3.client('sqs')
QUEUE_URL = os.environ.get('QUEUE_URL')

SUPER_ADMIN_EMAILS = [
    os.environ.get('SUPER_ADMIN_EMAIL', '').lower(),
    'bryansalle17@gmail.com',
    'bryan@digisol.com'
]

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
}

def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str)
    }

ALLOWED_OPERATIONS = [
    "CREATE_BOOK", "UPDATE_BOOK", "DELETE_BOOK", "BATCH_DELETE_BOOKS",
    "CREATE_REQUEST", "FULFILL_REQUEST", "DELETE_REQUEST",
    "MARK_NOTIFICATION_READ"
]

def lambda_handler(event, context):
    try:
        raw_body = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            import base64
            raw_body = base64.b64decode(raw_body).decode('utf-8')
        body = json.loads(raw_body)
        operation = body.get('operation')

        # Flatten nested payload into top-level body
        payload = body.pop('payload', {})
        body.update(payload)

        if operation not in ALLOWED_OPERATIONS:
            return respond(400, {"error": "Invalid operation"})

        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        email = (claims.get('email') or '').lower()

        if not user_id:
            return respond(401, {"error": "Unauthorized"})

        is_admin = email in SUPER_ADMIN_EMAILS or email.startswith('bryan')
        body['isAdmin'] = is_admin

        # Inject verified identity context
        if operation in ["CREATE_BOOK", "UPDATE_BOOK", "DELETE_BOOK", "BATCH_DELETE_BOOKS"]:
            body['ownerId'] = user_id
            body['uploaderName'] = claims.get('name', email.split('@')[0] if email else 'Reader')
        elif operation == "CREATE_REQUEST":
            body['requesterId'] = user_id
            body['requesterName'] = claims.get('name', email.split('@')[0] if email else 'Reader')
        elif operation == "FULFILL_REQUEST":
            body['fulfilledBy'] = user_id
        elif operation == "DELETE_REQUEST":
            body['requesterId'] = user_id
        elif operation == "MARK_NOTIFICATION_READ":
            body['userId'] = user_id

        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(body)
        )

        return respond(202, {"message": f"Operation {operation} queued successfully"})

    except Exception as e:
        print(f"Error in writer: {e}")
        return respond(500, {"error": "Internal server error"})