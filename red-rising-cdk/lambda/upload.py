import json
import boto3
import os
import uuid

s3 = boto3.client('s3')

COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')

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

def lambda_handler(event, context):
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        if not claims.get('sub'):
            return respond(401, {"error": "Unauthorized"})
            
        resource = event.get('resource', '')
        body = json.loads(event.get('body', '{}'))
        ext = body.get('extension', '')
        content_type = body.get('contentType', 'application/octet-stream')
        
        if not ext:
            return respond(400, {"error": "Missing extension"})
            
        file_uuid = str(uuid.uuid4())
        
        if resource == '/upload/cover':
            key = f"covers/{file_uuid}.{ext}"
            url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': COVERS_BUCKET,
                    'Key': key,
                    'ContentType': content_type
                },
                ExpiresIn=300
            )
            public_url = f"https://{COVERS_BUCKET}.s3.amazonaws.com/{key}"
            return respond(200, {
                "uploadUrl": url,
                "coverKey": key,
                "publicUrl": public_url
            })
            
        elif resource == '/upload/book':
            size = body.get('fileSizeBytes', 0)
            if size > 104857600:  # 100MB max limit
                return respond(400, {"error": "File too large. Maximum size is 100MB."})
                
            key = f"files/{file_uuid}.{ext}"
            url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': FILES_BUCKET,
                    'Key': key,
                    'ContentType': content_type
                },
                ExpiresIn=900
            )
            return respond(200, {
                "uploadUrl": url,
                "fileKey": key
            })
            
        return respond(404, {"error": "Not found"})
        
    except Exception as e:
        print(f"Error: {e}")
        return respond(500, {"error": "Internal server error"})
