import json
import boto3
import os
import uuid
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
NOTIFICATIONS_TABLE = os.environ.get('NOTIFICATIONS_TABLE')
COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')

books_table = dynamodb.Table(BOOKS_TABLE) if BOOKS_TABLE else None
requests_table = dynamodb.Table(REQUESTS_TABLE) if REQUESTS_TABLE else None
notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE) if NOTIFICATIONS_TABLE else None

def delete_s3_object(bucket, key):
    if not bucket or not key:
        return
    try:
        s3.delete_object(Bucket=bucket, Key=key)
    except Exception as e:
        print(f"Error deleting s3://{bucket}/{key}: {e}")


def process_message(body):
    operation = body.get('operation')
    is_admin = bool(body.get('isAdmin', False))
    now = datetime.now(timezone.utc).isoformat()
    
    if operation == "CREATE_BOOK":
        book_id = str(uuid.uuid4())
        visibility = body.get('visibility', 'public')
        item = {
            'bookId': book_id,
            'ownerId': body.get('ownerId', ''),
            'title': body.get('title', 'Untitled'),
            'author': body.get('author', 'Unknown Author'),
            'category': body.get('category', 'Uncategorized'),   # kept for GSI backward compat
            'categories': body.get('categories') or [body.get('category', 'Uncategorized')],
            'description': body.get('description', ''),
            'visibility': visibility,
            # Private books are only ever visible to their owner, so there's
            # nothing to moderate. Public books wait for admin approval before
            # they appear in the public library.
            'moderationStatus': 'approved' if visibility == 'private' else 'pending',
            'createdAt': now,
            'updatedAt': now
        }
        if body.get('seriesName'):
            item['seriesName'] = body['seriesName'].strip()
        if body.get('seriesOrder'):
            try:
                item['seriesOrder'] = int(body['seriesOrder'])
            except:
                pass
        if body.get('coverKey'):
            item['coverKey'] = body['coverKey']
        if body.get('fileKey'):
            item['fileKey'] = body['fileKey']
        if body.get('fileType'):
            item['fileType'] = body['fileType']
        if body.get('fileSizeBytes'):
            item['fileSizeBytes'] = int(body['fileSizeBytes'])

        books_table.put_item(Item=item)
        # Matching-request notifications fire on approval, not here — notifying
        # a requester about a book that isn't even public yet (and might get
        # rejected) would be misleading.

    elif operation == "UPDATE_BOOK":
        book_id = body.get('bookId')
        owner_id = body.get('ownerId')
        resp = books_table.get_item(Key={'bookId': book_id})
        book = resp.get('Item')
        
        if not book:
            print(f"Update skipped: Book {book_id} not found")
            return
            
        if book.get('ownerId') != owner_id and not is_admin:
            print(f"Update skipped: Unauthorized for book {book_id}")
            return
            
        update_exp = "SET updatedAt = :upd"
        exp_vals = {':upd': now}
        exp_names = {}
        
        fields = ['title', 'author', 'category', 'categories', 'description', 'coverKey', 'fileKey', 'fileType', 'fileSizeBytes', 'visibility', 'seriesName', 'seriesOrder']
        for field in fields:
            if field in body:
                val = body[field]
                if field == 'seriesOrder':
                    try: val = int(val)
                    except: continue
                update_exp += f", #{field} = :{field}"
                exp_names[f"#{field}"] = field
                exp_vals[f":{field}"] = val
                
        kwargs = {
            'Key': {'bookId': book_id},
            'UpdateExpression': update_exp,
            'ExpressionAttributeValues': exp_vals
        }
        if exp_names:
            kwargs['ExpressionAttributeNames'] = exp_names
            
        books_table.update_item(**kwargs)
        
    elif operation == "DELETE_BOOK":
        book_id = body.get('bookId')
        owner_id = body.get('ownerId')
        resp = books_table.get_item(Key={'bookId': book_id})
        book = resp.get('Item')
        
        if not book:
            return
            
        if book.get('ownerId') != owner_id and not is_admin:
            print(f"Delete skipped: Unauthorized for book {book_id}")
            return
            
        delete_s3_object(COVERS_BUCKET, book.get('coverKey'))
        delete_s3_object(FILES_BUCKET, book.get('fileKey'))
        books_table.delete_item(Key={'bookId': book_id})
        
    elif operation == "BATCH_DELETE_BOOKS":
        book_ids = body.get('bookIds', [])
        owner_id = body.get('ownerId')
        for b_id in book_ids:
            resp = books_table.get_item(Key={'bookId': b_id})
            book = resp.get('Item')
            if book and (book.get('ownerId') == owner_id or is_admin):
                delete_s3_object(COVERS_BUCKET, book.get('coverKey'))
                delete_s3_object(FILES_BUCKET, book.get('fileKey'))
                books_table.delete_item(Key={'bookId': b_id})
                
    elif operation == "CREATE_REQUEST":
        req_id = str(uuid.uuid4())
        item = {
            'requestId': req_id,
            'requesterId': body.get('requesterId'),
            'requesterName': body.get('requesterName'),
            'title': body.get('title'),
            'author': body.get('author'),
            'description': body.get('description'),
            'coverKey': body.get('coverKey'),
            'status': 'open',
            'createdAt': now
        }
        requests_table.put_item(Item=item)
        
    elif operation == "FULFILL_REQUEST":
        req_id = body.get('requestId')
        book_id = body.get('fulfilledBookId')
        resp = requests_table.get_item(Key={'requestId': req_id})
        req = resp.get('Item')

        requests_table.update_item(
            Key={'requestId': req_id},
            UpdateExpression="SET #s = :s, fulfilledBy = :fb, fulfilledBookId = :fbi",
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={
                ':s': 'fulfilled',
                ':fb': body.get('fulfilledBy'),
                ':fbi': book_id
            }
        )

        if req and notifications_table:
            notifications_table.put_item(Item={
                'userId': req['requesterId'],
                'notificationId': str(uuid.uuid4()),
                'title': 'Book Request Fulfilled!',
                'message': f'"{req.get("title")}" has been fulfilled by a reader!',
                'bookId': book_id,
                'isRead': False,
                'createdAt': now
            })
        
    elif operation == "DELETE_REQUEST":
        req_id = body.get('requestId')
        owner_id = body.get('requesterId')
        resp = requests_table.get_item(Key={'requestId': req_id})
        req = resp.get('Item')
        
        if not req:
            return
            
        if req.get('requesterId') != owner_id and not is_admin:
            print(f"Delete request skipped: Unauthorized for {req_id}")
            return
            
        delete_s3_object(COVERS_BUCKET, req.get('coverKey'))
        requests_table.delete_item(Key={'requestId': req_id})

    elif operation == "TOGGLE_UPVOTE_REQUEST":
        req_id = body.get('requestId')
        user_id = body.get('userId')
        if not req_id or not user_id:
            return
        resp = requests_table.get_item(Key={'requestId': req_id})
        req = resp.get('Item')
        if not req:
            return
        # upvoterIds is a DynamoDB String Set — ADD/DELETE are atomic and
        # naturally dedupe, so no read-modify-write race on concurrent toggles.
        already_upvoted = user_id in (req.get('upvoterIds') or set())
        requests_table.update_item(
            Key={'requestId': req_id},
            UpdateExpression=f"{'DELETE' if already_upvoted else 'ADD'} upvoterIds :u",
            ExpressionAttributeValues={':u': {user_id}}
        )

    elif operation == "MARK_NOTIFICATION_READ":
        notif_id = body.get('notificationId')
        user_id = body.get('userId')
        if notif_id and user_id and notifications_table:
            notifications_table.update_item(
                Key={'userId': user_id, 'notificationId': notif_id},
                UpdateExpression="SET #r = :r",
                ExpressionAttributeNames={'#r': 'isRead'},
                ExpressionAttributeValues={':r': True}
            )

def lambda_handler(event, context):
    for record in event.get('Records', []):
        try:
            body = json.loads(record['body'])
            process_message(body)
        except Exception as e:
            print(f"Error processing record: {e}")