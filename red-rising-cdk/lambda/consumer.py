import json
import boto3
import os
import uuid
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
REQUESTS_TABLE = os.environ.get('REQUESTS_TABLE')
COVERS_BUCKET = os.environ.get('COVERS_BUCKET')
FILES_BUCKET = os.environ.get('FILES_BUCKET')

books_table = dynamodb.Table(BOOKS_TABLE)
requests_table = dynamodb.Table(REQUESTS_TABLE)

def delete_s3_object(bucket, key):
    if not bucket or not key:
        return
    try:
        s3.delete_object(Bucket=bucket, Key=key)
    except Exception as e:
        print(f"Error deleting s3://{bucket}/{key}: {e}")

def process_message(body):
    operation = body.get('operation')
    now = datetime.now(timezone.utc).isoformat()
    
    if operation == "CREATE_BOOK":
        book_id = str(uuid.uuid4())
        item = {
            'bookId': book_id,
            'ownerId': body.get('ownerId', ''),
            'title': body.get('title', 'Untitled'),
            'author': body.get('author', 'Unknown Author'),
            'category': body.get('category', 'Uncategorized'),
            'description': body.get('description', ''),
            'visibility': body.get('visibility', 'public'),
            'createdAt': now,
            'updatedAt': now
        }
        if body.get('coverKey'):
            item['coverKey'] = body['coverKey']
        if body.get('fileKey'):
            item['fileKey'] = body['fileKey']
        if body.get('fileType'):
            item['fileType'] = body['fileType']
        if body.get('fileSizeBytes'):
            item['fileSizeBytes'] = int(body['fileSizeBytes'])
        books_table.put_item(Item=item)
        
    elif operation == "UPDATE_BOOK":
        book_id = body.get('bookId')
        owner_id = body.get('ownerId')
        resp = books_table.get_item(Key={'bookId': book_id})
        book = resp.get('Item')
        
        if not book or book.get('ownerId') != owner_id:
            print(f"Update skipped: Book {book_id} not found or unauthorized")
            return
            
        update_exp = "SET updatedAt = :upd"
        exp_vals = {':upd': now}
        exp_names = {}
        
        fields = ['title', 'author', 'category', 'description', 'coverKey', 'fileKey', 'fileType', 'fileSizeBytes', 'visibility']
        for field in fields:
            if field in body:
                update_exp += f", #{field} = :{field}"
                exp_names[f"#{field}"] = field
                exp_vals[f":{field}"] = body[field]
                
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
        
        if not book or book.get('ownerId') != owner_id:
            print(f"Delete skipped: Book {book_id} not found or unauthorized")
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
            if book and book.get('ownerId') == owner_id:
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
        requests_table.update_item(
            Key={'requestId': req_id},
            UpdateExpression="SET #s = :s, fulfilledBy = :fb, fulfilledBookId = :fbi",
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={
                ':s': 'fulfilled',
                ':fb': body.get('fulfilledBy'),
                ':fbi': body.get('fulfilledBookId')
            }
        )
        
    elif operation == "DELETE_REQUEST":
        req_id = body.get('requestId')
        owner_id = body.get('requesterId')
        resp = requests_table.get_item(Key={'requestId': req_id})
        req = resp.get('Item')
        
        if not req or req.get('requesterId') != owner_id:
            print(f"Delete skipped: Request {req_id} not found or unauthorized")
            return
            
        delete_s3_object(COVERS_BUCKET, req.get('coverKey'))
        requests_table.delete_item(Key={'requestId': req_id})

def lambda_handler(event, context):
    for record in event.get('Records', []):
        try:
            body = json.loads(record['body'])
            process_message(body)
        except Exception as e:
            print(f"Error processing record: {e}")