"""
Аутентификация пользователей deway API Gateway.
Регистрация, вход, выход. action передаётся через ?action=login|register|me
"""
import json
import os
import hashlib
import secrets
import psycopg2

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, X-User-Id, X-User-Role',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def hash_password(password: str) -> str:
    salt = os.environ.get('SECRET_KEY', 'deway-secret-2024')
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    db = get_db()
    cur = db.cursor()

    try:
        if action == 'register' and method == 'POST':
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            if not email or not password:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'email and password required'})}
            pw_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'user') RETURNING id, email, role",
                (email, pw_hash)
            )
            row = cur.fetchone()
            db.commit()
            token = secrets.token_hex(32)
            return {
                'statusCode': 201,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({'token': token, 'user': {'id': row[0], 'email': row[1], 'role': row[2]}})
            }

        if action == 'login' and method == 'POST':
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            pw_hash = hash_password(password)
            cur.execute(
                "SELECT id, email, role, is_active FROM users WHERE email = %s AND password_hash = %s",
                (email, pw_hash)
            )
            row = cur.fetchone()
            if not row:
                return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Invalid credentials'})}
            if not row[3]:
                return {'statusCode': 403, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Account disabled'})}
            token = secrets.token_hex(32)
            return {
                'statusCode': 200,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({'token': token, 'user': {'id': row[0], 'email': row[1], 'role': row[2]}})
            }

        if action == 'me':
            headers = event.get('headers') or {}
            user_id = headers.get('X-User-Id') or headers.get('x-user-id')
            if not user_id:
                return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unauthorized'})}
            cur.execute("SELECT id, email, role FROM users WHERE id = %s AND is_active = TRUE", (int(user_id),))
            row = cur.fetchone()
            if not row:
                return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unauthorized'})}
            return {
                'statusCode': 200,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({'user': {'id': row[0], 'email': row[1], 'role': row[2]}})
            }

        return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unknown action'})}

    finally:
        cur.close()
        db.close()
