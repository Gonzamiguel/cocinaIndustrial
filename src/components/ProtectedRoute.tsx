import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'

type ProtectedRouteProps = {
  children: ReactNode
  rolesPermitidos: UserRole[]
}

export function ProtectedRoute({
  children,
  rolesPermitidos,
}: ProtectedRouteProps) {
  const { user, rol, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-brand-surface px-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-brand-accent border-t-transparent"
          aria-hidden
        />
        <p className="text-sm text-brand-muted">Verificando sesión…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    )
  }

  if (!rol || !rolesPermitidos.includes(rol)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-accent">
            Acceso denegado
          </p>
          <h1 className="mt-3 text-xl font-bold text-neutral-900">
            No tenés permiso para esta sección
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Tu cuenta no tiene el rol necesario para ingresar aquí. Si creés que
            es un error, contactá al administrador.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Ir al inicio
            </a>
            <a
              href="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
            >
              Volver al login
            </a>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
