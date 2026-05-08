import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import Icon from '@/components/ui/icon'
import { proxyApi } from '@/lib/api'

const PROXY_URL = 'https://functions.poehali.dev/db4455a3-fb31-4d3d-9fa5-4067e71d38b2'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  createdAt: number
}

const DEFAULT_MODEL = 'claude-sonnet-4'

function makeId() {
  return Math.random().toString(36).slice(2)
}

function saveConvos(convos: Conversation[]) {
  localStorage.setItem('deway_convos', JSON.stringify(convos))
}

function loadConvos(): Conversation[] {
  try { return JSON.parse(localStorage.getItem('deway_convos') || '[]') } catch { return [] }
}

export default function Chat() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('deway_user') || '{}')
  const apiKey = localStorage.getItem('deway_chat_key') || ''

  const [convos, setConvos] = useState<Conversation[]>(loadConvos)
  const [activeId, setActiveId] = useState<string | null>(convos[0]?.id || null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<{ id: string; provider: string }[]>([])
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [keyInput, setKeyInput] = useState(apiKey)
  const [showKeyModal, setShowKeyModal] = useState(!apiKey)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const active = convos.find(c => c.id === activeId) || null

  useEffect(() => {
    proxyApi.models().then(res => {
      if (res.data?.length) {
        setModels(res.data)
        setSelectedModel(res.data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages])

  const newConvo = () => {
    const c: Conversation = { id: makeId(), title: 'Новый чат', messages: [], model: selectedModel, createdAt: Date.now() }
    const updated = [c, ...convos]
    setConvos(updated)
    saveConvos(updated)
    setActiveId(c.id)
  }

  const deleteConvo = (id: string) => {
    const updated = convos.filter(c => c.id !== id)
    setConvos(updated)
    saveConvos(updated)
    if (activeId === id) setActiveId(updated[0]?.id || null)
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const key = localStorage.getItem('deway_chat_key')
    if (!key) { setShowKeyModal(true); return }

    let convo = active
    if (!convo) {
      convo = { id: makeId(), title: input.slice(0, 40), messages: [], model: selectedModel, createdAt: Date.now() }
    }

    const userMsg: Message = { id: makeId(), role: 'user', content: input.trim() }
    const updatedMessages = [...convo.messages, userMsg]
    const updatedConvo = { ...convo, messages: updatedMessages, title: convo.messages.length === 0 ? input.slice(0, 40) : convo.title }

    const updatedConvos = convos.find(c => c.id === convo!.id)
      ? convos.map(c => c.id === convo!.id ? updatedConvo : c)
      : [updatedConvo, ...convos]

    setConvos(updatedConvos)
    saveConvos(updatedConvos)
    setActiveId(updatedConvo.id)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || data.error?.message || 'Ошибка ответа'
      const assistantMsg: Message = { id: makeId(), role: 'assistant', content }
      const finalConvo = { ...updatedConvo, messages: [...updatedMessages, assistantMsg] }
      const finalConvos = updatedConvos.map(c => c.id === finalConvo.id ? finalConvo : c)
      setConvos(finalConvos)
      saveConvos(finalConvos)
    } catch {
      const errMsg: Message = { id: makeId(), role: 'assistant', content: 'Ошибка соединения с сервером.' }
      const finalConvo = { ...updatedConvo, messages: [...updatedMessages, errMsg] }
      const finalConvos = updatedConvos.map(c => c.id === finalConvo.id ? finalConvo : c)
      setConvos(finalConvos)
      saveConvos(finalConvos)
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  const saveKey = () => {
    localStorage.setItem('deway_chat_key', keyInput)
    setShowKeyModal(false)
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">

      {/* Key modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="Key" size={20} className="text-red-500" />
              <h2 className="text-lg font-semibold">Введи API-ключ</h2>
            </div>
            <p className="text-zinc-400 text-sm">Получи ключ в <button onClick={() => navigate('/dashboard')} className="text-red-400 hover:underline">Dashboard</button> и вставь сюда:</p>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500"
              placeholder="dw-xxxxxxxxxxxx"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
            />
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0" onClick={saveKey}>
                Сохранить
              </Button>
              {apiKey && (
                <Button variant="ghost" className="text-zinc-400" onClick={() => setShowKeyModal(false)}>
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-zinc-800 flex flex-col bg-zinc-900`}>
        <div className="p-3 flex items-center justify-between border-b border-zinc-800">
          <span className="font-orbitron font-bold text-sm">de<span className="text-red-500">way</span></span>
          <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white h-7 px-2" onClick={newConvo}>
            <Icon name="Plus" size={14} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {convos.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-4">Нет чатов</p>
          )}
          {convos.map(c => (
            <div
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm transition-colors ${activeId === c.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteConvo(c.id) }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 ml-1 flex-shrink-0"
              >
                <Icon name="Trash2" size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-zinc-800 space-y-1">
          <button onClick={() => navigate('/dashboard')} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs transition-colors">
            <Icon name="LayoutDashboard" size={14} />
            Dashboard
          </button>
          <button onClick={() => setShowKeyModal(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs transition-colors">
            <Icon name="Key" size={14} />
            API ключ
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-400 hover:text-white transition-colors">
            <Icon name="PanelLeft" size={18} />
          </button>
          <button onClick={newConvo} className="text-zinc-400 hover:text-white transition-colors">
            <Icon name="SquarePen" size={18} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-red-500"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 space-y-4">
              <h1 className="text-3xl font-bold font-orbitron">de<span className="text-red-500">way</span></h1>
              <p className="text-zinc-400 text-lg">Чем могу помочь?</p>
              <div className="grid grid-cols-2 gap-2 mt-4 max-w-md w-full">
                {[
                  'Напиши функцию на Python',
                  'Объясни как работает API',
                  'Помоги с промптом',
                  'Переведи текст на английский',
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors border border-zinc-700 hover:border-zinc-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {active.messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold font-orbitron">dw</span>
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-zinc-700 text-white rounded-br-sm'
                      : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="User" size={14} className="text-zinc-300" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold font-orbitron">dw</span>
                  </div>
                  <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-zinc-500 transition-colors">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
                placeholder="Напиши сообщение..."
                className="flex-1 bg-transparent border-0 resize-none text-white placeholder-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[200px] p-0 text-sm"
                rows={1}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 disabled:bg-zinc-600 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <Icon name="ArrowUp" size={16} className="text-white" />
              </button>
            </div>
            <p className="text-zinc-600 text-xs text-center mt-2">Enter — отправить · Shift+Enter — новая строка</p>
          </div>
        </div>
      </div>
    </div>
  )
}
