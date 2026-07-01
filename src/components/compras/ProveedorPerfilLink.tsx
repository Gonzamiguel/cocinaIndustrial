import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'

type ProveedorPerfilLinkProps = {
  proveedorId: string
  /** Etiqueta visible. Por defecto «Ver perfil». */
  label?: string
  /** `icon` solo ojo; `button` pill con ojo + texto; `link` texto subrayado. */
  variant?: 'icon' | 'button' | 'link'
  className?: string
  title?: string
}

const baseIcon =
  'inline-flex shrink-0 items-center justify-center rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CD1818]'

export function ProveedorPerfilLink({
  proveedorId,
  label = 'Ver perfil',
  variant = 'button',
  className = '',
  title = 'Ver legajo digital del proveedor',
}: ProveedorPerfilLinkProps) {
  const id = proveedorId.trim()
  if (!id) return null

  const to = `/control/proveedores/${id}`

  if (variant === 'icon') {
    return (
      <Link
        to={to}
        title={title}
        aria-label={title}
        className={`${baseIcon} h-9 w-9 border border-neutral-200 bg-white text-neutral-600 hover:border-[#CD1818]/30 hover:bg-[#CD1818]/5 hover:text-[#CD1818] ${className}`}
      >
        <Eye className="h-4 w-4" aria-hidden />
      </Link>
    )
  }

  if (variant === 'link') {
    return (
      <Link
        to={to}
        title={title}
        className={`inline-flex items-center gap-1 font-medium text-[#CD1818] hover:underline ${className}`}
      >
        {label}
        <Eye className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </Link>
    )
  }

  return (
    <Link
      to={to}
      title={title}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-[#CD1818]/30 hover:bg-[#CD1818]/5 hover:text-[#CD1818] ${className}`}
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  )
}
