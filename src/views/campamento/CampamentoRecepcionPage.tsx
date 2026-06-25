import { useMemo } from 'react'
import { Database, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { RecepcionTrasladoContenido } from '../../components/inventario/RecepcionTrasladoContenido'
import { UBICACION_CAMPAMENTO_CASPOSO } from '../../lib/movimientosInventario'

function etiquetaUbicacion(id: string): string {
  if (id === UBICACION_CAMPAMENTO_CASPOSO) return 'Campamento Casposo'
  return id
}

export function CampamentoRecepcionPage() {
  const { ubicacionId } = useAuth()

  const tituloUbicacion = useMemo(
    () => (ubicacionId ? etiquetaUbicacion(ubicacionId) : '—'),
    [ubicacionId],
  )

  if (!ubicacionId) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gray-50 px-6">
        <p className="text-center text-sm text-neutral-600">
          No hay sucursal asignada en tu perfil. Pedí al administrador el campo{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">ubicacionId</code> en{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">usuarios</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className="h-6 w-6 shrink-0 text-[#CD1818]" aria-hidden />
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Recepción de mercadería
              </h1>
            </div>
          </div>
          <Link
            to="/campamento/inventario"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50"
          >
            <Database className="h-4 w-4" aria-hidden />
            Inventario local
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <RecepcionTrasladoContenido
          ubicacionId={ubicacionId}
          tituloUbicacion={tituloUbicacion}
        />
      </div>
    </div>
  )
}
