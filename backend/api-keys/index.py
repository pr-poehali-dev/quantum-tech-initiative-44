"""
CRUD для API-ключей deway Gateway.
action передаётся через ?action=list|create|revoke|update&id=KEY_ID
"""
import json
import os
import secrets
import hashlib
import psycopg2

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, X-User-Id, X-User-Role',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def require_user(event):
    headers = event.get('headers') or {}
    user_id = headers.get('X-User-Id') or headers.get('x-user-id')
    if not user_id:
        return None, None
    role = headers.get('X-User-Role') or headers.get('x-user-role') or 'user'
    return int(user_id), role

def generate_api_key():
    raw = secrets.token_urlsafe(32)
    prefix = 'dw-' + raw[:8]
    full_key = 'dw-' + raw
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, key_hash, prefix

def row_to_key(row):
    return {
        'id': row[0], 'user_id': row[1], 'key_prefix': row[2], 'name': row[3],
        'is_active': row[4], 'quota_tokens': row[5], 'used_tokens': row[6],
        'rate_limit_rpm': row[7], 'allowed_models': row[8],
        'last_used_at': row[9].isoformat() if row[9] else None,
        'expires_at': row[10].isoformat() if row[10] else None,
        'created_at': row[11].isoformat() if row[11] else None,
    }

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    user_id, role = require_user(event)
    if not user_id:
        return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unauthorized'})}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'list')
    key_id = params.get('id')
    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    db = get_db()
    cur = db.cursor()

    try:
        if action == 'list':
            if role == 'admin':
                cur.execute("SELECT id, user_id, key_prefix, name, is_active, quota_tokens, used_tokens, rate_limit_rpm, allowed_models, last_used_at, expires_at, created_at FROM api_keys ORDER BY created_at DESC")
            else:
                cur.execute("SELECT id, user_id, key_prefix, name, is_active, quota_tokens, used_tokens, rate_limit_rpm, allowed_models, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'keys': [row_to_key(r) for r in rows]})}

        if action == 'create' and method == 'POST':
            name = body.get('name', 'My API Key')
            quota_tokens = body.get('quota_tokens')
            rate_limit_rpm = body.get('rate_limit_rpm', 60)
            allowed_models = body.get('allowed_models')
            full_key, key_hash, prefix = generate_api_key()
            cur.execute(
                "INSERT INTO api_keys (user_id, key_hash, key_prefix, name, quota_tokens, rate_limit_rpm, allowed_models) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at",
                (user_id, key_hash, prefix, name, quota_tokens, rate_limit_rpm, allowed_models)
            )
            row = cur.fetchone()
            db.commit()
            return {
                'statusCode': 201,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({'key': {'id': row[0], 'full_key': full_key, 'key_prefix': prefix, 'name': name, 'created_at': row[1].isoformat()}, 'warning': 'Save this key — it will not be shown again'})
            }

        if action == 'revoke' and key_id:
            if role == 'admin':
                cur.execute("UPDATE api_keys SET is_active = FALSE WHERE id = %s", (int(key_id),))
            else:
                cur.execute("UPDATE api_keys SET is_active = FALSE WHERE id = %s AND user_id = %s", (int(key_id), user_id))
            db.commit()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'success': True})}

        if action == 'update' and key_id and method == 'PUT':
            updates, vals = [], []
            for field in ['name', 'is_active', 'quota_tokens', 'rate_limit_rpm']:
                if body.get(field) is not None:
                    updates.append(f"{field} = %s")
                    vals.append(body[field])
            if not updates:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Nothing to update'})}
            vals.append(int(key_id))
            where = "id = %s" if role == 'admin' else f"id = %s AND user_id = {user_id}"
            cur.execute(f"UPDATE api_keys SET {', '.join(updates)} WHERE {where}", vals)
            db.commit()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'success': True})}

        return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unknown action'})}

    finally:
        cur.close()
        db.close()
