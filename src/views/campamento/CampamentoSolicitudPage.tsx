import { useRef } from 'react'
import { AdminSolicitudMercaderiaPage } from '../admin/AdminSolicitudMercaderiaPage'

export function CampamentoSolicitudPage() {
  const nuevaSolicitudRef = useRef<(() => void) | null>(null)

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1920px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
              Solicitud de mercadería al depósito
            </h1>
            <p className="mt-1 text-sm text-[#8997A6]">
              Mismo flujo que cocina central: pedidos, prioridad y seguimiento hasta recepción en tu
              sucursal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => nuevaSolicitudRef.current?.()}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95 sm:min-h-12 sm:w-auto sm:px-6 sm:text-base"
          >
            <span className="text-lg leading-none sm:text-xl">+</span>
            Nueva solicitud
          </button>
        </div>
      </header>
      <div className="min-h-0 w-full flex-1 overflow-auto px-3 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto flex h-full min-h-0 max-w-[1920px] flex-1 flex-col">
          <AdminSolicitudMercaderiaPage
            variant="embedded"
            solicitudDetalleBasePath="/campamento/solicitud-mercaderia"
            nuevaSolicitudRef={nuevaSolicitudRef}
          />
        </div>
      </div>
    </div>
  )
}
