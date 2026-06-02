import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth, type UserRole } from '../context/AuthContext'
import { getAuthApp, getDb } from '../lib/firebase'
import { rolPuedeAccederRuta, rutaHomePorRol } from '../lib/rbac'

const LOGIN_SLIDES = [
  {
    src: '/login-coffee-break.png',
    alt: 'Espacio corporativo de cafetería con personas conversando',
  },
  {
    src: '/login-movilidad.png',
    alt: 'Camioneta corporativa en operación sobre un entorno nevado',
  },
  {
    src: '/login-cook-and-chill.png',
    alt: 'Plato preparado en cocina industrial con packaging corporativo',
  },
] as const

const MSG_MODULO_NO_DISPONIBLE =
  'Tu rol no tiene acceso en esta versión del sistema. Contactá al administrador.'

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
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    if (authLoading) return
    if (user && rol) {
      const home = rutaHomePorRol(rol)
      if (home) {
        navigate(home, { replace: true })
      }
    }
  }, [authLoading, user, rol, navigate])

  useEffect(() => {
    if (LOGIN_SLIDES.length <= 1) return
    const intervalId = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % LOGIN_SLIDES.length)
    }, 7000)
    return () => window.clearInterval(intervalId)
  }, [])

  async function rechazarRolSinModulo(auth = getAuthApp()) {
    await signOut(auth)
    setError(MSG_MODULO_NO_DISPONIBLE)
  }

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

      const home = rutaHomePorRol(rolLeído)
      if (!home) {
        await rechazarRolSinModulo(auth)
        return
      }

      if (from && (from === '/control' || from.startsWith('/control/'))) {
        if (!rolPuedeAccederRuta(rolLeído, from)) {
          await signOut(auth)
          setError('No tenés permiso para acceder a esa sección.')
          return
        }
        navigate(from, { replace: true })
        return
      }

      if (from && (from === '/terminal' || from.startsWith('/terminal/'))) {
        if (!rolPuedeAccederRuta(rolLeído, from)) {
          await signOut(auth)
          setError('No tenés permiso para acceder a esa sección.')
          return
        }
        navigate(from, { replace: true })
        return
      }

      if (
        from &&
        (from === '/admin' ||
          from.startsWith('/admin/') ||
          from === '/admin-cocina')
      ) {
        if (!rolPuedeAccederRuta(rolLeído, from)) {
          await signOut(auth)
          setError('No tenés permiso para acceder a esa sección.')
          return
        }
        navigate(from, { replace: true })
        return
      }

      navigate(home, { replace: true })
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
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#CD1818] border-t-transparent"
          aria-hidden
        />
      </div>
    )
  }

  if (user && !rol) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6">
        <p className="max-w-sm text-center text-sm text-[#171717]">
          Tu cuenta está autenticada pero no tiene un rol válido en la colección{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">usuarios</code>.
          Pedí al administrador que cree el documento con tu UID y el campo{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">rol</code>.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-xl bg-[#CD1818] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Cerrar sesión
        </button>
        <Link
          to="/"
          className="text-sm font-medium text-[#CD1818] underline-offset-2 hover:underline"
        >
          Ir al inicio público
        </Link>
      </div>
    )
  }

  if (user && rol && rutaHomePorRol(rol)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#CD1818] border-t-transparent"
          aria-hidden
        />
      </div>
    )
  }

  if (user && rol && !rutaHomePorRol(rol)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 px-6">
        <p className="max-w-sm text-center text-sm text-[#171717]">{MSG_MODULO_NO_DISPONIBLE}</p>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-xl bg-[#CD1818] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Cerrar sesión
        </button>
        <Link
          to="/"
          className="text-sm font-medium text-[#CD1818] underline-offset-2 hover:underline"
        >
          Ir al inicio público
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] lg:items-center">
        <section className="flex items-center justify-center">
          <div className="w-full max-w-3xl">
            <div className="flex w-full items-center justify-center p-4 sm:p-6 lg:min-h-[34rem] lg:p-8">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.75rem] lg:max-h-[30rem]">
                {LOGIN_SLIDES.map((slide, index) => (
                  <img
                    key={slide.src}
                    src={slide.src}
                    alt={slide.alt}
                    className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
                      index === activeSlide ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                ))}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/25 to-transparent" />
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
                  {LOGIN_SLIDES.map((slide, index) => (
                    <button
                      key={`${slide.src}-dot`}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      aria-label={`Ver imagen ${index + 1}`}
                      className={`h-2.5 rounded-full transition-all ${
                        index === activeSlide
                          ? 'w-8 bg-white'
                          : 'w-2.5 bg-white/55 hover:bg-white/80'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8997A6]">
                Acceso interno
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#CD1818]">
                Comedor industrial
              </h1>
              <p className="mt-2 text-sm text-[#8997A6]">
                Ingresá con tu cuenta corporativa.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7"
              noValidate
            >
              <label className="block text-left">
                <span className="text-xs font-medium text-[#8997A6]">Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setError(null)
                    setEmail(e.target.value)
                  }}
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                  placeholder="nombre@empresa.com"
                />
              </label>

              <label className="mt-4 block text-left">
                <span className="text-xs font-medium text-[#8997A6]">
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
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                />
              </label>

              {error ? (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-[#CD1818]/20 bg-white px-3 py-2.5 text-center text-sm text-[#CD1818]"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 min-h-12 w-full rounded-xl bg-[#CD1818] text-base font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-[#8997A6]">
              <Link
                to="/"
                className="font-medium text-[#CD1818] underline-offset-2 hover:underline"
              >
                ← Volver a pedidos (vista pública)
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
