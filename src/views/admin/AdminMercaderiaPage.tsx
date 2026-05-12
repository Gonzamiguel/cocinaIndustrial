import { useState } from 'react'
import { Package, Refrigerator, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminSolicitudMercaderiaPage } from './AdminSolicitudMercaderiaPage'
import { useAuth } from '../../context/AuthContext'
import { RecepcionTrasladoContenido } from '../../components/inventario/RecepcionTrasladoContenido'
import { InventarioUbicacionPanel } from '../../components/inventario/InventarioUbicacionPanel'
import { UBICACION_COCINA_CENTRAL } from '../../lib/movimientosInventario'

type TabId = 'solicitud' | 'recepcion' | 'stock'

const tabs: { id: TabId; label: string; Icon: typeof Package }[] = [
  { id: 'solicitud', label: 'Solicitar al depósito', Icon: Package },
  { id: 'recepcion', label: 'Recepciones pendientes', Icon: Truck },
  { id: 'stock', label: 'Stock local (Heladera)', Icon: Refrigerator },
]

function etiquetaCocina(id: string): string {
  if (id.trim().toUpperCase() === UBICACION_COCINA_CENTRAL) return 'Cocina central'
  return id
}

export function AdminMercaderiaPage() {
  const { ubicacionId } = useAuth()
  const [tab, setTab] = useState<TabId>('solicitud')

  const ub = ubicacionId?.trim().toUpperCase() ?? ''
  const tituloUbicacion = ub ? etiquetaCocina(ub) : '—'

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-[#CD1818] sm:text-xl">
              Mercadería
            </h1>
            <p className="text-xs text-[#8997A6] sm:text-sm">
              Ubicación operativa{' '}
              <span className="font-mono text-[11px] text-[#171717] sm:text-xs">{ub || '—'}</span>
              {' · '}
              <Link
                to="/admin/menu"
                className="font-medium text-[#CD1818] underline-offset-2 hover:underline"
              >
                Registrar producción
              </Link>
              {' '}
              en Gestión de menú.
            </p>
          </div>
        </div>
        <nav
          className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4"
          aria-label="Secciones mercadería"
        >
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 sm:py-2.5 ${
                tab === id
                  ? 'bg-[#CD1818] text-white shadow-sm'
                  : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        {tab === 'solicitud' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <AdminSolicitudMercaderiaPage variant="embedded" />
          </div>
        ) : null}

        {tab === 'recepcion' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {!ub ? (
              <p className="text-sm text-neutral-600">
                No hay ubicación de cocina. Configurá{' '}
                <code className="rounded bg-neutral-100 px-1 text-xs">ubicacionId</code> en tu perfil.
              </p>
            ) : (
              <RecepcionTrasladoContenido
                embedded
                ubicacionId={ub}
                tituloUbicacion={tituloUbicacion}
              />
            )}
          </div>
        ) : null}

        {tab === 'stock' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {!ub ? (
              <p className="text-sm text-neutral-600">
                No hay ubicación de cocina. Configurá{' '}
                <code className="rounded bg-neutral-100 px-1 text-xs">ubicacionId</code> en tu perfil.
              </p>
            ) : (
              <InventarioUbicacionPanel
                layout="embedded"
                ubicacionId={UBICACION_COCINA_CENTRAL}
                exportBasename="Cocina_inventario"
                recepcionLink={{ to: '/admin/mercaderia', label: 'Recepciones' }}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
