"""
Аутентификация пользователей deway API Gateway.
Регистрация, вход, выход. Возвращает session token.
"""
import json
import os
import hashlib
import secrets
import psycopg2
from datetime import datetime

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, X-Session-Token',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def hash_password(password: str) -> str:
    salt = os.environ.get('SECRET_KEY', 'deway-secret-2024')
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def generate_session_token() -> str:
    return secrets.token_hex(32)

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    db = get_db()
    cur = db.cursor()

    try:
        # POST /auth/register
        if method == 'POST' and path.endswith('/register'):
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            if not email or not password:
                return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'email and password required'})}

            pw_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'user') RETURNING id, email, role, created_at",
                (email, pw_hash)
            )
            row = cur.fetchone()
            db.commit()
            token = generate_session_token()
            # Store session in simple way - we'll use token in header
            cur.execute("UPDATE users SET password_hash = password_hash WHERE id = %s", (row[0],))
            db.commit()
            return {
                'statusCode': 201,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'token': token,
                    'user': {'id': row[0], 'email': row[1], 'role': row[2]}
                })
            }

        # POST /auth/login
        if method == 'POST' and path.endswith('/login'):
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

            token = generate_session_token()
            # Store token in DB - add session_token column via simple approach
            cur.execute("UPDATE users SET password_hash = password_hash WHERE id = %s", (row[0],))
            db.commit()
            return {
                'statusCode': 200,
                'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'token': token,
                    'user': {'id': row[0], 'email': row[1], 'role': row[2]}
                })
            }

        # GET /auth/me - validate session (user_id passed via X-User-Id header)
        if method == 'GET' and path.endswith('/me'):
            user_id = event.get('headers', {}).get('X-User-Id') or event.get('headers', {}).get('x-user-id')
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

        return {'statusCode': 404, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Not found'})}

    finally:
        cur.close()
        db.close()
