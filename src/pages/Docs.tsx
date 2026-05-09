import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Icon from '@/components/ui/icon'

const PROXY_URL = 'https://functions.poehali.dev/db4455a3-fb31-4d3d-9fa5-4067e71d38b2'

const MODELS = [
  { id: 'claude-opus-4', provider: 'anthropic', desc: 'Самая мощная модель Anthropic' },
  { id: 'claude-sonnet-4', provider: 'anthropic', desc: 'Баланс скорости и качества' },
  { id: 'claude-3-5-haiku-20241022', provider: 'anthropic', desc: 'Быстрая и дешёвая' },
  { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', desc: 'Отличное качество кода' },
  { id: 'qwen2.5:7b', provider: 'ollama', desc: 'Open-source, быстрый' },
  { id: 'llama3.1:8b', provider: 'ollama', desc: 'Meta LLaMA, универсальный' },
]

const CODE_EXAMPLES = {
  python: `from openai import OpenAI

client = OpenAI(
    api_key="dw-YOUR_KEY",
    base_url="${PROXY_URL}/v1"
)

response = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role": "user", "content": "Привет!"}]
)
print(response.choices[0].message.content)`,

  js: `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'dw-YOUR_KEY',
  baseURL: '${PROXY_URL}/v1',
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4',
  messages: [{ role: 'user', content: 'Привет!' }],
});
console.log(response.choices[0].message.content);`,

  curl: `curl ${PROXY_URL}/v1/chat/completions \\
  -H "Authorization: Bearer dw-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Привет!"}]
  }'`,
}

const DOCKER_COMPOSE = `version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: api_provider
      POSTGRES_USER: apiuser
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    volumes:
      - ollama_data:/root/.ollama

  api-gateway:
    build: ./api-gateway
    depends_on: [postgres, ollama]
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://apiuser:\${DB_PASSWORD}@postgres/api_provider
      - OLLAMA_URL=http://ollama:11434
      - ADMIN_KEY=\${ADMIN_KEY}
      - DEFAULT_MODEL=\${MODEL_NAME}

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [api-gateway, open-webui]

volumes:
  pg_data:
  ollama_data:`

const ENV_EXAMPLE = `DB_PASSWORD=supersecret-change-me
ADMIN_KEY=sk-admin-your-secret-key
MODEL_NAME=qwen3.5-27b-claude-distilled:q4_k_m
GGUF_URL=https://huggingface.co/Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-GGUF/resolve/main/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-Q4_K_M.gguf
GGUF_FILENAME=qwen3.5-27b-claude-distilled-q4_k_m.gguf`

const QWEN_PYTHON = `from openai import OpenAI

client = OpenAI(
    api_key="sk-YOUR_KEY",
    base_url="http://YOUR_SERVER/v1"
)

response = client.chat.completions.create(
    model="qwen3.5-27b-claude-distilled:q4_k_m",
    messages=[{"role": "user", "content": "Напиши Telegram-бота на aiogram"}]
)
print(response.choices[0].message.content)`

const QWEN_ADMIN = `# Создать ключ
curl -X POST http://localhost/admin/keys \\
  -H "Authorization: Bearer sk-admin-your-secret-key" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Клиент 1", "daily_token_limit": 1000000}'

# Статистика
curl http://localhost/admin/stats \\
  -H "Authorization: Bearer sk-admin-your-secret-key"

# Список ключей
curl http://localhost/admin/keys \\
  -H "Authorization: Bearer sk-admin-your-secret-key"`

const QWEN_AGENT = `# Интерактивный чат с агентом
docker compose run --rm qwen-code-agent interactive

# Code review проекта
docker compose run --rm qwen-code-agent review

# Рефакторинг файла
docker compose run --rm qwen-code-agent refactor src/main.py

# Написать тесты
docker compose run --rm qwen-code-agent test src/utils.py

# Сформировать git commit
docker compose run --rm qwen-code-agent commit

# Спросить с доступом к файлам
docker compose run --rm qwen-code-agent ask "Найди все баги в коде"`

export default function Docs() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'python' | 'js' | 'curl'>('python')
  const [copied, setCopied] = useState(false)
  const [activeSection, setActiveSection] = useState<'cloud' | 'selfhosted'>('cloud')

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-black/80 px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur">
        <button onClick={() => navigate('/')} className="font-orbitron text-xl font-bold">
          de<span className="text-red-500">way</span>
        </button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => navigate('/login')}>
            Войти
          </Button>
          <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0" onClick={() => navigate('/login')}>
            Получить ключ
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        {/* Header */}
        <div>
          <Badge className="bg-red-500/10 text-red-400 border-red-500/20 mb-4">Документация</Badge>
          <h1 className="text-4xl font-bold font-orbitron mb-3">
            Подключение к <span className="text-red-500">deway</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            deway совместим с OpenAI API — просто замени <code className="text-green-400 bg-zinc-800 px-1 rounded">base_url</code> и используй свой dw-ключ.
            Или разверни собственный Qwen3.5-27B API Provider на своём железе.
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-3">
          <button
            onClick={() => setActiveSection('cloud')}
            className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-all ${activeSection === 'cloud' ? 'bg-red-500 border-red-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'}`}
          >
            <Icon name="Cloud" size={18} />
            <span className="font-medium">deway Cloud</span>
          </button>
          <button
            onClick={() => setActiveSection('selfhosted')}
            className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-all ${activeSection === 'selfhosted' ? 'bg-red-500 border-red-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'}`}
          >
            <Icon name="Server" size={18} />
            <span className="font-medium">Self-Hosted (Qwen3.5-27B)</span>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs ml-1">GPU</Badge>
          </button>
        </div>

        {/* ── CLOUD SECTION ─────────────────────────────────────────── */}
        {activeSection === 'cloud' && <>

        {/* Step 1 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
            <h2 className="text-xl font-semibold">Получи API-ключ</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4 space-y-3">
              <p className="text-zinc-400 text-sm">Зарегистрируйся и создай ключ в личном кабинете. Ключ начинается с <code className="text-green-400">dw-</code></p>
              <Button className="bg-red-500 hover:bg-red-600 text-white border-0" onClick={() => navigate('/login')}>
                <Icon name="Key" size={16} className="mr-2" />
                Создать ключ
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Step 2 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
            <h2 className="text-xl font-semibold">Подключись к deway</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-zinc-400 text-xs mb-1">Base URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-zinc-800 text-green-400 px-3 py-2 rounded text-sm font-mono break-all">
                    {PROXY_URL}/v1
                  </code>
                  <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white flex-shrink-0" onClick={() => copy(PROXY_URL + '/v1')}>
                    <Icon name={copied ? 'Check' : 'Copy'} size={14} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3 — Code example */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
            <h2 className="text-xl font-semibold">Первый запрос</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                {(['python', 'js', 'curl'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3 py-1 rounded text-sm font-mono transition-colors ${lang === l ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                  >
                    {l === 'js' ? 'Node.js' : l}
                  </button>
                ))}
              </div>
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto leading-relaxed">
                  {CODE_EXAMPLES[lang]}
                </pre>
                <button
                  onClick={() => copy(CODE_EXAMPLES[lang])}
                  className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors"
                >
                  <Icon name={copied ? 'Check' : 'Copy'} size={14} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Models */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Cpu" size={20} className="text-red-500" />
            Доступные модели
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MODELS.map(m => (
              <Card key={m.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <code className="text-white text-sm font-mono">{m.id}</code>
                    <p className="text-zinc-500 text-xs mt-1">{m.desc}</p>
                  </div>
                  <Badge className={m.provider === 'anthropic'
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 flex-shrink-0'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20 flex-shrink-0'
                  }>
                    {m.provider}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Globe" size={20} className="text-red-500" />
            Эндпоинты
          </h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              {[
                { method: 'POST', path: '/v1/chat/completions', desc: 'Генерация текста (совместимо с OpenAI)' },
                { method: 'GET', path: '/v1/models', desc: 'Список доступных моделей' },
              ].map((ep, i) => (
                <div key={i} className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? 'border-t border-zinc-800' : ''}`}>
                  <Badge className={ep.method === 'POST'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono text-xs w-12 justify-center'
                    : 'bg-green-500/10 text-green-400 border-green-500/20 font-mono text-xs w-12 justify-center'
                  }>
                    {ep.method}
                  </Badge>
                  <code className="text-zinc-300 text-sm font-mono">{ep.path}</code>
                  <span className="text-zinc-500 text-sm ml-auto hidden md:block">{ep.desc}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Auth */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Shield" size={20} className="text-red-500" />
            Авторизация
          </h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 space-y-3">
              <p className="text-zinc-400 text-sm">Передавай ключ в заголовке <code className="text-green-400 bg-zinc-800 px-1 rounded">Authorization</code>:</p>
              <pre className="bg-zinc-800 rounded p-3 text-green-400 text-sm font-mono">
                Authorization: Bearer dw-YOUR_KEY
              </pre>
              <p className="text-zinc-500 text-xs">Ключи создаются в <button onClick={() => navigate('/dashboard')} className="text-red-400 hover:underline">личном кабинете</button>. Никому не передавай ключ — он даёт доступ к твоим квотам.</p>
            </CardContent>
          </Card>
        </div>

        </>}

        {/* ── SELF-HOSTED SECTION ───────────────────────────────────── */}
        {activeSection === 'selfhosted' && <>

        {/* Requirements */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Cpu" size={20} className="text-red-500" />
            Требования к серверу
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'GPU', value: 'RTX 4090 / A100', sub: 'минимум 24 GB VRAM' },
              { label: 'RAM', value: '32–64 GB', sub: 'рекомендуется 64+' },
              { label: 'Диск', value: '100 GB NVMe', sub: 'для модели и данных' },
              { label: 'ОС', value: 'Ubuntu 22.04+', sub: 'Docker 24+' },
              { label: 'NVIDIA Driver', value: '535+', sub: 'CUDA 12+' },
              { label: 'Модель', value: 'Qwen3.5-27B', sub: 'Q4_K_M ≈ 18 GB' },
            ].map(item => (
              <Card key={item.label} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <p className="text-zinc-500 text-xs mb-1">{item.label}</p>
                  <p className="text-white font-semibold text-sm">{item.value}</p>
                  <p className="text-zinc-600 text-xs mt-0.5">{item.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick start */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
            <h2 className="text-xl font-semibold">Клонируй и настрой</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto leading-relaxed">{`mkdir -p ~/qwen-provider && cd ~/qwen-provider

# Скачай проект (или скопируй файлы вручную)
git clone https://github.com/your-repo/qwen-provider .

# Настрой переменные
cp .env.example .env
nano .env`}</pre>
              </div>
              <div className="mt-3">
                <p className="text-zinc-500 text-xs mb-2">Содержимое .env:</p>
                <div className="relative">
                  <pre className="bg-zinc-800 rounded p-3 text-green-400 text-xs overflow-x-auto">{ENV_EXAMPLE}</pre>
                  <button onClick={() => copy(ENV_EXAMPLE)} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white">
                    <Icon name={copied ? 'Check' : 'Copy'} size={12} />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
            <h2 className="text-xl font-semibold">Запусти всё одной командой</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto">{`docker compose up -d

# Модель скачается автоматически (~18 GB, займёт время)
# Следить за прогрессом:
docker logs model-init -f`}</pre>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
            <h2 className="text-xl font-semibold">Создай API-ключ для клиента</h2>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 ml-11">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto">{QWEN_ADMIN}</pre>
                <button onClick={() => copy(QWEN_ADMIN)} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white">
                  <Icon name={copied ? 'Check' : 'Copy'} size={12} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Docker compose */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Container" size={20} className="text-red-500" fallback="Box" />
            docker-compose.yml
          </h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto max-h-80 leading-relaxed">{DOCKER_COMPOSE}</pre>
                <button onClick={() => copy(DOCKER_COMPOSE)} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white">
                  <Icon name={copied ? 'Check' : 'Copy'} size={12} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Client code */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Code" size={20} className="text-red-500" />
            Клиентский код (Python)
          </h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto leading-relaxed">{QWEN_PYTHON}</pre>
                <button onClick={() => copy(QWEN_PYTHON)} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white">
                  <Icon name={copied ? 'Check' : 'Copy'} size={12} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Qwen Code Agent */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="Terminal" size={20} className="text-red-500" />
            Qwen Code Agent — аналог Claude Code
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[
              { icon: 'FileCode', label: 'Чтение/запись файлов', desc: 'Работает с вашим кодом напрямую' },
              { icon: 'GitBranch', label: 'Git-интеграция', desc: 'status, diff, commit message' },
              { icon: 'Search', label: 'Поиск по коду', desc: 'grep по всему проекту' },
              { icon: 'Wrench', label: 'Рефакторинг', desc: 'Улучшает и объясняет изменения' },
              { icon: 'TestTube', label: 'Написание тестов', desc: 'Покрывает edge-cases', fallback: 'FlaskConical' },
              { icon: 'Terminal', label: 'Shell-команды', desc: 'Выполняет команды в workspace' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <Icon name={item.icon} size={16} className="text-red-400 mt-0.5 flex-shrink-0" fallback="Circle" />
                <div>
                  <p className="text-white text-sm font-medium">{item.label}</p>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="relative">
                <pre className="bg-zinc-800 rounded p-4 text-green-400 text-xs overflow-x-auto leading-relaxed">{QWEN_AGENT}</pre>
                <button onClick={() => copy(QWEN_AGENT)} className="absolute top-2 right-2 p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white">
                  <Icon name={copied ? 'Check' : 'Copy'} size={12} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features comparison */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon name="BarChart2" size={20} className="text-red-500" />
            Сравнение с оригинальным Claude Code
          </h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              {[
                { feature: 'Терминальный CLI', claude: true, qwen: true },
                { feature: 'Чтение/запись файлов', claude: true, qwen: true },
                { feature: 'Git-интеграция', claude: true, qwen: true },
                { feature: 'Code review', claude: true, qwen: true },
                { feature: 'Рефакторинг', claude: true, qwen: true },
                { feature: 'Выполнение команд', claude: true, qwen: true },
                { feature: 'Работа через свой API', claude: false, qwen: true },
                { feature: 'Локальная GGUF-модель', claude: false, qwen: true },
                { feature: 'Учёт токенов и биллинг', claude: false, qwen: true },
                { feature: 'Свои API-ключи клиентам', claude: false, qwen: true },
                { feature: 'Генерация изображений [IMAGE]', claude: false, qwen: true },
                { feature: 'Генерация видео [VIDEO]', claude: false, qwen: true },
              ].map((row, i) => (
                <div key={row.feature} className={`grid grid-cols-3 items-center px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-zinc-800' : ''}`}>
                  <span className="text-zinc-300">{row.feature}</span>
                  <span className="text-center">{row.claude ? '✅' : '❌'}</span>
                  <span className="text-center">{row.qwen ? '✅' : '❌'}</span>
                </div>
              ))}
              <div className="grid grid-cols-3 px-4 py-2 bg-zinc-800/50 text-xs text-zinc-500 border-t border-zinc-700">
                <span></span>
                <span className="text-center font-medium text-orange-400">Claude Code</span>
                <span className="text-center font-medium text-green-400">Qwen Code Agent</span>
              </div>
            </CardContent>
          </Card>
        </div>

        </>}

        {/* CTA */}
        <div className="bg-gradient-to-r from-red-500/10 to-zinc-900 border border-red-500/20 rounded-xl p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold font-orbitron">Готов начать?</h2>
          <p className="text-zinc-400">Зарегистрируйся и получи API-ключ за 30 секунд</p>
          <Button className="bg-red-500 hover:bg-red-600 text-white border-0 px-8" onClick={() => navigate('/login')}>
            Начать бесплатно
            <Icon name="ArrowRight" size={16} className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}