import json
import boto3
import os
import uuid
import base64

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')
BOOKS_TABLE = os.environ.get('BOOKS_TABLE')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None

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

def lambda_handler(event, context):
    try:
        resource = event.get('resource', '')
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        user_email = (claims.get('email') or '').lower()
        is_super_admin = user_email in SUPER_ADMIN_EMAILS or user_email.startswith('bryan')

        # ── 1. READ BOOK STREAM TOKEN (GET /books/{bookId}/read) ──
        if resource == '/books/{bookId}/read':
            book_id = event.get('pathParameters', {}).get('bookId')
            if not book_id or not books_table:
                return respond(400, {"error": "Invalid book ID"})

            resp = books_table.get_item(Key={'bookId': book_id})
            book = resp.get('Item')

            if not book:
                return respond(404, {"error": "Book not found"})

            # Check Privacy & Authorization
            if book.get('visibility') == 'private':
                if not user_id or (book.get('ownerId') != user_id and not is_super_admin):
                    return respond(403, {"error": "This book is in a private collection."})

            file_key = book.get('fileKey')
            if not file_key:
                return respond(404, {"error": "No document is attached to this book."})

            # Generate 1-hour presigned GET URL with inline content disposition
            read_url = s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': FILES_BUCKET,
                    'Key': file_key,
                    'ResponseContentDisposition': 'inline'
                },
                ExpiresIn=3600
            )

            return respond(200, {
                "readUrl": read_url,
                "title": book.get('title', 'Book'),
                "author": book.get('author', ''),
                "fileType": book.get('fileType', 'pdf'),
                "fileKey": file_key
            })

        # ── 2. UPLOADS (Require Authentication) ──
        if not user_id:
            return respond(401, {"error": "Unauthorized. Please sign in to upload."})

        raw_body = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw_body = base64.b64decode(raw_body).decode('utf-8')
        body = json.loads(raw_body)

        ext = body.get('extension', '').lower().lstrip('.')
        if not ext:
            return respond(400, {"error": "Missing file extension"})

        file_uuid = str(uuid.uuid4())

        if resource == '/upload/cover':
            key = f"covers/{file_uuid}.{ext}"
            url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': COVERS_BUCKET,
                    'Key': key
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
                return respond(400, {"error": "File size exceeds 100MB limit."})

            key = f"files/{file_uuid}.{ext}"
            url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': FILES_BUCKET,
                    'Key': key
                },
                ExpiresIn=900
            )
            return respond(200, {
                "uploadUrl": url,
                "fileKey": key
            })

        return respond(404, {"error": "Not found"})

    except Exception as e:
        print(f"Error in upload handler: {e}")
        return respond(500, {"error": "Internal server error"})
