import json
import boto3
import os
from utils import respond, get_auth_context, parse_body

sqs = boto3.client('sqs')
QUEUE_URL = os.environ.get('QUEUE_URL')

ALLOWED_OPERATIONS = [
    "CREATE_BOOK", "UPDATE_BOOK", "DELETE_BOOK", "BATCH_DELETE_BOOKS",
    "CREATE_REQUEST", "FULFILL_REQUEST", "DELETE_REQUEST", "TOGGLE_UPVOTE_REQUEST",
    "MARK_NOTIFICATION_READ"
]

def lambda_handler(event, context):
    try:
        body = parse_body(event)
        operation = body.get('operation')

        payload = body.pop('payload', {})
        body.update(payload)

        if operation not in ALLOWED_OPERATIONS:
            return respond(400, {"error": "Invalid operation"})

        auth = get_auth_context(event)
        user_id = auth['userId']
        email = auth['email']
        claims = auth['claims']

        if not user_id:
            return respond(401, {"error": "Unauthorized"})

        body['isAdmin'] = auth['isSuperAdmin']

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
        elif operation == "TOGGLE_UPVOTE_REQUEST":
            body['userId'] = user_id
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