import json
import boto3
import os
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
BOOKS_TABLE = os.environ.get('BOOKS_TABLE')
books_table = dynamodb.Table(BOOKS_TABLE)

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
        
        if resource == '/books':
            qsp = event.get('queryStringParameters') or {}
            visibility = qsp.get('visibility')
            if visibility == 'public':
                resp = books_table.query(
                    IndexName='VisibilityIndex',
                    KeyConditionExpression=Key('visibility').eq('public')
                )
                return respond(200, resp.get('Items', []))
            return respond(400, {"error": "Invalid query parameters"})
            
        elif resource == '/books/mine':
            if not user_id:
                return respond(401, {"error": "Unauthorized"})
            resp = books_table.query(
                IndexName='OwnerIndex',
                KeyConditionExpression=Key('ownerId').eq(user_id)
            )
            return respond(200, resp.get('Items', []))
            
        elif resource == '/books/{bookId}':
            book_id = event.get('pathParameters', {}).get('bookId')
            resp = books_table.get_item(Key={'bookId': book_id})
            book = resp.get('Item')
            
            if not book:
                return respond(404, {"error": "Book not found"})
                
            if book.get('visibility') == 'private' and book.get('ownerId') != user_id:
                return respond(403, {"error": "Forbidden"})
                
            return respond(200, book)
            
        return respond(404, {"error": "Not found"})
        
    except Exception as e:
        print(f"Error: {e}")
        return respond(500, {"error": "Internal server error"})