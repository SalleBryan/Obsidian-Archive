import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
profiles_table = dynamodb.Table(PROFILES_TABLE)

def lambda_handler(event, context):
    try:
        request = event.get('request', {})
        user_attrs = request.get('userAttributes', {})
        
        user_id = user_attrs.get('sub')
        email = user_attrs.get('email', '')
        name = user_attrs.get('name')
        
        if not name and email:
            name = email.split('@')[0]
            
        now = datetime.now(timezone.utc).isoformat()
        
        if user_id:
            profiles_table.put_item(
                Item={
                    'userId': user_id,
                    'email': email,
                    'displayName': name,
                    'requestNotifications': True,
                    'createdAt': now
                }
            )
    except Exception as e:
        print(f"Error creating profile: {e}")
        
    return event
