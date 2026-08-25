import json, boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('red-rising-table')

def lambda_handler(event, context):
    for record in event['Records']:
        body = json.loads(record['body'])
        operation = body.get('operation')
        payload = body.get('payload', {})
        if operation in ('CREATE', 'UPDATE'):
            table.put_item(Item={
                'book-num':    int(payload['book-num']),
                'title':       payload.get('title', 'Unknown'),
                'author':      payload.get('author', 'Unknown'),
                'category':    payload.get('category', 'Uncategorized'),
                'description': payload.get('description', ''),
                'img_link':    payload.get('img_link', '')
            })
        elif operation == 'DELETE':
            table.delete_item(Key={'book-num': int(payload['book-num'])})
        elif operation == 'BATCH_DELETE':
            with table.batch_writer() as batch:
                for book_id in payload.get('book_nums', []):
                    batch.delete_item(Key={'book-num': int(book_id)})