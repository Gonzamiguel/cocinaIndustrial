import { AdminSolicitudMercaderiaPage } from '../admin/AdminSolicitudMercaderiaPage'

export function CampamentoSolicitudPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Solicitud de mercadería al depósito
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Mismo flujo que cocina central: pedidos, prioridad y seguimiento hasta recepción en tu
          sucursal.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <AdminSolicitudMercaderiaPage />
      </div>
    </div>
  )
}
