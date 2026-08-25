import json, boto3, os

sqs = boto3.client('sqs')
QUEUE_URL = os.environ["QUEUE_URL"]   # injected by CDK
ALLOWED_OPERATIONS = {"CREATE", "UPDATE", "DELETE", "BATCH_DELETE"}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
}

def respond(status_code, body):
    return {"statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps(body)}

def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return respond(200, {"message": "OK"})
    try:
        body = json.loads(event.get("body") or "{}")
        operation = body.get("operation", "").upper()
        if not operation:
            return respond(400, {"error": "Missing required field: operation"})
        if operation not in ALLOWED_OPERATIONS:
            return respond(400, {"error": f"Invalid operation '{operation}'"})
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps({"operation": operation, "payload": body.get("payload", {})})
        )
        return respond(202, {"message": f"Operation '{operation}' queued successfully"})
    except Exception as e:
        return respond(500, {"error": str(e)})