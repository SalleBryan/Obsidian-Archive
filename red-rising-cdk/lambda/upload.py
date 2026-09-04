import boto3
import os
import uuid
from botocore.config import Config
from utils import respond, get_auth_context, parse_body

s3 = boto3.client(
    's3',
    region_name=os.environ.get('AWS_REGION', 'us-east-1'),
    config=Config(signature_version='s3v4')
)
dynamodb = boto3.resource('dynamodb')

COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')
BOOKS_TABLE = os.environ.get('BOOKS_TABLE')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None

def lambda_handler(event, context):
    try:
        resource = event.get('resource', '')
        auth = get_auth_context(event)
        user_id = auth['userId']
        is_super_admin = auth['isSuperAdmin']

        if resource in ['/books/{bookId}/read', '/books/{bookId}/read-auth']:
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
            })

        if not user_id:
            return respond(401, {"error": "Unauthorized. Please sign in to upload."})

        body = parse_body(event)

        ext = body.get('extension', '').lower().lstrip('.')
        content_type = body.get('contentType') or 'application/octet-stream'
        if not ext:
            return respond(400, {"error": "Missing file extension"})

        file_uuid = str(uuid.uuid4())

        if resource == '/upload/cover':
            key = f"covers/{file_uuid}.{ext}"
            url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': COVERS_BUCKET,
                    'Key': key,
                    'ContentType': content_type,
                },
                ExpiresIn=300
            )
            public_url = f"https://{COVERS_BUCKET}.s3.amazonaws.com/{key}"
            return respond(200, {
                "uploadUrl": url,
                "coverKey": key,
                "publicUrl": public_url,
                "contentType": content_type,
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
                    'Key': key,
                    'ContentType': content_type,
                },
                ExpiresIn=900
            )
            return respond(200, {
                "uploadUrl": url,
                "fileKey": key,
                "contentType": content_type,
            })

        return respond(404, {"error": "Not found"})

    except Exception as e:
        print(f"Error in upload handler: {e}")
        return respond(500, {"error": "Internal server error"})
