import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
PROFILES_TABLE = os.environ.get('PROFILES_TABLE')
profiles_table = dynamodb.Table(PROFILES_TABLE)

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
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        
        if not user_id:
            return respond(401, {"error": "Unauthorized"})
            
        method = event.get('httpMethod')
        
        if method == 'GET':
            resp = profiles_table.get_item(Key={'userId': user_id})
            profile = resp.get('Item')
            if not profile:
                return respond(404, {"error": "Profile not found"})
            return respond(200, profile)
            
        elif method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            update_exp = []
            exp_names = {}
            exp_vals = {}
            
            if 'displayName' in body:
                update_exp.append("#dn = :dn")
                exp_names["#dn"] = "displayName"
                exp_vals[":dn"] = body['displayName']
                
            if 'requestNotifications' in body:
                update_exp.append("#rn = :rn")
                exp_names["#rn"] = "requestNotifications"
                exp_vals[":rn"] = bool(body['requestNotifications'])
                
            if not update_exp:
                return respond(400, {"error": "No fields to update"})
                
            resp = profiles_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET " + ", ".join(update_exp),
                ExpressionAttributeNames=exp_names,
                ExpressionAttributeValues=exp_vals,
                ReturnValues="ALL_NEW"
            )
            return respond(200, resp.get('Attributes', {}))
            
        return respond(405, {"error": "Method not allowed"})
        
    except Exception as e:
        print(f"Error: {e}")
        return respond(500, {"error": "Internal server error"})
