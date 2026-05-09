"""
API deway — прокси роутер.
Принимает запросы с dw-ключами, роутит к Ollama или Anthropic.
Совместим с OpenAI API формата /v1/chat/completions.
"""
import json
import os
import time
import hashlib
import urllib.request
import urllib.error
import psycopg2
from datetime import datetime, timezone

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
}

ANTHROPIC_MODELS = {
    'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229', 'claude-sonnet-4-5', 'claude-opus-4-5',
    'claude-3-haiku-20240307', 'claude-opus-4', 'claude-sonnet-4',
}

def get_db():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_api_key_from_request(event):
    auth = (event.get('headers') or {}).get('Authorization') or \
           (event.get('headers') or {}).get('authorization') or \
           (event.get('headers') or {}).get('X-Authorization') or \
           (event.get('headers') or {}).get('x-authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    return None

def validate_key(db, raw_key):
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    cur = db.cursor()
    cur.execute(
        """SELECT ak.id, ak.user_id, ak.is_active, ak.quota_tokens, ak.used_tokens,
                  ak.rate_limit_rpm, ak.allowed_models, ak.expires_at
           FROM api_keys ak
           WHERE ak.key_hash = %s""",
        (key_hash,)
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return None, 'Invalid API key'
    if not row[2]:
        return None, 'API key is disabled'
    if row[7] and row[7] < datetime.now(timezone.utc):
        return None, 'API key expired'
    if row[3] is not None and row[4] >= row[3]:
        return None, 'Token quota exceeded'
    return {
        'id': row[0], 'user_id': row[1], 'quota_tokens': row[3],
        'used_tokens': row[4], 'rate_limit_rpm': row[5], 'allowed_models': row[6]
    }, None

def check_rate_limit(db, key_id, rpm_limit):
    cur = db.cursor()
    now = datetime.now(timezone.utc)
    window = now.replace(second=0, microsecond=0)
    cur.execute(
        """INSERT INTO rate_limit_counters (api_key_id, window_start, request_count)
           VALUES (%s, %s, 1)
           ON CONFLICT (api_key_id, window_start)
           DO UPDATE SET request_count = rate_limit_counters.request_count + 1
           RETURNING request_count""",
        (key_id, window)
    )
    count = cur.fetchone()[0]
    db.commit()
    cur.close()
    return count <= rpm_limit

def log_usage(db, key_id, user_id, model, provider, prompt_tokens, completion_tokens, path, status_code, latency_ms):
    total = prompt_tokens + completion_tokens
    cur = db.cursor()
    cur.execute(
        """INSERT INTO usage_logs (api_key_id, user_id, model, provider, prompt_tokens, completion_tokens, total_tokens, request_path, status_code, latency_ms)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (key_id, user_id, model, provider, prompt_tokens, completion_tokens, total, path, status_code, latency_ms)
    )
    if total > 0:
        cur.execute(
            "UPDATE api_keys SET used_tokens = used_tokens + %s, last_used_at = NOW() WHERE id = %s",
            (total, key_id)
        )
    db.commit()
    cur.close()

def count_tokens_approx(messages):
    total = 0
    for msg in messages:
        content = msg.get('content', '')
        if isinstance(content, str):
            total += len(content) // 4
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    total += len(str(block.get('text', ''))) // 4
    return max(total, 1)

def route_to_pollinations(body, model):
    url = 'https://text.pollinations.ai/openai'
    payload = {
        'model': model,
        'messages': body.get('messages', []),
        'stream': False,
        'private': True,
    }
    if body.get('temperature') is not None:
        payload['temperature'] = body['temperature']
    if body.get('max_tokens'):
        payload['max_tokens'] = body['max_tokens']
    req_data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
    content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
    usage = result.get('usage', {})
    prompt_tokens = usage.get('prompt_tokens', count_tokens_approx(body.get('messages', [])))
    completion_tokens = usage.get('completion_tokens', len(content) // 4)
    return {
        'id': result.get('id', f"chatcmpl-pollinations-{int(time.time())}"),
        'object': 'chat.completion',
        'model': model,
        'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}],
        'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'total_tokens': prompt_tokens + completion_tokens}
    }, prompt_tokens, completion_tokens, 'pollinations'

def route_to_ollama(body, model):
    ollama_url = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    url = f"{ollama_url}/api/chat"
    payload = {
        'model': model,
        'messages': body.get('messages', []),
        'stream': False,
        'options': {}
    }
    if body.get('temperature') is not None:
        payload['options']['temperature'] = body['temperature']
    if body.get('max_tokens'):
        payload['options']['num_predict'] = body['max_tokens']

    req_data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=req_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())

    # Convert Ollama response to OpenAI format
    content = result.get('message', {}).get('content', '')
    prompt_tokens = result.get('prompt_eval_count', count_tokens_approx(body.get('messages', [])))
    completion_tokens = result.get('eval_count', len(content) // 4)
    return {
        'id': f"chatcmpl-ollama-{int(time.time())}",
        'object': 'chat.completion',
        'model': model,
        'choices': [{
            'index': 0,
            'message': {'role': 'assistant', 'content': content},
            'finish_reason': 'stop'
        }],
        'usage': {
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': prompt_tokens + completion_tokens
        }
    }, prompt_tokens, completion_tokens, 'ollama'

def route_to_anthropic(body, model):
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    url = 'https://api.anthropic.com/v1/messages'

    # Convert OpenAI messages format to Anthropic
    messages = body.get('messages', [])
    system_msg = None
    anthropic_messages = []
    for msg in messages:
        if msg['role'] == 'system':
            system_msg = msg['content']
        else:
            anthropic_messages.append({'role': msg['role'], 'content': msg['content']})

    payload = {
        'model': model,
        'messages': anthropic_messages,
        'max_tokens': body.get('max_tokens', 1024),
    }
    if system_msg:
        payload['system'] = system_msg
    if body.get('temperature') is not None:
        payload['temperature'] = body['temperature']

    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01'
    }
    req_data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=req_data, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())

    content = result.get('content', [{}])[0].get('text', '')
    usage = result.get('usage', {})
    prompt_tokens = usage.get('input_tokens', 0)
    completion_tokens = usage.get('output_tokens', 0)

    return {
        'id': f"chatcmpl-anthropic-{int(time.time())}",
        'object': 'chat.completion',
        'model': model,
        'choices': [{
            'index': 0,
            'message': {'role': 'assistant', 'content': content},
            'finish_reason': 'stop'
        }],
        'usage': {
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': prompt_tokens + completion_tokens
        }
    }, prompt_tokens, completion_tokens, 'anthropic'

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    start_time = time.time()
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')

    # GET /v1/models — list available models
    action = (event.get('queryStringParameters') or {}).get('action', '')
    if method == 'GET' and ('models' in path or action == 'models'):
        models = []
        # Fetch from Pollinations
        try:
            req = urllib.request.Request(
                'https://text.pollinations.ai/models',
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                if isinstance(data, list):
                    for m in data:
                        if m.get('type') not in ('image', 'audio') and 'audio' not in m.get('name', ''):
                            models.append({
                                'id': m.get('name', ''),
                                'object': 'model',
                                'provider': m.get('provider', 'pollinations'),
                                'description': m.get('description', m.get('name', '')),
                            })
        except Exception:
            pass
        # Fallback hardcoded list if fetch failed
        if not models:
            for item in [
                ('openai', 'GPT-4o', 'OpenAI'),
                ('openai-large', 'GPT-4o Large', 'OpenAI'),
                ('openai-reasoning', 'o3-mini Reasoning', 'OpenAI'),
                ('mistral', 'Mistral Large', 'Mistral'),
                ('llama', 'Llama 3.3 70B', 'Meta'),
                ('llamalight', 'Llama 3.1 8B', 'Meta'),
                ('gemini', 'Gemini 2.0 Flash', 'Google'),
                ('gemini-thinking', 'Gemini 2.0 Thinking', 'Google'),
                ('deepseek', 'DeepSeek-V3', 'DeepSeek'),
                ('deepseek-r1', 'DeepSeek-R1', 'DeepSeek'),
                ('qwen-coder', 'Qwen 2.5 Coder 32B', 'Alibaba'),
                ('qwq', 'QwQ 32B Reasoning', 'Alibaba'),
                ('phi', 'Phi-4 14B', 'Microsoft'),
                ('searchgpt', 'SearchGPT (web)', 'OpenAI'),
                ('gemini-search', 'Gemini Search (web)', 'Google'),
            ]:
                models.append({'id': item[0], 'object': 'model', 'provider': item[2], 'description': item[1]})
        # Add Ollama models if configured
        ollama_url = os.environ.get('OLLAMA_BASE_URL', '')
        if ollama_url:
            try:
                req = urllib.request.Request(f"{ollama_url}/api/tags")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read())
                    for m in data.get('models', []):
                        models.append({'id': m['name'], 'object': 'model', 'provider': 'ollama', 'description': m['name']})
            except Exception:
                pass
        return {
            'statusCode': 200,
            'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
            'body': json.dumps({'object': 'list', 'data': models})
        }

    # POST /v1/chat/completions
    if method == 'POST' and ('chat' in path or action == 'chat' or path == '/'):
        raw_key = get_api_key_from_request(event)
        if not raw_key or not raw_key.startswith('dw-'):
            return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': 'Invalid or missing deway API key', 'type': 'authentication_error'}})}

        db = get_db()
        key_info, err = validate_key(db, raw_key)
        if err:
            db.close()
            return {'statusCode': 401, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': err, 'type': 'authentication_error'}})}

        if not check_rate_limit(db, key_info['id'], key_info['rate_limit_rpm']):
            db.close()
            return {'statusCode': 429, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': 'Rate limit exceeded', 'type': 'rate_limit_error'}})}

        body = {}
        if event.get('body'):
            body = json.loads(event['body'])

        model = body.get('model', 'qwen2.5:7b')

        # Check allowed models
        if key_info['allowed_models'] and model not in key_info['allowed_models']:
            db.close()
            return {'statusCode': 403, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': f'Model {model} not allowed for this key', 'type': 'permission_error'}})}

        status_code = 200
        prompt_tokens, completion_tokens = 0, 0
        provider = 'ollama'
        result = {}

        try:
            if model in ANTHROPIC_MODELS and os.environ.get('ANTHROPIC_API_KEY'):
                result, prompt_tokens, completion_tokens, provider = route_to_anthropic(body, model)
            elif os.environ.get('OLLAMA_BASE_URL'):
                result, prompt_tokens, completion_tokens, provider = route_to_ollama(body, model)
            else:
                result, prompt_tokens, completion_tokens, provider = route_to_pollinations(body, model)
        except urllib.error.HTTPError as e:
            status_code = e.code
            error_body = e.read().decode()
            log_usage(db, key_info['id'], key_info['user_id'], model, provider, 0, 0, path, status_code, int((time.time()-start_time)*1000))
            db.close()
            return {'statusCode': status_code, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': error_body, 'type': 'upstream_error'}})}
        except Exception as e:
            status_code = 502
            log_usage(db, key_info['id'], key_info['user_id'], model, provider, 0, 0, path, status_code, int((time.time()-start_time)*1000))
            db.close()
            return {'statusCode': 502, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': {'message': str(e), 'type': 'upstream_error'}})}

        latency_ms = int((time.time() - start_time) * 1000)
        log_usage(db, key_info['id'], key_info['user_id'], model, provider, prompt_tokens, completion_tokens, path, status_code, latency_ms)
        db.close()

        return {
            'statusCode': 200,
            'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
            'body': json.dumps(result)
        }

    return {'statusCode': 404, 'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': 'Not found'})}