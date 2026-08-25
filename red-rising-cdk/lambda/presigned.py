import json, boto3, uuid, os

s3 = boto3.client('s3')
BUCKET_NAME = os.environ["BUCKET_NAME"]   # injected by CDK

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
}

def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}
    try:
        body = json.loads(event.get('body', '{}'))
        ext = body.get('extension', 'png').lower()
        content_type = body.get('contentType', 'image/png')
        file_name = f"{uuid.uuid4()}.{ext}"
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': BUCKET_NAME, 'Key': file_name, 'ContentType': content_type},
            ExpiresIn=300
        )
        public_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{file_name}"
        return {"statusCode": 200, "headers": CORS_HEADERS,
                "body": json.dumps({"uploadUrl": presigned_url, "publicUrl": public_url})}
    except Exception as e:
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}