import json
import boto3
import os

sqs = boto3.client('sqs')
QUEUE_URL = os.environ.get('QUEUE_URL')

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
    "CREATE_REQUEST", "FULFILL_REQUEST", "DELETE_REQUEST"
]

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}'))
        operation = body.get('operation')
        
        if operation not in ALLOWED_OPERATIONS:
            return respond(400, {"error": "Invalid operation"})
            
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        email = claims.get('email')
        
        if not user_id:
            return respond(401, {"error": "Unauthorized"})
            
        # Inject user context based on operation
        if operation in ["CREATE_BOOK", "UPDATE_BOOK", "DELETE_BOOK", "BATCH_DELETE_BOOKS"]:
            body['ownerId'] = user_id
        elif operation == "CREATE_REQUEST":
            body['requesterId'] = user_id
            body['requesterName'] = claims.get('name', email.split('@')[0] if email else 'Unknown')
        elif operation == "FULFILL_REQUEST":
            body['fulfilledBy'] = user_id
        elif operation == "DELETE_REQUEST":
            body['requesterId'] = user_id

        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(body)
        )
        
        return respond(202, {"message": f"Operation {operation} queued successfully"})
        
    except Exception as e:
        print(f"Error: {e}")
        return respond(500, {"error": "Internal server error"})