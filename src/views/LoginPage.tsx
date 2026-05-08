import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth, type UserRole } from '../context/AuthContext'
import { getAuthApp, getDb } from '../lib/firebase'

function parseRol(raw: unknown): UserRole | null {
  if (raw === 'admin_cocina' || raw === 'admin_deposito') return raw
  return null
}

export function LoginPage() {
  const { user, rol, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== '/login'
      ? (location.state as { from: string }).from
      : null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (user && rol) {
      navigate(
        rol === 'admin_cocina' ? '/admin/pedidos' : '/deposito/solicitudes',
        { replace: true },
      )
    }
  }, [authLoading, user, rol, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const auth = getAuthApp()
    const trimmed = email.trim()
    if (!trimmed || !password) {
      setError('Completá email y contraseña.')
      return
    }

    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmed, password)
      const snap = await getDoc(doc(getDb(), 'usuarios', cred.user.uid))
      const rolLeído = snap.exists()
        ? parseRol((snap.data() as Record<string, unknown>).rol)
        : null

      if (!rolLeído) {
        await signOut(auth)
        setError(
          'Tu cuenta no tiene un rol asignado en el sistema. Consultá al administrador.',
        )
        return
      }

      if (from === '/admin' || from?.startsWith('/admin/')) {
        if (rolLeído !== 'admin_cocina') {
          await signOut(auth)
          setError('No tenés permiso para acceder a esa sección.')
          return
        }
        navigate(from, { replace: true })
        return
      }
      if (from === '/deposito' || from?.startsWith('/deposito/')) {
        if (rolLeído !== 'admin_deposito') {
          await signOut(auth)
          setError('No tenés permiso para acceder a esa sección.')
          return
        }
        navigate(from, { replace: true })
        return
      }

      if (rolLeído === 'admin_cocina') {
        navigate('/admin/pedidos', { replace: true })
      } else {
        navigate('/deposito/solicitudes', { replace: true })
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : ''
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError('Email o contraseña incorrectos.')
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Probá más tarde.')
      } else {
        setError('No se pudo iniciar sesión. Intentá de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#003366] border-t-transparent"
          aria-hidden
        />
      </div>
    )
  }

  if (user && !rol) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6">
        <p className="max-w-sm text-center text-sm text-neutral-700">
          Tu cuenta está autenticada pero no tiene un rol válido en la colección{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">usuarios</code>.
          Pedí al administrador que cree el documento con tu UID y el campo{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">rol</code>.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-xl bg-[#003366] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Cerrar sesión
        </button>
        <Link
          to="/"
          className="text-sm font-medium text-[#003366] underline-offset-2 hover:underline"
        >
          Ir al inicio público
        </Link>
      </div>
    )
  }

  if (user && rol) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#003366] border-t-transparent"
          aria-hidden
        />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#003366]">
            Acceso interno
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            Comedor industrial
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Ingresá con tu cuenta corporativa.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
          noValidate
        >
          <label className="block text-left">
            <span className="text-xs font-medium text-neutral-600">Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setError(null)
                setEmail(e.target.value)
              }}
              className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-base text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
              placeholder="nombre@empresa.com"
            />
          </label>

          <label className="mt-4 block text-left">
            <span className="text-xs font-medium text-neutral-600">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setError(null)
                setPassword(e.target.value)
              }}
              className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 px-3 text-base text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15"
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 min-h-12 w-full rounded-xl bg-[#F39200] text-base font-semibold text-white shadow-sm shadow-[#F39200]/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link
            to="/"
            className="font-medium text-[#003366] underline-offset-2 hover:underline"
          >
            ← Volver a pedidos (vista pública)
          </Link>
        </p>
      </div>
    </div>
  )
}
