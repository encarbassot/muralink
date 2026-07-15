import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, type User } from './api.ts'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { setLoading(false); return }
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { token, user } = await api.auth.login(email, password)
    localStorage.setItem('token', token)
    setUser(user)
  }

  async function signup(email: string, password: string) {
    const { token, user } = await api.auth.signup(email, password)
    localStorage.setItem('token', token)
    setUser(user)
  }

  async function logout() {
    await api.auth.logout().catch(() => null)
    localStorage.removeItem('token')
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, login, signup, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
