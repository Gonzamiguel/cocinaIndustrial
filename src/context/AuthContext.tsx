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
import {
  UBICACION_CAMPAMENTO_CASPOSO,
  UBICACION_COCINA_CENTRAL,
  UBICACION_DEPOSITO_CENTRAL,
} from '../lib/movimientosInventario'

export type UserRole =
  | 'admin_cocina'
  | 'admin_deposito'
  | 'admin_campamento'
  | 'jefe_campamento'
  | 'hoteleria_casposo'
  | 'terminal_comedor'
  | 'analista'
  | 'gerencia'

const USUARIOS_COLLECTION = 'usuarios'

const MSG_ERROR_PERFIL_USUARIO =
  'Error de acceso: Perfil de usuario no encontrado o sin permisos.'

function parseRol(raw: unknown): UserRole | null {
  if (
    raw === 'admin_cocina' ||
    raw === 'admin_deposito' ||
    raw === 'admin_campamento' ||
    raw === 'jefe_campamento' ||
    raw === 'hoteleria_casposo' ||
    raw === 'terminal_comedor' ||
    raw === 'analista' ||
    raw === 'gerencia'
  ) {
    return raw
  }
  return null
}

function parseUbicacionId(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.trim().toUpperCase()
}

export type AuthContextValue = {
  user: User | null
  rol: UserRole | null
  /** Sucursal asignada (campamento o cocina central); fallback según rol. */
  ubicacionId: string | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [rol, setRol] = useState<UserRole | null>(null)
  const [ubicacionId, setUbicacionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getAuthApp()
    let cancelled = false

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser) {
        setRol(null)
        setUbicacionId(null)
        setLoading(false)
        return
      }

      if (nextUser.isAnonymous) {
        setRol(null)
        setUbicacionId(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const db = getDb()
        const snap = await getDoc(doc(db, USUARIOS_COLLECTION, nextUser.uid))
        if (cancelled) return

        if (!snap.exists()) {
          console.error(MSG_ERROR_PERFIL_USUARIO)
          await signOut(auth)
          setRol(null)
          setUbicacionId(null)
          return
        }

        const data = snap.data() as Record<string, unknown>
        const r = parseRol(data.rol)
        if (!r) {
          console.error(MSG_ERROR_PERFIL_USUARIO)
          await signOut(auth)
          setRol(null)
          setUbicacionId(null)
          return
        }

        setRol(r)
        const ubic = parseUbicacionId(data.ubicacionId)
        if (r === 'admin_campamento' || r === 'jefe_campamento' || r === 'hoteleria_casposo') {
          setUbicacionId(ubic ?? UBICACION_CAMPAMENTO_CASPOSO)
        } else if (r === 'admin_cocina') {
          setUbicacionId(ubic ?? UBICACION_COCINA_CENTRAL)
        } else if (r === 'admin_deposito') {
          setUbicacionId(ubic ?? UBICACION_DEPOSITO_CENTRAL)
        } else {
          setUbicacionId(ubic)
        }
      } catch (err) {
        console.error(MSG_ERROR_PERFIL_USUARIO, err)
        if (!cancelled) {
          await signOut(auth)
          setRol(null)
          setUbicacionId(null)
        }
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
    setUbicacionId(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      rol,
      ubicacionId,
      loading,
      logout,
    }),
    [user, rol, ubicacionId, loading, logout],
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
