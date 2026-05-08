"""
Статистика использования deway API Gateway.
action передаётся через ?action=summary|by-day|by-model|by-key|logs|admin-users
"""
import json
import os
import psycopg2

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Role',
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

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    user_id, role = require_user(event)
    if not user_id:
        return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unauthorized'})}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'summary')
    days = int(params.get('days', 30))
    limit = int(params.get('limit', 50))

    db = get_db()
    cur = db.cursor()
    user_filter = "" if role == 'admin' else f"AND ul.user_id = {user_id}"

    try:
        if action == 'summary':
            cur.execute(f"""
                SELECT COUNT(*), SUM(ul.total_tokens), SUM(ul.prompt_tokens),
                       SUM(ul.completion_tokens), AVG(ul.latency_ms),
                       COUNT(DISTINCT ul.api_key_id), COUNT(DISTINCT ul.model)
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days' {user_filter}
            """)
            r = cur.fetchone()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'summary': {
                'total_requests': r[0] or 0, 'total_tokens': int(r[1] or 0),
                'prompt_tokens': int(r[2] or 0), 'completion_tokens': int(r[3] or 0),
                'avg_latency_ms': round(float(r[4] or 0), 1),
                'active_keys': r[5] or 0, 'models_used': r[6] or 0,
            }})}

        if action == 'by-day':
            cur.execute(f"""
                SELECT DATE(ul.created_at), COUNT(*), SUM(ul.total_tokens), ul.provider
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days' {user_filter}
                GROUP BY DATE(ul.created_at), ul.provider ORDER BY 1
            """)
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': [{'day': str(r[0]), 'requests': r[1], 'tokens': int(r[2] or 0), 'provider': r[3]} for r in rows]})}

        if action == 'by-model':
            cur.execute(f"""
                SELECT ul.model, ul.provider, COUNT(*), SUM(ul.total_tokens), AVG(ul.latency_ms)
                FROM usage_logs ul
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days' {user_filter}
                GROUP BY ul.model, ul.provider ORDER BY 3 DESC
            """)
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': [{'model': r[0], 'provider': r[1], 'requests': r[2], 'tokens': int(r[3] or 0), 'avg_latency_ms': round(float(r[4] or 0), 1)} for r in rows]})}

        if action == 'by-key':
            cur.execute(f"""
                SELECT ul.api_key_id, ak.key_prefix, ak.name, COUNT(*), SUM(ul.total_tokens)
                FROM usage_logs ul JOIN api_keys ak ON ak.id = ul.api_key_id
                WHERE ul.created_at >= NOW() - INTERVAL '{days} days' {user_filter}
                GROUP BY ul.api_key_id, ak.key_prefix, ak.name ORDER BY 4 DESC
            """)
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'data': [{'key_id': r[0], 'key_prefix': r[1], 'name': r[2], 'requests': r[3], 'tokens': int(r[4] or 0)} for r in rows]})}

        if action == 'logs':
            cur.execute(f"""
                SELECT ul.id, ul.model, ul.provider, ul.prompt_tokens, ul.completion_tokens,
                       ul.total_tokens, ul.latency_ms, ul.status_code, ul.created_at,
                       ak.key_prefix, ak.name
                FROM usage_logs ul JOIN api_keys ak ON ak.id = ul.api_key_id
                WHERE 1=1 {user_filter}
                ORDER BY ul.created_at DESC LIMIT {limit}
            """)
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'logs': [{'id': r[0], 'model': r[1], 'provider': r[2], 'prompt_tokens': r[3], 'completion_tokens': r[4], 'total_tokens': r[5], 'latency_ms': r[6], 'status_code': r[7], 'created_at': r[8].isoformat() if r[8] else None, 'key_prefix': r[9], 'key_name': r[10]} for r in rows]})}

        if action == 'admin-users' and role == 'admin':
            cur.execute("""
                SELECT u.id, u.email, u.role, u.is_active, u.created_at,
                       COUNT(DISTINCT ak.id), COALESCE(SUM(ul.total_tokens), 0)
                FROM users u
                LEFT JOIN api_keys ak ON ak.user_id = u.id
                LEFT JOIN usage_logs ul ON ul.user_id = u.id
                GROUP BY u.id ORDER BY u.created_at DESC
            """)
            rows = cur.fetchall()
            return {'statusCode': 200, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'users': [{'id': r[0], 'email': r[1], 'role': r[2], 'is_active': r[3], 'created_at': r[4].isoformat() if r[4] else None, 'keys_count': r[5], 'total_tokens': int(r[6])} for r in rows]})}

        return {'statusCode': 400, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Unknown action'})}

    finally:
        cur.close()
        db.close()
