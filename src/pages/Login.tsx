import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = mode === 'login' ? authApi.login : authApi.register
      const res = await fn(email, password)
      if (res.error) { setError(res.error); return }
      localStorage.setItem('deway_user', JSON.stringify(res.user))
      localStorage.setItem('deway_token', res.token)
      navigate(res.user.role === 'admin' ? '/admin' : '/dashboard')
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-orbitron text-3xl font-bold text-white">
            de<span className="text-red-500">way</span>
          </h1>
          <p className="text-gray-400 mt-2">API Gateway</p>
        </div>

        <Card className="bg-zinc-900 border-red-500/20">
          <CardHeader>
            <CardTitle className="text-white">
              {mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {mode === 'login' ? 'Введите данные для входа' : 'Зарегистрируйтесь чтобы получить API-ключи'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Пароль</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-gray-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-red-500 hover:bg-red-600 text-white border-0"
              >
                {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </Button>
            </form>
            <p className="text-center text-gray-500 text-sm mt-4">
              {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
              <button
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
                className="text-red-400 hover:text-red-300"
              >
                {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
