"""
CRUD для API-ключей deway Gateway.
Создание dw-ключей, список, отзыв, статистика.
"""
import json
import os
import secrets
import hashlib
import psycopg2
from datetime import datetime

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, X-User-Id, X-User-Role',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def require_user(event):
    user_id = (event.get('headers') or {}).get('X-User-Id') or (event.get('headers') or {}).get('x-user-id')
    if not user_id:
        return None, None
    role = (event.get('headers') or {}).get('X-User-Role') or (event.get('headers') or {}).get('x-user-role', 'user')
    return int(user_id), role

def generate_api_key():
    raw = secrets.token_urlsafe(32)
    prefix = 'dw-' + raw[:8]
    full_key = 'dw-' + raw
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, key_hash, prefix

def row_to_key(row):
    return {
        'id': row[0],
        'user_id': row[1],
        'key_prefix': row[2],
        'name': row[3],
        'is_active': row[4],
        'quota_tokens': row[5],
        'used_tokens': row[6],
        'rate_limit_rpm': row[7],
        'allowed_models': row[8],
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
    path = event.get('path', '/')
    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    db = get_db()
    cur = db.cursor()

    try:
        # GET /api-keys — list keys
        if method == 'GET' and not any(x in path.split('/')[-1] for x in ['stats']):
            path_parts = [p for p in path.split('/') if p]
            key_id = path_parts[-1] if path_parts and path_parts[-1].isdigit() else None

            if key_id:
                cur.execute(
                    "SELECT id, user_id, key_prefix, name, is_active, quota_tokens, used_tokens, rate_limit_rpm, allowed_models, last_used_at, expires_at, created_at FROM api_keys WHERE id = %s AND user_id = %s",
                    (int(key_id), user_id)
                )
                row = cur.fetchone()
                if not row:
                    return {'statusCode': 404, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Not found'})}
                return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'key': row_to_key(row)})}

            # Admin sees all, user sees own
            if role == 'admin':
                cur.execute(
                    "SELECT id, user_id, key_prefix, name, is_active, quota_tokens, used_tokens, rate_limit_rpm, allowed_models, last_used_at, expires_at, created_at FROM api_keys ORDER BY created_at DESC"
                )
            else:
                cur.execute(
                    "SELECT id, user_id, key_prefix, name, is_active, quota_tokens, used_tokens, rate_limit_rpm, allowed_models, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = %s ORDER BY created_at DESC",
                    (user_id,)
                )
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'keys': [row_to_key(r) for r in rows]})}

        # POST /api-keys — create key
        if method == 'POST':
            name = body.get('name', 'My API Key')
            quota_tokens = body.get('quota_tokens')
            rate_limit_rpm = body.get('rate_limit_rpm', 60)
            allowed_models = body.get('allowed_models')
            expires_at = body.get('expires_at')

            full_key, key_hash, prefix = generate_api_key()

            cur.execute(
                """INSERT INTO api_keys (user_id, key_hash, key_prefix, name, quota_tokens, rate_limit_rpm, allowed_models, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
                (user_id, key_hash, prefix, name, quota_tokens, rate_limit_rpm, allowed_models, expires_at)
            )
            row = cur.fetchone()
            db.commit()
            return {
                'statusCode': 201,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'key': {
                        'id': row[0],
                        'full_key': full_key,
                        'key_prefix': prefix,
                        'name': name,
                        'created_at': row[1].isoformat()
                    },
                    'warning': 'Save this key — it will not be shown again'
                })
            }

        # PUT /api-keys/{id} — update key
        if method == 'PUT':
            path_parts = [p for p in path.split('/') if p]
            key_id = path_parts[-1] if path_parts else None
            if not key_id:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Key ID required'})}

            is_active = body.get('is_active')
            name = body.get('name')
            quota_tokens = body.get('quota_tokens')
            rate_limit_rpm = body.get('rate_limit_rpm')

            updates = []
            params = []
            if is_active is not None:
                updates.append("is_active = %s")
                params.append(is_active)
            if name:
                updates.append("name = %s")
                params.append(name)
            if quota_tokens is not None:
                updates.append("quota_tokens = %s")
                params.append(quota_tokens)
            if rate_limit_rpm is not None:
                updates.append("rate_limit_rpm = %s")
                params.append(rate_limit_rpm)

            if not updates:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Nothing to update'})}

            params.extend([int(key_id), user_id])
            query = f"UPDATE api_keys SET {', '.join(updates)} WHERE id = %s AND user_id = %s"
            if role == 'admin':
                query = f"UPDATE api_keys SET {', '.join(updates)} WHERE id = %s"
                params = params[:-1]
            cur.execute(query, params)
            db.commit()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'success': True})}

        # DELETE /api-keys/{id} — revoke key
        if method == 'DELETE':
            path_parts = [p for p in path.split('/') if p]
            key_id = path_parts[-1] if path_parts else None
            if not key_id:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Key ID required'})}
            if role == 'admin':
                cur.execute("UPDATE api_keys SET is_active = FALSE WHERE id = %s", (int(key_id),))
            else:
                cur.execute("UPDATE api_keys SET is_active = FALSE WHERE id = %s AND user_id = %s", (int(key_id), user_id))
            db.commit()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'success': True})}

        return {'statusCode': 404, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Not found'})}

    finally:
        cur.close()
        db.close()
