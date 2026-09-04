import json
import boto3
import os
from boto3.dynamodb.conditions import Key, Attr
from utils import respond, get_auth_context

dynamodb = boto3.resource('dynamodb')

BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
NOTIFICATIONS_TABLE = os.environ.get('NOTIFICATIONS_TABLE')
ANNOUNCEMENT_TABLE = os.environ.get('ANNOUNCEMENT_TABLE')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE) if NOTIFICATIONS_TABLE else None
announcement_table = dynamodb.Table(ANNOUNCEMENT_TABLE) if ANNOUNCEMENT_TABLE else None

# Never returned to a client: the raw S3 key and any stored PII.
_INTERNAL_FIELDS = {'fileKey', 'userEmail', 'uploaderName'}

def client_book(book):
    b = {k: v for k, v in book.items() if k not in _INTERNAL_FIELDS}
    b['hasFile'] = bool(book.get('fileKey'))
    return b

def public_book(book):
    b = client_book(book)
    b.pop('ownerId', None)
    return b

def lambda_handler(event, context):
    try:
        resource = event.get('resource', '')
        auth = get_auth_context(event)
        user_id = auth['userId']
        is_super_admin = auth['isSuperAdmin']

        if resource == '/announcement':
            if not announcement_table:
                return respond(200, {"active": False})
            resp = announcement_table.get_item(Key={'id': 'current'})
            item = resp.get('Item')
            if not item or not item.get('active'):
                return respond(200, {"active": False})
            return respond(200, {"active": True, "message": item.get('message', ''), "updatedAt": item.get('updatedAt', '')})

        if resource == '/books':
            resp = books_table.query(
                IndexName='VisibilityIndex',
                KeyConditionExpression=Key('visibility').eq('public'),
                # Pre-moderation books have no moderationStatus field; treat as approved.
                FilterExpression=Attr('moderationStatus').eq('approved') | Attr('moderationStatus').not_exists()
            )
            return respond(200, {"books": [public_book(b) for b in resp.get('Items', [])]})

        elif resource == '/books/mine':
            if not user_id:
                return respond(401, {"error": "Unauthorized"})
            resp = books_table.query(
                IndexName='OwnerIndex',
                KeyConditionExpression=Key('ownerId').eq(user_id)
            )
            return respond(200, {"books": [client_book(b) for b in resp.get('Items', [])]})

        elif resource == '/books/{bookId}':
            book_id = event.get('pathParameters', {}).get('bookId')
            resp = books_table.get_item(Key={'bookId': book_id})
            book = resp.get('Item')

            if not book:
                return respond(404, {"error": "Book not found"})

            if book.get('visibility') == 'private':
                return respond(403, {"error": "This book is in a private collection."})

            if book.get('moderationStatus', 'approved') not in ('approved',):
                return respond(404, {"error": "Book not found"})

            return respond(200, public_book(book))

        elif resource == '/books/{bookId}/auth':
            book_id = event.get('pathParameters', {}).get('bookId')
            resp = books_table.get_item(Key={'bookId': book_id})
            book = resp.get('Item')

            if not book:
                return respond(404, {"error": "Book not found"})

            is_owner_or_admin = bool(user_id) and (book.get('ownerId') == user_id or is_super_admin)

            if book.get('visibility') == 'private' and not is_owner_or_admin:
                return respond(403, {"error": "This book is in a private collection."})

            if book.get('moderationStatus', 'approved') != 'approved' and not is_owner_or_admin:
                return respond(404, {"error": "Book not found"})

            # Only expose ownerId to the actual owner or super admins
            if is_owner_or_admin:
                return respond(200, client_book(book))
            else:
                return respond(200, public_book(book))

        elif resource == '/requests':
            if not requests_table:
                return respond(200, {"requests": []})
            resp = requests_table.scan()
            items = resp.get('Items', [])
            for item in items:
                upvoters = item.pop('upvoterIds', None) or set()
                item['upvoteCount'] = len(upvoters)
                item['hasUpvoted'] = bool(user_id) and user_id in upvoters
            items.sort(key=lambda x: x.get('upvoteCount', 0), reverse=True)
            return respond(200, {"requests": items})

        elif resource == '/notifications':
            if not user_id or not notifications_table:
                return respond(200, {"notifications": []})
            resp = notifications_table.query(
                KeyConditionExpression=Key('userId').eq(user_id)
            )
            items = resp.get('Items', [])
            items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            return respond(200, {"notifications": items})

        return respond(404, {"error": "Not found"})

    except Exception as e:
        print(f"Error in reader: {e}")
        return respond(500, {"error": "Internal server error"})