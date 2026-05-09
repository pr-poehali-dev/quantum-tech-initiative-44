#!/bin/sh
set -e

MODELS_DIR="/models"
OLLAMA_URL="http://ollama:11434"

echo "==> Проверяем модель: $MODEL_NAME"

# Проверяем — уже загружена?
if curl -sf "$OLLAMA_URL/api/tags" | grep -q "$MODEL_NAME"; then
    echo "==> Модель уже загружена: $MODEL_NAME"
    exit 0
fi

# Скачиваем GGUF если не существует
if [ ! -f "$MODELS_DIR/$GGUF_FILENAME" ]; then
    echo "==> Скачиваем GGUF: $GGUF_URL"
    curl -L -o "$MODELS_DIR/$GGUF_FILENAME" "$GGUF_URL"
    echo "==> Файл скачан: $GGUF_FILENAME"
else
    echo "==> GGUF уже есть: $GGUF_FILENAME"
fi

# Создаём Modelfile
cat > /tmp/Modelfile << EOF
FROM /models/$GGUF_FILENAME

SYSTEM """Ты — TAP, мощный AI-ассистент.

ПИШЕШЬ КОД — Python, JavaScript, Go, Rust, SQL, Bash.
Оптимизируешь, дебажишь, рефакторишь, пишешь с нуля.

СОЗДАЁШЬ ИЗОБРАЖЕНИЯ — используй тег [IMAGE] в ответе.
Формат: [IMAGE]подробное описание на английском[/IMAGE]

ГЕНЕРИРУЕШЬ ВИДЕО — используй тег [VIDEO] в ответе.
Формат: [VIDEO]описание сцены, движений, атмосферы[/VIDEO]

ОТВЕЧАЕШЬ НА ВОПРОСЫ — глубоко, структурированно, с примерами.

Ответы на русском если не указано иное."""

PARAMETER num_ctx 8192
PARAMETER temperature 0.7
PARAMETER top_p 0.9
EOF

# Создаём модель в Ollama
echo "==> Создаём модель в Ollama: $MODEL_NAME"
curl -sf -X POST "$OLLAMA_URL/api/create" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$MODEL_NAME\", \"modelfile\": \"$(cat /tmp/Modelfile | sed 's/"/\\"/g' | tr '\n' '\\n')\"}"

echo "==> Готово! Модель $MODEL_NAME доступна"
