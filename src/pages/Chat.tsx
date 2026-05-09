import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import Icon from '@/components/ui/icon'
import { proxyApi } from '@/lib/api'

const PROXY_URL = 'https://functions.poehali.dev/db4455a3-fb31-4d3d-9fa5-4067e71d38b2'

type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ApiMessage = {
  role: string
  content: string | ApiContentPart[]
}

interface Attachment {
  id: string
  name: string
  type: 'image' | 'text' | 'file'
  mimeType: string
  data: string
  size: number
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
  createdAt: number
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  systemPrompt: string
  createdAt: number
}

const DEFAULT_MODEL = 'claude-sonnet-4-5'
const STARTERS = [
  'Напиши функцию сортировки на Python',
  'Объясни как работает REST API',
  'Придумай 5 идей для стартапа',
  'Переведи текст на английский',
  'Помоги составить деловое письмо',
  'Что такое машинное обучение?',
]

const MAX_FILE_MB = 10
const ACCEPTED = 'image/*,text/*,.pdf,.json,.csv,.md,.ts,.tsx,.js,.jsx,.py,.sql,.yaml,.yml,.xml,.html,.css'

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function saveConvos(convos: Conversation[]) {
  try { localStorage.setItem('deway_convos', JSON.stringify(convos)) } catch (_e) { /* ignore */ }
}

function loadConvos(): Conversation[] {
  try { return JSON.parse(localStorage.getItem('deway_convos') || '[]') } catch (_e) { return [] }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const lang = className?.replace('language-', '') || 'text'
  const copy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-zinc-700">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-mono">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
          <Icon name={copied ? 'Check' : 'Copy'} size={12} />
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 bg-zinc-900 text-sm">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

function ImageTag({ prompt }: { prompt: string }) {
  return (
    <div className="my-3 border border-purple-500/30 rounded-xl bg-purple-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-purple-400 text-xs font-semibold uppercase tracking-wider">Изображение</span>
        <span className="text-zinc-600 text-xs">— описание для генерации</span>
      </div>
      <p className="text-zinc-300 text-sm italic leading-relaxed">{prompt.trim()}</p>
      <p className="text-zinc-600 text-xs mt-2">Подключи Flux / DALL-E / Midjourney для генерации по этому промпту</p>
    </div>
  )
}

function VideoTag({ prompt }: { prompt: string }) {
  return (
    <div className="my-3 border border-blue-500/30 rounded-xl bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Видео</span>
        <span className="text-zinc-600 text-xs">— описание для генерации</span>
      </div>
      <p className="text-zinc-300 text-sm italic leading-relaxed">{prompt.trim()}</p>
      <p className="text-zinc-600 text-xs mt-2">Подключи Kling / Sora / Wan для генерации по этому описанию</p>
    </div>
  )
}

function parseContentParts(content: string): Array<{ type: 'text' | 'image' | 'video'; value: string }> {
  const parts: Array<{ type: 'text' | 'image' | 'video'; value: string }> = []
  const regex = /\[IMAGE\]([\s\S]*?)\[\/IMAGE\]|\[VIDEO\]([\s\S]*?)\[\/VIDEO\]/g
  let last = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: content.slice(last, match.index) })
    if (match[1] !== undefined) parts.push({ type: 'image', value: match[1] })
    else if (match[2] !== undefined) parts.push({ type: 'video', value: match[2] })
    last = match.index + match[0].length
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) })
  return parts
}

function MessageContent({ content }: { content: string }) {
  const parts = parseContentParts(content)
  return (
    <div>
      {parts.map((part, i) => {
        if (part.type === 'image') return <ImageTag key={i} prompt={part.value} />
        if (part.type === 'video') return <VideoTag key={i} prompt={part.value} />
        if (!part.value.trim()) return null
        return (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeKatex]}
            components={{
              code({ className, children }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) {
                const isBlock = className?.startsWith('language-')
                if (isBlock) return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>
                return <code className="bg-zinc-700 text-red-300 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
              },
              p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="leading-6">{children}</li>,
              h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-4">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
              blockquote: ({ children }) => <blockquote className="border-l-4 border-red-500 pl-4 my-3 text-zinc-400 italic">{children}</blockquote>,
              table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-sm">{children}</table></div>,
              th: ({ children }) => <th className="border border-zinc-600 px-3 py-2 bg-zinc-800 text-left font-semibold">{children}</th>,
              td: ({ children }) => <td className="border border-zinc-600 px-3 py-2">{children}</td>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">{children}</a>,
              hr: () => <hr className="border-zinc-700 my-4" />,
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
            }}
          >
            {part.value}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}

function AttachmentPreview({ att, onRemove }: { att: Attachment; onRemove?: () => void }) {
  if (att.type === 'image') {
    return (
      <div className="relative group inline-block">
        <img src={att.data} alt={att.name} className="max-h-48 max-w-xs rounded-xl border border-zinc-700 object-cover" />
        {onRemove && (
          <button onClick={onRemove} className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Icon name="X" size={10} className="text-white" />
          </button>
        )}
        <div className="text-xs text-zinc-500 mt-1 truncate max-w-xs">{att.name} · {formatBytes(att.size)}</div>
      </div>
    )
  }
  return (
    <div className="relative group flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm max-w-xs">
      <Icon name="FileText" size={16} className="text-zinc-400 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-zinc-200 truncate text-xs font-medium">{att.name}</div>
        <div className="text-zinc-500 text-xs">{formatBytes(att.size)}</div>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="ml-auto text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0">
          <Icon name="X" size={13} />
        </button>
      )}
    </div>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const apiKey = localStorage.getItem('deway_chat_key') || ''

  const [convos, setConvos] = useState<Conversation[]>(loadConvos)
  const [activeId, setActiveId] = useState<string | null>(() => loadConvos()[0]?.id || null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [models, setModels] = useState<{ id: string }[]>([])
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [keyInput, setKeyInput] = useState(apiKey)
  const [showKeyModal, setShowKeyModal] = useState(!apiKey)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingMsgContent, setEditingMsgContent] = useState('')
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = convos.find(c => c.id === activeId) || null
  const filteredConvos = convos.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(search.toLowerCase()))
  )

  useEffect(() => {
    proxyApi.models().then(res => {
      if (res.data?.length) {
        setModels(res.data)
        const hasSonnet = res.data.find((m: { id: string }) => m.id.includes('sonnet'))
        setSelectedModel(hasSonnet ? hasSonnet.id : res.data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages, streamingContent])

  useEffect(() => {
    if (active?.systemPrompt !== undefined) setSystemPrompt(active.systemPrompt)
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateConvos = useCallback((updated: Conversation[]) => {
    setConvos(updated)
    saveConvos(updated)
  }, [])

  const processFile = (file: File): Promise<Attachment | null> => {
    return new Promise(resolve => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setFileError(`Файл "${file.name}" превышает ${MAX_FILE_MB} МБ`)
        setTimeout(() => setFileError(''), 4000)
        resolve(null)
        return
      }
      const reader = new FileReader()
      const isImage = file.type.startsWith('image/')
      reader.onload = e => {
        const result = e.target?.result
        const data = typeof result === 'string' ? result : ''
        resolve({
          id: makeId(),
          name: file.name,
          type: isImage ? 'image' : 'text',
          mimeType: file.type,
          data,
          size: file.size,
        })
      }
      if (isImage) reader.readAsDataURL(file)
      else reader.readAsText(file)
    })
  }

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const results = await Promise.all(arr.map(processFile))
    const valid = results.filter(Boolean) as Attachment[]
    setAttachments(prev => [...prev, ...valid])
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const files = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean) as File[]
    if (files.length) addFiles(files)
  }

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id))

  const buildApiContent = (text: string, atts: Attachment[]): string | ApiContentPart[] => {
    if (!atts.length) return text
    const imageAtts = atts.filter(a => a.type === 'image')
    const textAtts = atts.filter(a => a.type !== 'image')
    const parts: ApiContentPart[] = []
    if (text) parts.push({ type: 'text', text })
    for (const att of imageAtts) {
      const base64 = att.data.split(',')[1]
      parts.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${base64}` } })
    }
    for (const att of textAtts) {
      parts.push({ type: 'text', text: `\n\n[Файл: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\`` })
    }
    return parts
  }

  const newConvo = () => {
    const c: Conversation = { id: makeId(), title: 'Новый чат', messages: [], model: selectedModel, systemPrompt: '', createdAt: Date.now() }
    updateConvos([c, ...convos])
    setActiveId(c.id)
    setSystemPrompt('')
    setInput('')
    setAttachments([])
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const deleteConvo = (id: string) => {
    const updated = convos.filter(c => c.id !== id)
    updateConvos(updated)
    if (activeId === id) setActiveId(updated[0]?.id || null)
  }

  const startRename = (c: Conversation) => { setEditingId(c.id); setEditingTitle(c.title) }

  const saveRename = () => {
    if (!editingId) return
    updateConvos(convos.map(c => c.id === editingId ? { ...c, title: editingTitle || c.title } : c))
    setEditingId(null)
  }

  const copyMsg = (msg: Message) => {
    navigator.clipboard.writeText(msg.content)
    setCopiedMsgId(msg.id)
    setTimeout(() => setCopiedMsgId(null), 2000)
  }

  const startEditMsg = (msg: Message) => { setEditingMsgId(msg.id); setEditingMsgContent(msg.content) }

  const saveEditMsg = (convo: Conversation, msgId: string) => {
    const idx = convo.messages.findIndex(m => m.id === msgId)
    if (idx === -1) return
    const newMessages = convo.messages.slice(0, idx + 1).map(m => m.id === msgId ? { ...m, content: editingMsgContent } : m)
    const updated = convos.map(c => c.id === convo.id ? { ...c, messages: newMessages } : c)
    updateConvos(updated)
    setEditingMsgId(null)
    sendFromMessages(newMessages, convo, updated)
  }

  const regenerate = (convo: Conversation) => {
    const lastUser = [...convo.messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    const idx = convo.messages.findIndex(m => m.id === lastUser.id)
    const truncated = convo.messages.slice(0, idx + 1)
    const updated = convos.map(c => c.id === convo.id ? { ...c, messages: truncated } : c)
    updateConvos(updated)
    sendFromMessages(truncated, convo, updated)
  }

  const exportChat = (convo: Conversation) => {
    const text = convo.messages.filter(m => m.role !== 'system')
      .map(m => `**${m.role === 'user' ? 'Вы' : 'Ассистент'}:**\n${m.content}`).join('\n\n---\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${convo.title}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const saveSystemPrompt = () => {
    if (!active) return
    updateConvos(convos.map(c => c.id === active.id ? { ...c, systemPrompt } : c))
    setShowSystemPrompt(false)
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setLoading(false)
    if (streamingContent && active) {
      const msg: Message = { id: makeId(), role: 'assistant', content: streamingContent, createdAt: Date.now() }
      updateConvos(convos.map(c => c.id === active.id ? { ...c, messages: [...c.messages, msg] } : c))
      setStreamingContent('')
    }
  }

  const sendFromMessages = async (messages: Message[], convo: Conversation, currentConvos: Conversation[]) => {
    const key = localStorage.getItem('deway_chat_key')
    if (!key) { setShowKeyModal(true); return }
    setLoading(true)
    setStreamingContent('')
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const sysMsg: ApiMessage[] = convo.systemPrompt ? [{ role: 'system', content: convo.systemPrompt }] : []
    const apiMessages: ApiMessage[] = [
      ...sysMsg,
      ...messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.attachments?.length ? buildApiContent(m.content, m.attachments) : m.content
      }))
    ]

    try {
      const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: convo.model || selectedModel, messages: apiMessages, stream: true }),
        signal: ctrl.signal
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Ошибка сервера' } }))
        throw new Error(err.error?.message || 'Ошибка сервера')
      }
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let full = ''
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const json = JSON.parse(data)
              full += json.choices?.[0]?.delta?.content || ''
              setStreamingContent(full)
            } catch (_e) { /* skip */ }
          }
        }
      }
      const assistantMsg: Message = { id: makeId(), role: 'assistant', content: full || 'Нет ответа', createdAt: Date.now() }
      updateConvos(currentConvos.map(c => c.id === convo.id ? { ...c, messages: [...messages, assistantMsg] } : c))
      setStreamingContent('')
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : 'Соединение прервано'
      const errMsg: Message = { id: makeId(), role: 'assistant', content: `Ошибка: ${msg}`, createdAt: Date.now() }
      updateConvos(currentConvos.map(c => c.id === convo.id ? { ...c, messages: [...messages, errMsg] } : c))
      setStreamingContent('')
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    if ((!input.trim() && !attachments.length) || loading) return
    const key = localStorage.getItem('deway_chat_key')
    if (!key) { setShowKeyModal(true); return }

    let convo = active
    let currentConvos = convos

    if (!convo) {
      convo = { id: makeId(), title: input.slice(0, 50) || attachments[0]?.name || 'Новый чат', messages: [], model: selectedModel, systemPrompt, createdAt: Date.now() }
      currentConvos = [convo, ...convos]
      updateConvos(currentConvos)
      setActiveId(convo.id)
    }

    const userMsg: Message = { id: makeId(), role: 'user', content: input.trim(), attachments: attachments.length ? attachments : undefined, createdAt: Date.now() }
    const newMessages = [...convo.messages, userMsg]
    const title = convo.messages.length === 0 ? (input.slice(0, 50) || attachments[0]?.name || 'Новый чат') : convo.title
    const updatedConvo = { ...convo, messages: newMessages, title, model: selectedModel }
    const updatedConvos = currentConvos.map(c => c.id === updatedConvo.id ? updatedConvo : c)
    updateConvos(updatedConvos)
    setInput('')
    setAttachments([])
    sendFromMessages(newMessages, updatedConvo, updatedConvos)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const saveKey = () => { localStorage.setItem('deway_chat_key', keyInput.trim()); setShowKeyModal(false) }

  const adjustTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  return (
    <div
      className="flex h-screen bg-zinc-950 text-white overflow-hidden font-geist"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-red-500/10 border-2 border-dashed border-red-500 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Icon name="Upload" size={40} className="text-red-400 mx-auto mb-3" />
            <p className="text-red-300 text-lg font-medium">Перетащи файл сюда</p>
          </div>
        </div>
      )}

      {/* API Key modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Icon name="Key" size={20} className="text-red-400" />
              </div>
              <div>
                <h2 className="font-semibold text-base">API-ключ deway</h2>
                <p className="text-zinc-500 text-xs">Нужен для отправки запросов</p>
              </div>
            </div>
            <p className="text-zinc-400 text-sm">
              Получи ключ в{' '}
              <button onClick={() => navigate('/dashboard')} className="text-red-400 hover:underline">Dashboard</button>
              {' '}→ API-ключи
            </p>
            <input
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-red-500 transition-colors"
              placeholder="dw-xxxxxxxxxxxx"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
            />
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0 rounded-xl" onClick={saveKey} disabled={!keyInput.trim()}>Сохранить и войти</Button>
              {apiKey && <Button variant="ghost" className="text-zinc-400 rounded-xl" onClick={() => setShowKeyModal(false)}>Отмена</Button>}
            </div>
          </div>
        </div>
      )}

      {/* System prompt modal */}
      {showSystemPrompt && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="Settings2" size={18} className="text-zinc-400" />
                <h2 className="font-semibold">System prompt</h2>
              </div>
              <button onClick={() => setShowSystemPrompt(false)} className="text-zinc-500 hover:text-white"><Icon name="X" size={18} /></button>
            </div>
            <p className="text-zinc-500 text-sm">Инструкция для модели — как она должна себя вести в этом чате</p>
            <Textarea
              autoFocus
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="Ты — опытный Python разработчик. Отвечай кратко и по делу..."
              className="min-h-[140px] bg-zinc-800 border-zinc-700 text-white placeholder-zinc-600 focus-visible:ring-red-500/50 rounded-xl resize-none"
            />
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0 rounded-xl" onClick={saveSystemPrompt}>Сохранить</Button>
              <Button variant="ghost" className="text-zinc-400 rounded-xl" onClick={() => { setSystemPrompt(''); saveSystemPrompt() }}>Очистить</Button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-zinc-800 flex flex-col bg-zinc-900/50`}>
        <div className="p-3 flex items-center gap-2 border-b border-zinc-800">
          <span className="font-orbitron font-bold text-sm flex-1">de<span className="text-red-500">way</span></span>
          <button onClick={newConvo} title="Новый чат" className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <Icon name="SquarePen" size={15} />
          </button>
        </div>
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center gap-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-1.5">
            <Icon name="Search" size={13} className="text-zinc-500 flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск чатов..." className="flex-1 bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none" />
            {search && <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300"><Icon name="X" size={11} /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {filteredConvos.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-6">{search ? 'Ничего не найдено' : 'Нет чатов'}</p>
          )}
          {filteredConvos.map(c => (
            <div key={c.id} onClick={() => setActiveId(c.id)}
              className={`group flex items-center gap-1 px-2 py-2 rounded-lg cursor-pointer transition-colors ${activeId === c.id ? 'bg-zinc-700/80 text-white' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}`}>
              {editingId === c.id ? (
                <input autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)}
                  onBlur={saveRename} onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null) }}
                  onClick={e => e.stopPropagation()} className="flex-1 bg-zinc-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none" />
              ) : (
                <span className="flex-1 truncate text-xs">{c.title}</span>
              )}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); startRename(c) }} className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200">
                  <Icon name="Pencil" size={11} />
                </button>
                <button onClick={e => { e.stopPropagation(); exportChat(c) }} className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200">
                  <Icon name="Download" size={11} />
                </button>
                <button onClick={e => { e.stopPropagation(); deleteConvo(c.id) }} className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400">
                  <Icon name="Trash2" size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-zinc-800 space-y-0.5">
          <button onClick={() => navigate('/dashboard')} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 text-xs transition-colors">
            <Icon name="LayoutDashboard" size={14} />Dashboard
          </button>
          <button onClick={() => setShowKeyModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 text-xs transition-colors">
            <Icon name="Key" size={14} />API-ключ
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors">
            <Icon name="PanelLeft" size={17} />
          </button>
          <button onClick={newConvo} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors">
            <Icon name="SquarePen" size={17} />
          </button>
          {active && <span className="text-sm text-zinc-400 truncate flex-1 ml-1">{active.title}</span>}
          <div className="ml-auto flex items-center gap-2">
            {active && (
              <button onClick={() => { setShowSystemPrompt(true); setSystemPrompt(active.systemPrompt || '') }}
                className={`p-1.5 rounded-lg transition-colors text-sm flex items-center gap-1.5 ${active.systemPrompt ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                <Icon name="Settings2" size={15} />
                {active.systemPrompt && <span className="text-xs">Prompt</span>}
              </button>
            )}
            <div className="relative">
              <button onClick={() => setShowModelSelect(!showModelSelect)}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs rounded-lg px-3 py-1.5 transition-colors">
                <span className="max-w-[160px] truncate">{selectedModel}</span>
                <Icon name="ChevronDown" size={12} className="text-zinc-400 flex-shrink-0" />
              </button>
              {showModelSelect && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowModelSelect(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-40 min-w-[220px] py-1 overflow-hidden">
                    {models.map(m => (
                      <button key={m.id} onClick={() => { setSelectedModel(m.id); setShowModelSelect(false) }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors flex items-center justify-between ${selectedModel === m.id ? 'text-white' : 'text-zinc-300'}`}>
                        <span className="truncate">{m.id}</span>
                        {selectedModel === m.id && <Icon name="Check" size={12} className="text-red-400 flex-shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 space-y-6">
              <div>
                <h1 className="text-4xl font-bold font-orbitron mb-2">de<span className="text-red-500">way</span></h1>
                <p className="text-zinc-400 text-lg">Чем могу помочь сегодня?</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl w-full">
                {STARTERS.map(s => (
                  <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus() }}
                    className="text-left px-3 py-3 bg-zinc-800/60 hover:bg-zinc-700/60 rounded-xl text-sm text-zinc-300 transition-colors border border-zinc-700/50 hover:border-zinc-600">
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-zinc-600 text-xs">Или перетащи файл / изображение прямо в окно чата</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {active.messages.filter(m => m.role !== 'system').map((msg, idx) => (
                <div key={msg.id} className={`group flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-red-900/30">
                      <span className="text-white text-[10px] font-bold font-orbitron">dw</span>
                    </div>
                  )}
                  <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end max-w-[80%]' : 'items-start flex-1 min-w-0'}`}>
                    {/* Attachments preview */}
                    {msg.attachments?.length ? (
                      <div className={`flex flex-wrap gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.attachments.map(att => <AttachmentPreview key={att.id} att={att} />)}
                      </div>
                    ) : null}
                    {/* Message bubble */}
                    {(msg.content || msg.role === 'assistant') && (
                      editingMsgId === msg.id ? (
                        <div className="w-full space-y-2">
                          <Textarea autoFocus value={editingMsgContent} onChange={e => setEditingMsgContent(e.target.value)}
                            className="w-full bg-zinc-700 border-zinc-600 text-white resize-none rounded-xl min-h-[80px]" />
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0 h-7 text-xs rounded-lg" onClick={() => saveEditMsg(active, msg.id)}>Отправить снова</Button>
                            <Button size="sm" variant="ghost" className="text-zinc-400 h-7 text-xs rounded-lg" onClick={() => setEditingMsgId(null)}>Отмена</Button>
                          </div>
                        </div>
                      ) : (
                        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-700 text-white rounded-br-sm' : 'text-zinc-100'}`}>
                          {msg.role === 'assistant' ? <MessageContent content={msg.content} /> : <span className="whitespace-pre-wrap">{msg.content}</span>}
                        </div>
                      )
                    )}
                    {/* Actions */}
                    {editingMsgId !== msg.id && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => copyMsg(msg)} className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 transition-colors">
                          <Icon name={copiedMsgId === msg.id ? 'Check' : 'Copy'} size={13} />
                        </button>
                        {msg.role === 'user' && (
                          <button onClick={() => startEditMsg(msg)} className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 transition-colors">
                            <Icon name="Pencil" size={13} />
                          </button>
                        )}
                        {msg.role === 'assistant' && idx === active.messages.filter(m => m.role !== 'system').length - 1 && (
                          <button onClick={() => regenerate(active)} className="w-6 h-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 transition-colors">
                            <Icon name="RefreshCw" size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="User" size={14} className="text-zinc-300" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming */}
              {loading && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-red-900/30">
                    <span className="text-white text-[10px] font-bold font-orbitron">dw</span>
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-zinc-100 leading-relaxed">
                    {streamingContent ? <MessageContent content={streamingContent + '▌'} /> : (
                      <div className="flex gap-1 items-center h-8">
                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          {fileError && (
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-red-400">
              <Icon name="AlertCircle" size={14} />
              {fileError}
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 pt-3 pb-2 focus-within:border-zinc-500 transition-colors shadow-lg">
              {/* Attachments in input */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-zinc-700/50">
                  {attachments.map(att => <AttachmentPreview key={att.id} att={att} onRemove={() => removeAttachment(att.id)} />)}
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={adjustTextarea}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                onPaste={handlePaste}
                placeholder="Напиши сообщение..."
                className="w-full bg-transparent border-0 resize-none text-white placeholder-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-sm leading-relaxed min-h-[24px] max-h-[200px] overflow-y-auto"
                rows={1}
                disabled={loading}
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-700/50">
                <div className="flex items-center gap-1">
                  {/* Attach file */}
                  <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple onChange={handleFileInput} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 text-xs transition-colors">
                    <Icon name="Paperclip" size={14} />
                    <span>Файл</span>
                  </button>
                  <button onClick={() => { setShowSystemPrompt(true); setSystemPrompt(active?.systemPrompt || '') }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${active?.systemPrompt ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'}`}>
                    <Icon name="Settings2" size={13} />
                    <span>Инструкция</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs hidden sm:block">Enter — отправить · Shift+Enter — перенос</span>
                  {loading ? (
                    <button onClick={stopGeneration} className="w-8 h-8 rounded-full bg-zinc-600 hover:bg-zinc-500 flex items-center justify-center transition-colors">
                      <Icon name="Square" size={14} className="text-white" />
                    </button>
                  ) : (
                    <button onClick={send} disabled={!input.trim() && !attachments.length}
                      className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 disabled:bg-zinc-600 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
                      <Icon name="ArrowUp" size={16} className="text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}