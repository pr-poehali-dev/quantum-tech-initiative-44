import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keysApi, usageApi, proxyApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'

interface ApiKey {
  id: number
  key_prefix: string
  name: string
  is_active: boolean
  quota_tokens: number | null
  used_tokens: number
  rate_limit_rpm: number
  created_at: string
}

interface Summary {
  total_requests: number
  total_tokens: number
  avg_latency_ms: number
  active_keys: number
  models_used: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('deway_user') || '{}')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRpm, setNewKeyRpm] = useState(60)
  const [createdKey, setCreatedKey] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [models, setModels] = useState<{ id: string; provider: string }[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [codeLang, setCodeLang] = useState<'python' | 'js' | 'curl'>('python')

  useEffect(() => {
    if (!user.id) { navigate('/login'); return }
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const [keysRes, summaryRes, modelsRes] = await Promise.all([keysApi.list(), usageApi.summary(30), proxyApi.models()])
    if (keysRes.keys) setKeys(keysRes.keys)
    if (summaryRes.summary) setSummary(summaryRes.summary)
    if (modelsRes.data) {
      setModels(modelsRes.data)
      if (modelsRes.data.length > 0) setSelectedModel(modelsRes.data[0].id)
    }
    setLoading(false)
  }

  const createKey = async () => {
    const res = await keysApi.create({ name: newKeyName || 'My Key', rate_limit_rpm: newKeyRpm })
    if (res.key?.full_key) {
      setCreatedKey(res.key.full_key)
      load()
    }
  }

  const revokeKey = async (id: number) => {
    await keysApi.revoke(id)
    load()
  }

  const logout = () => {
    localStorage.removeItem('deway_user')
    localStorage.removeItem('deway_token')
    navigate('/login')
  }

  const copyKey = () => {
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const proxyUrl = 'https://functions.poehali.dev/db4455a3-fb31-4d3d-9fa5-4067e71d38b2'

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-black/80 px-6 py-4 flex items-center justify-between">
        <h1 className="font-orbitron text-xl font-bold">
          de<span className="text-red-500">way</span>
          <span className="text-zinc-500 text-sm font-normal ml-2">Dashboard</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400 text-sm">{user.email}</span>
          {user.role === 'admin' && (
            <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => navigate('/admin')}>
              Admin
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={logout}>
            <Icon name="LogOut" size={16} />
          </Button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Запросов (30д)', value: summary.total_requests.toLocaleString(), icon: 'Zap' },
              { label: 'Токенов (30д)', value: (summary.total_tokens / 1000).toFixed(1) + 'K', icon: 'Hash' },
              { label: 'Среднее время', value: summary.avg_latency_ms + 'ms', icon: 'Clock' },
              { label: 'Активных ключей', value: summary.active_keys, icon: 'Key' },
            ].map((s, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name={s.icon as 'Zap'} size={16} className="text-red-500" />
                    <span className="text-zinc-400 text-xs">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* API Endpoint info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Icon name="Globe" size={18} className="text-red-500" />
              Endpoint API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-zinc-400 text-xs mb-1">Base URL</p>
              <code className="block bg-zinc-800 text-green-400 px-3 py-2 rounded text-sm font-mono break-all">
                {proxyUrl}
              </code>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-800 rounded p-3">
                <p className="text-zinc-400 text-xs mb-1">Chat Completions</p>
                <code className="text-blue-400">POST /v1/chat/completions</code>
              </div>
              <div className="bg-zinc-800 rounded p-3">
                <p className="text-zinc-400 text-xs mb-1">Список моделей</p>
                <code className="text-blue-400">GET /v1/models</code>
              </div>
            </div>
            <div className="bg-zinc-800 rounded p-3">
              <p className="text-zinc-400 text-xs mb-1">Пример запроса</p>
              <pre className="text-green-400 text-xs overflow-x-auto">{`curl ${proxyUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dw-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"Привет!"}]}'`}</pre>
            </div>
          </CardContent>
        </Card>

        {/* Models */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Icon name="Cpu" size={18} className="text-red-500" />
              Доступные модели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {models.length === 0 && !loading && (
              <p className="text-zinc-500 text-sm">Нет доступных моделей</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(selectedModel === m.id ? null : m.id)}
                  className={`flex items-center justify-between rounded px-3 py-2 gap-3 text-left transition-colors border ${
                    selectedModel === m.id
                      ? 'bg-red-500/10 border-red-500/40'
                      : 'bg-zinc-800 border-transparent hover:border-zinc-600'
                  }`}
                >
                  <code className="text-white text-xs font-mono">{m.id}</code>
                  <Badge className={m.provider === 'anthropic'
                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 flex-shrink-0 text-xs'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20 flex-shrink-0 text-xs'
                  }>
                    {m.provider}
                  </Badge>
                </button>
              ))}
            </div>

            {/* Code example for selected model */}
            {selectedModel && (
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                  <span className="text-zinc-400 text-xs">Подключение: <code className="text-green-400">{selectedModel}</code></span>
                  <div className="flex gap-1">
                    {(['python', 'js', 'curl'] as const).map(l => (
                      <button key={l} onClick={() => setCodeLang(l)}
                        className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${codeLang === l ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
                        {l === 'js' ? 'node' : l}
                      </button>
                    ))}
                  </div>
                </div>
                <pre className="bg-zinc-950 text-green-400 text-xs p-4 overflow-x-auto leading-relaxed">
                  {codeLang === 'python' && `from openai import OpenAI

client = OpenAI(
    api_key="dw-YOUR_KEY",
    base_url="${proxyUrl}/v1"
)

response = client.chat.completions.create(
    model="${selectedModel}",
    messages=[{"role": "user", "content": "Привет!"}]
)
print(response.choices[0].message.content)`}
                  {codeLang === 'js' && `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'dw-YOUR_KEY',
  baseURL: '${proxyUrl}/v1',
});

const response = await client.chat.completions.create({
  model: '${selectedModel}',
  messages: [{ role: 'user', content: 'Привет!' }],
});
console.log(response.choices[0].message.content);`}
                  {codeLang === 'curl' && `curl ${proxyUrl}/v1/chat/completions \\
  -H "Authorization: Bearer dw-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${selectedModel}",
    "messages": [{"role": "user", "content": "Привет!"}]
  }'`}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quickstart */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Icon name="BookOpen" size={18} className="text-red-500" />
                Быстрый старт
              </span>
              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 text-xs" onClick={() => navigate('/docs')}>
                Полная документация →
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-zinc-400 text-sm">deway совместим с OpenAI SDK — просто замени <code className="text-green-400 bg-zinc-800 px-1 rounded">base_url</code>:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-zinc-800 rounded p-3 space-y-2">
                <p className="text-zinc-400 text-xs font-medium">Python</p>
                <pre className="text-green-400 text-xs overflow-x-auto leading-relaxed">{`from openai import OpenAI
client = OpenAI(
    api_key="dw-YOUR_KEY",
    base_url="${proxyUrl}/v1"
)
resp = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role":"user","content":"Привет!"}]
)`}</pre>
              </div>
              <div className="bg-zinc-800 rounded p-3 space-y-2">
                <p className="text-zinc-400 text-xs font-medium">Node.js</p>
                <pre className="text-green-400 text-xs overflow-x-auto leading-relaxed">{`import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: 'dw-YOUR_KEY',
  baseURL: '${proxyUrl}/v1',
});
const resp = await client.chat.completions.create({
  model: 'claude-sonnet-4',
  messages: [{role:'user',content:'Привет!'}],
});`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">API Ключи</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-red-500 hover:bg-red-600 text-white border-0" onClick={() => { setCreatedKey(''); setNewKeyName('') }}>
                  <Icon name="Plus" size={16} className="mr-2" />
                  Создать ключ
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
                <DialogHeader>
                  <DialogTitle>Новый API-ключ</DialogTitle>
                </DialogHeader>
                {!createdKey ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300">Название</Label>
                      <Input
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder="Мой проект"
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300">Лимит запросов в минуту</Label>
                      <Input
                        type="number"
                        value={newKeyRpm}
                        onChange={e => setNewKeyRpm(Number(e.target.value))}
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>
                    <Button onClick={createKey} className="w-full bg-red-500 hover:bg-red-600 text-white border-0">
                      Создать
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-green-950 border border-green-500/30 rounded p-4">
                      <p className="text-green-400 text-sm mb-2 flex items-center gap-2">
                        <Icon name="CheckCircle" size={16} />
                        Ключ создан! Сохраните его — он больше не будет показан.
                      </p>
                      <code className="text-green-300 text-xs break-all font-mono">{createdKey}</code>
                    </div>
                    <Button onClick={copyKey} variant="outline" className="w-full border-zinc-700 text-white hover:bg-zinc-800">
                      <Icon name={copied ? 'Check' : 'Copy'} size={16} className="mr-2" />
                      {copied ? 'Скопировано!' : 'Копировать ключ'}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-zinc-400 text-center py-12">Загрузка...</div>
          ) : keys.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800 border-dashed">
              <CardContent className="py-12 text-center">
                <Icon name="Key" size={40} className="text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">Нет API-ключей. Создайте первый!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {keys.map(k => (
                <Card key={k.id} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{k.name}</span>
                        <Badge variant={k.is_active ? 'default' : 'secondary'} className={k.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-700 text-zinc-400'}>
                          {k.is_active ? 'Активен' : 'Отозван'}
                        </Badge>
                      </div>
                      <code className="text-zinc-400 text-sm font-mono">{k.key_prefix}••••••••</code>
                      <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                        <span><Icon name="Zap" size={12} className="inline mr-1" />{k.used_tokens.toLocaleString()} токенов</span>
                        <span><Icon name="Clock" size={12} className="inline mr-1" />{k.rate_limit_rpm} RPM</span>
                        {k.quota_tokens && <span><Icon name="BarChart2" size={12} className="inline mr-1" />Квота: {k.quota_tokens.toLocaleString()}</span>}
                      </div>
                    </div>
                    {k.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                        onClick={() => revokeKey(k.id)}
                      >
                        <Icon name="Trash2" size={16} />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}