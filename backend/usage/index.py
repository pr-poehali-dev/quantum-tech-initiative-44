"""
Статистика использования deway API Gateway.
Использование по ключам, моделям, провайдерам. Для Dashboard и Admin.
"""
import json
import os
import psycopg2
from datetime import datetime, timezone

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Role',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def require_user(event):
    user_id = (event.get('headers') or {}).get('X-User-Id') or (event.get('headers') or {}).get('x-user-id')
    if not user_id:
        return None, None
    role = (event.get('headers') or {}).get('X-User-Role') or (event.get('headers') or {}).get('x-user-role', 'user')
    return int(user_id), role

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    user_id, role = require_user(event)
    if not user_id:
        return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unauthorized'})}

    path = event.get('path', '/')
    params = event.get('queryStringParameters') or {}
    days = int(params.get('days', 30))

    db = get_db()
    cur = db.cursor()

    try:
        # Filter by user unless admin
        user_filter = "" if role == 'admin' else f"AND ul.user_id = {user_id}"

        # GET /usage/summary
        if 'summary' in path:
            cur.execute(f"""
                SELECT
                    COUNT(*) as total_requests,
                    SUM(ul.total_tokens) as total_tokens,
                    SUM(ul.prompt_tokens) as prompt_tokens,
                    SUM(ul.completion_tokens) as completion_tokens,
                    AVG(ul.latency_ms) as avg_latency,
                    COUNT(DISTINCT ul.api_key_id) as active_keys,
                    COUNT(DISTINCT ul.model) as models_used
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days'
                {user_filter}
            """)
            row = cur.fetchone()
            summary = {
                'total_requests': row[0] or 0,
                'total_tokens': int(row[1] or 0),
                'prompt_tokens': int(row[2] or 0),
                'completion_tokens': int(row[3] or 0),
                'avg_latency_ms': round(float(row[4] or 0), 1),
                'active_keys': row[5] or 0,
                'models_used': row[6] or 0,
            }
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'summary': summary})}

        # GET /usage/by-day
        if 'by-day' in path:
            cur.execute(f"""
                SELECT
                    DATE(ul.created_at) as day,
                    COUNT(*) as requests,
                    SUM(ul.total_tokens) as tokens,
                    ul.provider
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days'
                {user_filter}
                GROUP BY DATE(ul.created_at), ul.provider
                ORDER BY day ASC
            """)
            rows = cur.fetchall()
            data = [{'day': str(r[0]), 'requests': r[1], 'tokens': int(r[2] or 0), 'provider': r[3]} for r in rows]
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': data})}

        # GET /usage/by-model
        if 'by-model' in path:
            cur.execute(f"""
                SELECT
                    ul.model,
                    ul.provider,
                    COUNT(*) as requests,
                    SUM(ul.total_tokens) as tokens,
                    AVG(ul.latency_ms) as avg_latency
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days'
                {user_filter}
                GROUP BY ul.model, ul.provider
                ORDER BY requests DESC
            """)
            rows = cur.fetchall()
            data = [{'model': r[0], 'provider': r[1], 'requests': r[2], 'tokens': int(r[3] or 0), 'avg_latency_ms': round(float(r[4] or 0), 1)} for r in rows]
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': data})}

        # GET /usage/by-key
        if 'by-key' in path:
            cur.execute(f"""
                SELECT
                    ul.api_key_id,
                    ak.key_prefix,
                    ak.name,
                    COUNT(*) as requests,
                    SUM(ul.total_tokens) as tokens
                FROM usage_logs ul
                JOIN api_keys ak ON ak.id = ul.api_key_id
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days'
                {user_filter}
                GROUP BY ul.api_key_id, ak.key_prefix, ak.name
                ORDER BY requests DESC
            """)
            rows = cur.fetchall()
            data = [{'key_id': r[0], 'key_prefix': r[1], 'name': r[2], 'requests': r[3], 'tokens': int(r[4] or 0)} for r in rows]
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': data})}

        # GET /usage/logs - recent logs
        if 'logs' in path:
            limit = int(params.get('limit', 50))
            cur.execute(f"""
                SELECT
                    ul.id, ul.model, ul.provider, ul.prompt_tokens, ul.completion_tokens,
                    ul.total_tokens, ul.latency_ms, ul.status_code, ul.created_at,
                    ak.key_prefix, ak.name
                FROM usage_logs ul
                JOIN api_keys ak ON ak.id = ul.api_key_id
                WHERE 1=1 {user_filter}
                ORDER BY ul.created_at DESC
                LIMIT {limit}
            """)
            rows = cur.fetchall()
            data = [{
                'id': r[0], 'model': r[1], 'provider': r[2],
                'prompt_tokens': r[3], 'completion_tokens': r[4], 'total_tokens': r[5],
                'latency_ms': r[6], 'status_code': r[7],
                'created_at': r[8].isoformat() if r[8] else None,
                'key_prefix': r[9], 'key_name': r[10]
            } for r in rows]
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'logs': data})}

        # GET /usage/admin/users (admin only)
        if 'users' in path and role == 'admin':
            cur.execute("""
                SELECT u.id, u.email, u.role, u.is_active, u.created_at,
                    COUNT(DISTINCT ak.id) as keys_count,
                    COALESCE(SUM(ul.total_tokens), 0) as total_tokens
                FROM users u
                LEFT JOIN api_keys ak ON ak.user_id = u.id
                LEFT JOIN usage_logs ul ON ul.user_id = u.id
                GROUP BY u.id, u.email, u.role, u.is_active, u.created_at
                ORDER BY u.created_at DESC
            """)
            rows = cur.fetchall()
            data = [{
                'id': r[0], 'email': r[1], 'role': r[2], 'is_active': r[3],
                'created_at': r[4].isoformat() if r[4] else None,
                'keys_count': r[5], 'total_tokens': int(r[6])
            } for r in rows]
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'users': data})}

        return {'statusCode': 404, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Not found'})}

    finally:
        cur.close()
        db.close()
