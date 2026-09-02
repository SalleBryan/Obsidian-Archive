import json
import boto3
import os
import time
from boto3.dynamodb.conditions import Key
from utils import respond, get_auth_context, parse_body

dynamodb = boto3.resource('dynamodb')
PROGRESS_TABLE = os.environ.get('PROGRESS_TABLE')
progress_table = dynamodb.Table(PROGRESS_TABLE) if PROGRESS_TABLE else None

def lambda_handler(event, context):
    """Cross-device reading progress. One row per (userId, bookId).

    GET  /progress              → list all of the caller's in-progress books
    PUT  /progress/{bookId}     → upsert progress for one book
    """
    try:
        auth = get_auth_context(event)
        user_id = auth['userId']
        if not user_id:
            return respond(401, {"error": "Unauthorized"})
        if not progress_table:
            return respond(200, {"progress": []})

        method = event.get('httpMethod')
        book_id = (event.get('pathParameters') or {}).get('bookId')

        # ── LIST all progress rows for this user ──
        if method == 'GET':
            resp = progress_table.query(
                KeyConditionExpression=Key('userId').eq(user_id)
            )
            items = resp.get('Items', [])
            items.sort(key=lambda x: x.get('updatedAt', 0), reverse=True)
            return respond(200, {"progress": items})

        # ── UPSERT progress for one book ──
        if method == 'PUT':
            if not book_id:
                return respond(400, {"error": "Missing bookId"})
            body = parse_body(event)

            # Clamp percent to 0..100
            try:
                percent = int(body.get('percent', 0))
            except (TypeError, ValueError):
                percent = 0
            percent = max(0, min(100, percent))

            item = {
                'userId': user_id,
                'bookId': book_id,
                'percent': percent,
                'position': str(body.get('position', '')),   # CFI (epub) or page number (pdf)
                'fileType': body.get('fileType', ''),
                'title': body.get('title', ''),
                'author': body.get('author', ''),
                'updatedAt': int(time.time() * 1000),
            }
            progress_table.put_item(Item=item)
            return respond(200, item)

        # ── DELETE progress for one book (e.g. "remove from Continue Reading") ──
        if method == 'DELETE':
            if not book_id:
                return respond(400, {"error": "Missing bookId"})
            progress_table.delete_item(Key={'userId': user_id, 'bookId': book_id})
            return respond(200, {"deleted": book_id})

        return respond(405, {"error": "Method not allowed"})

    except Exception as e:
        print(f"Error in progress handler: {e}")
        return respond(500, {"error": "Internal server error"})
