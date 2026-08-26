import json
import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')

BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
NOTIFICATIONS_TABLE = os.environ.get('NOTIFICATIONS_TABLE')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE) if NOTIFICATIONS_TABLE else None

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

        if resource == '/books':
            resp = books_table.query(
                IndexName='VisibilityIndex',
                KeyConditionExpression=Key('visibility').eq('public')
            )
            return respond(200, {"books": resp.get('Items', [])})

        elif resource == '/books/mine':
            if not user_id:
                return respond(401, {"error": "Unauthorized"})
            resp = books_table.query(
                IndexName='OwnerIndex',
                KeyConditionExpression=Key('ownerId').eq(user_id)
            )
            return respond(200, {"books": resp.get('Items', [])})

        elif resource == '/books/{bookId}':
            book_id = event.get('pathParameters', {}).get('bookId')
            resp = books_table.get_item(Key={'bookId': book_id})
            book = resp.get('Item')

            if not book:
                return respond(404, {"error": "Book not found"})

            if book.get('visibility') == 'private':
                if not user_id or (book.get('ownerId') != user_id and not is_super_admin):
                    return respond(403, {"error": "Forbidden"})

            return respond(200, book)

        elif resource == '/requests':
            if not requests_table:
                return respond(200, {"requests": []})
            resp = requests_table.scan()
            return respond(200, {"requests": resp.get('Items', [])})

        elif resource == '/notifications':
            if not user_id or not notifications_table:
                return respond(200, {"notifications": []})
            resp = notifications_table.query(
                KeyConditionExpression=Key('userId').eq(user_id)
            )
            items = resp.get('Items', [])
            # Sort newest first
            items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            return respond(200, {"notifications": items})

        return respond(404, {"error": "Not found"})

    except Exception as e:
        print(f"Error in reader: {e}")
        return respond(500, {"error": "Internal server error"})