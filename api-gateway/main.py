"""
Qwen3.5-27B API Gateway — OpenAI-совместимый прокси с управлением ключами и биллингом.
Запуск: uvicorn main:app --host 0.0.0.0 --port 8000
"""
import os
import json
import time
import hashlib
import secrets
from datetime import datetime, date
from typing import Optional

import httpx
import psycopg2
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Qwen API Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "qwen3.5-27b")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

SYSTEM_PROMPT = """Ты — TAP, мощный AI-ассистент с расширенными способностями.

🔹 ПИШЕШЬ КОД — Python, JavaScript, Go, Rust, SQL, Bash.
   Оптимизируешь, дебажишь, рефакторишь, пишешь с нуля.
   Всегда с пояснениями и примерами запуска.

🔹 СОЗДАЁШЬ ИЗОБРАЖЕНИЯ — используй тег [IMAGE] в ответе.
   Формат: [IMAGE]подробное описание на английском, стиль, композиция[/IMAGE]

🔹 ГЕНЕРИРУЕШЬ ВИДЕО — используй тег [VIDEO] для описания видео-сцен.
   Формат: [VIDEO]описание движения, окружения, стиля анимации[/VIDEO]

🔹 ОТВЕЧАЕШЬ НА ВОПРОСЫ — глубоко, структурированно, с примерами.
   Предлагаешь 2-3 варианта решения.

Правила:
- Ответы на русском, если не указано иное
- Код с пояснениями
- Изображения с максимально детальным описанием на английском"""


def get_db():
    return psycopg2.connect(DATABASE_URL)


def init_db():
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gw_keys (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            key_hash TEXT UNIQUE NOT NULL,
            key_prefix TEXT NOT NULL,
            daily_token_limit BIGINT DEFAULT 0,
            used_today BIGINT DEFAULT 0,
            total_tokens BIGINT DEFAULT 0,
            total_requests BIGINT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            reset_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gw_logs (
            id SERIAL PRIMARY KEY,
            key_id INTEGER REFERENCES gw_keys(id),
            model TEXT,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            latency_ms INTEGER DEFAULT 0,
            status INTEGER DEFAULT 200,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    db.commit()
    cur.close()
    db.close()


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def validate_api_key(raw_key: str) -> Optional[dict]:
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT id, name, daily_token_limit, used_today, reset_date, is_active FROM gw_keys WHERE key_hash = %s",
        (hash_key(raw_key),)
    )
    row = cur.fetchone()
    cur.close()
    db.close()
    if not row:
        return None
    key_id, name, daily_limit, used_today, reset_date, is_active = row
    if not is_active:
        return None
    if reset_date < date.today():
        db2 = get_db()
        cur2 = db2.cursor()
        cur2.execute("UPDATE gw_keys SET used_today = 0, reset_date = CURRENT_DATE WHERE id = %s", (key_id,))
        db2.commit()
        cur2.close()
        db2.close()
        used_today = 0
    if daily_limit > 0 and used_today >= daily_limit:
        return None
    return {"id": key_id, "name": name, "daily_limit": daily_limit, "used_today": used_today}


def get_api_key_from_request(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return ""


@app.on_event("startup")
async def startup():
    try:
        init_db()
    except Exception:
        pass


# ─── Admin endpoints ────────────────────────────────────────────────────────

@app.post("/admin/keys")
async def create_key(request: Request):
    if get_api_key_from_request(request) != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")
    body = await request.json()
    name = body.get("name", "Key")
    daily_limit = int(body.get("daily_token_limit", 0))
    raw = "sk-" + secrets.token_urlsafe(32)
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "INSERT INTO gw_keys (name, key_hash, key_prefix, daily_token_limit) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
        (name, hash_key(raw), raw[:10] + "...", daily_limit)
    )
    row = cur.fetchone()
    db.commit()
    cur.close()
    db.close()
    return {"id": row[0], "key": raw, "name": name, "daily_token_limit": daily_limit, "created_at": row[1].isoformat(), "warning": "Сохраните ключ — он больше не будет показан"}


@app.delete("/admin/keys/{key_id}")
async def delete_key(key_id: int, request: Request):
    if get_api_key_from_request(request) != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")
    db = get_db()
    cur = db.cursor()
    cur.execute("UPDATE gw_keys SET is_active = FALSE WHERE id = %s", (key_id,))
    db.commit()
    cur.close()
    db.close()
    return {"success": True}


@app.get("/admin/keys")
async def list_keys(request: Request):
    if get_api_key_from_request(request) != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT id, name, key_prefix, daily_token_limit, used_today, total_tokens, total_requests, is_active, created_at FROM gw_keys ORDER BY created_at DESC")
    rows = cur.fetchall()
    cur.close()
    db.close()
    return {"keys": [{"id": r[0], "name": r[1], "key_prefix": r[2], "daily_token_limit": r[3], "used_today": r[4], "total_tokens": r[5], "total_requests": r[6], "is_active": r[7], "created_at": r[8].isoformat()} for r in rows]}


@app.get("/admin/stats")
async def admin_stats(request: Request):
    if get_api_key_from_request(request) != ADMIN_KEY:
        raise HTTPException(403, "Forbidden")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT COUNT(*), SUM(total_tokens), SUM(total_requests) FROM gw_keys WHERE is_active = TRUE")
    row = cur.fetchone()
    cur.execute("SELECT model, COUNT(*), SUM(total_tokens) FROM gw_logs GROUP BY model ORDER BY COUNT(*) DESC LIMIT 10")
    models = cur.fetchall()
    cur.execute("SELECT DATE(created_at), COUNT(*), SUM(total_tokens) FROM gw_logs WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY 1")
    by_day = cur.fetchall()
    cur.close()
    db.close()
    return {
        "active_keys": row[0] or 0,
        "total_tokens": row[1] or 0,
        "total_requests": row[2] or 0,
        "by_model": [{"model": r[0], "requests": r[1], "tokens": r[2]} for r in models],
        "by_day": [{"date": str(r[0]), "requests": r[1], "tokens": r[2]} for r in by_day],
    }


# ─── OpenAI-compatible endpoints ────────────────────────────────────────────

@app.get("/v1/models")
async def list_models(request: Request):
    raw_key = get_api_key_from_request(request)
    if raw_key != ADMIN_KEY and not validate_api_key(raw_key):
        raise HTTPException(401, "Invalid API key")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{OLLAMA_URL}/api/tags")
        tags = r.json().get("models", [])
    return {
        "object": "list",
        "data": [{"id": m["name"], "object": "model", "created": int(time.time()), "owned_by": "ollama"} for m in tags]
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    raw_key = get_api_key_from_request(request)
    key_info = None
    if raw_key != ADMIN_KEY:
        key_info = validate_api_key(raw_key)
        if not key_info:
            raise HTTPException(401, "Invalid or exhausted API key")

    body = await request.json()
    model = body.get("model", DEFAULT_MODEL)
    messages = body.get("messages", [])
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 0.7)

    if not any(m.get("role") == "system" for m in messages):
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    start = time.time()
    ollama_body = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "options": {"num_predict": max_tokens, "temperature": temperature},
    }

    if stream:
        async def stream_gen():
            prompt_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
            completion_tokens = 0
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=ollama_body) as resp:
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except Exception:
                            continue
                        content = chunk.get("message", {}).get("content", "")
                        completion_tokens += len(content) // 4
                        sse = {
                            "id": f"chatcmpl-{secrets.token_hex(8)}",
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model,
                            "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
                        }
                        yield f"data: {json.dumps(sse)}\n\n"
                        if chunk.get("done"):
                            done_sse = {
                                "id": f"chatcmpl-{secrets.token_hex(8)}",
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": model,
                                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                            }
                            yield f"data: {json.dumps(done_sse)}\n\ndata: [DONE]\n\n"
                            total = prompt_tokens + completion_tokens
                            latency = int((time.time() - start) * 1000)
                            _log_request(key_info["id"] if key_info else None, model, prompt_tokens, completion_tokens, total, latency, 200)
                            _update_usage(key_info["id"] if key_info else None, total)

        return StreamingResponse(stream_gen(), media_type="text/event-stream")
    else:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/chat", json={**ollama_body, "stream": False})
            data = resp.json()
        content = data.get("message", {}).get("content", "")
        prompt_tokens = data.get("prompt_eval_count", len(str(messages)) // 4)
        completion_tokens = data.get("eval_count", len(content) // 4)
        total = prompt_tokens + completion_tokens
        latency = int((time.time() - start) * 1000)
        _log_request(key_info["id"] if key_info else None, model, prompt_tokens, completion_tokens, total, latency, 200)
        _update_usage(key_info["id"] if key_info else None, total)
        return {
            "id": f"chatcmpl-{secrets.token_hex(8)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": total},
        }


def _log_request(key_id, model, prompt_tokens, completion_tokens, total, latency, status):
    try:
        db = get_db()
        cur = db.cursor()
        cur.execute(
            "INSERT INTO gw_logs (key_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (key_id, model, prompt_tokens, completion_tokens, total, latency, status)
        )
        db.commit()
        cur.close()
        db.close()
    except Exception:
        pass


def _update_usage(key_id, total_tokens):
    if not key_id:
        return
    try:
        db = get_db()
        cur = db.cursor()
        cur.execute(
            "UPDATE gw_keys SET used_today = used_today + %s, total_tokens = total_tokens + %s, total_requests = total_requests + 1 WHERE id = %s",
            (total_tokens, total_tokens, key_id)
        )
        db.commit()
        cur.close()
        db.close()
    except Exception:
        pass


@app.get("/health")
async def health():
    return {"status": "ok", "model": DEFAULT_MODEL}
