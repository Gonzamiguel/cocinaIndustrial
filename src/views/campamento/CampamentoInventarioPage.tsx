import { useAuth } from '../../context/AuthContext'
import { InventarioUbicacionPanel } from '../../components/inventario/InventarioUbicacionPanel'

export function CampamentoInventarioPage() {
  const { ubicacionId } = useAuth()

  if (!ubicacionId) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6">
        <p className="text-center text-sm text-neutral-600">
          No hay sucursal asignada. Configurá{' '}
          <code className="rounded bg-neutral-200 px-1 text-xs">ubicacionId</code> en tu usuario.
        </p>
      </div>
    )
  }

  return (
    <InventarioUbicacionPanel
      layout="page"
      ubicacionId={ubicacionId}
      exportBasename="Campamento_inventario"
      recepcionLink={{ to: '/campamento/recepcion', label: 'Ir a recepción' }}
    />
  )
}
