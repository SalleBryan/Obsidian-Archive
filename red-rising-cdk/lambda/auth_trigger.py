from utils import log
import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
profiles_table = dynamodb.Table(PROFILES_TABLE)

def lambda_handler(event, context):
    # Bound before the try so the except block can log context even when
    # the failure happens on the very first statement.
    user_id = None
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
        log("profile_bootstrap_failed", level="ERROR", user_id=user_id, error=e)
        
    return event
