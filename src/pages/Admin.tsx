import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usageApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import Icon from '@/components/ui/icon'

interface DayData { day: string; requests: number; tokens: number; provider: string }
interface ModelData { model: string; provider: string; requests: number; tokens: number; avg_latency_ms: number }
interface UserData { id: number; email: string; role: string; is_active: boolean; keys_count: number; total_tokens: number; created_at: string }
interface Summary { total_requests: number; total_tokens: number; avg_latency_ms: number; active_keys: number; models_used: number }

export default function Admin() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('deway_user') || '{}')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byDay, setByDay] = useState<DayData[]>([])
  const [byModel, setByModel] = useState<ModelData[]>([])
  const [users, setUsers] = useState<UserData[]>([])
  const [logs, setLogs] = useState<Record<string, unknown>[]>([])
  const [tab, setTab] = useState<'overview' | 'models' | 'users' | 'logs'>('overview')

  useEffect(() => {
    if (!user.id || user.role !== 'admin') { navigate('/login'); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    const [s, d, m, u, l] = await Promise.all([
      usageApi.summary(30),
      usageApi.byDay(30),
      usageApi.byModel(30),
      usageApi.adminUsers(),
      usageApi.logs(100),
    ])
    if (s.summary) setSummary(s.summary)
    if (d.data) {
      const merged: Record<string, { day: string; requests: number; tokens: number }> = {}
      for (const item of d.data) {
        if (!merged[item.day]) merged[item.day] = { day: item.day, requests: 0, tokens: 0 }
        merged[item.day].requests += item.requests
        merged[item.day].tokens += item.tokens
      }
      setByDay(Object.values(merged))
    }
    if (m.data) setByModel(m.data)
    if (u.users) setUsers(u.users)
    if (l.logs) setLogs(l.logs)
  }

  const logout = () => {
    localStorage.removeItem('deway_user')
    localStorage.removeItem('deway_token')
    navigate('/login')
  }

  const TABS = [
    { id: 'overview', label: 'Обзор', icon: 'BarChart2' },
    { id: 'models', label: 'Модели', icon: 'Cpu' },
    { id: 'users', label: 'Пользователи', icon: 'Users' },
    { id: 'logs', label: 'Логи', icon: 'ScrollText' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-black/80 px-6 py-4 flex items-center justify-between">
        <h1 className="font-orbitron text-xl font-bold">
          de<span className="text-red-500">way</span>
          <span className="text-zinc-500 text-sm font-normal ml-2">Admin Panel</span>
        </h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:text-white" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={logout}>
            <Icon name="LogOut" size={16} />
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Запросов', value: summary.total_requests.toLocaleString(), icon: 'Zap', color: 'text-yellow-400' },
              { label: 'Токенов', value: (summary.total_tokens / 1000).toFixed(1) + 'K', icon: 'Hash', color: 'text-blue-400' },
              { label: 'Latency', value: summary.avg_latency_ms + 'ms', icon: 'Clock', color: 'text-green-400' },
              { label: 'Активных ключей', value: summary.active_keys, icon: 'Key', color: 'text-red-400' },
              { label: 'Моделей', value: summary.models_used, icon: 'Cpu', color: 'text-purple-400' },
            ].map((s, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name={s.icon as 'Zap'} size={14} className={s.color} />
                    <span className="text-zinc-400 text-xs">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-lg w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-red-500 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              <Icon name={t.icon as 'Zap'} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle className="text-white text-base">Запросы по дням</CardTitle></CardHeader>
              <CardContent>
                {byDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byDay}>
                      <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff' }} />
                      <Bar dataKey="requests" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-zinc-500 text-center py-8">Нет данных</p>}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader><CardTitle className="text-white text-base">Токены по дням</CardTitle></CardHeader>
              <CardContent>
                {byDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={byDay}>
                      <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff' }} />
                      <Line type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-zinc-500 text-center py-8">Нет данных</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Models */}
        {tab === 'models' && (
          <div className="space-y-3">
            {byModel.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">Нет данных</p>
            ) : byModel.map((m, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">{m.model}</span>
                      <Badge className={m.provider === 'anthropic' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}>
                        {m.provider}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-zinc-500">
                      <span>{m.requests} запросов</span>
                      <span>{(m.tokens / 1000).toFixed(1)}K токенов</span>
                      <span>{m.avg_latency_ms}ms avg</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">{m.requests}</div>
                    <div className="text-xs text-zinc-500">запросов</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">Нет пользователей</p>
            ) : users.map(u => (
              <Card key={u.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">{u.email}</span>
                      <Badge className={u.role === 'admin' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-zinc-700 text-zinc-400'}>
                        {u.role}
                      </Badge>
                      {!u.is_active && <Badge className="bg-zinc-800 text-zinc-500">disabled</Badge>}
                    </div>
                    <div className="flex gap-4 text-xs text-zinc-500">
                      <span>{u.keys_count} ключей</span>
                      <span>{(u.total_tokens / 1000).toFixed(1)}K токенов</span>
                      <span>с {new Date(u.created_at).toLocaleDateString('ru')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="text-left px-4 py-3">Время</th>
                      <th className="text-left px-4 py-3">Модель</th>
                      <th className="text-left px-4 py-3">Провайдер</th>
                      <th className="text-left px-4 py-3">Ключ</th>
                      <th className="text-right px-4 py-3">Токены</th>
                      <th className="text-right px-4 py-3">Latency</th>
                      <th className="text-right px-4 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-zinc-500 py-12">Нет логов</td></tr>
                    ) : logs.map(l => (
                      <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-400 text-xs">{new Date(l.created_at).toLocaleString('ru')}</td>
                        <td className="px-4 py-2 text-white font-mono text-xs">{l.model}</td>
                        <td className="px-4 py-2">
                          <Badge className={l.provider === 'anthropic' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs' : 'bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs'}>
                            {l.provider}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{l.key_prefix}••</td>
                        <td className="px-4 py-2 text-right text-zinc-300">{l.total_tokens}</td>
                        <td className="px-4 py-2 text-right text-zinc-400 text-xs">{l.latency_ms}ms</td>
                        <td className="px-4 py-2 text-right">
                          <span className={l.status_code === 200 ? 'text-green-400' : 'text-red-400'}>{l.status_code}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}