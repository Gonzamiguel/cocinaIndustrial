import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { getAuthApp, getDb } from '../lib/firebase'

export type UserRole = 'admin_cocina' | 'admin_deposito'

const USUARIOS_COLLECTION = 'usuarios'

function parseRol(raw: unknown): UserRole | null {
  if (raw === 'admin_cocina' || raw === 'admin_deposito') return raw
  return null
}

export type AuthContextValue = {
  user: User | null
  rol: UserRole | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getAuthApp()
    let cancelled = false

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser) {
        setRol(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const db = getDb()
        const snap = await getDoc(doc(db, USUARIOS_COLLECTION, nextUser.uid))
        if (cancelled) return
        if (!snap.exists()) {
          setRol(null)
          return
        }
        const data = snap.data() as Record<string, unknown>
        setRol(parseRol(data.rol))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut(getAuthApp())
    setRol(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      rol,
      loading,
      logout,
    }),
    [user, rol, loading, logout],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
