import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LayoutAdmin } from './layouts/LayoutAdmin'
import { LayoutAnalista } from './layouts/LayoutAnalista'
import { LayoutCampamento } from './layouts/LayoutCampamento'
import { LayoutDeposito } from './layouts/LayoutDeposito'
import { LayoutHoteleria } from './layouts/LayoutHoteleria'
import { LayoutComedor } from './layouts/LayoutComedor'
import { AdminMenuPage } from './views/admin/AdminMenuPage'
import { AdminPedidosPage } from './views/admin/AdminPedidosPage'
import { AdminRecetarioPage } from './views/admin/AdminRecetarioPage'
import { AdminMercaderiaPage } from './views/admin/AdminMercaderiaPage'
import { AnalistaAuditoriaPage } from './views/analista/AnalistaAuditoriaPage'
import { AnalistaDashboardPage } from './views/analista/AnalistaDashboardPage'
import { AnalistaLiquidacionesPage } from './views/analista/AnalistaLiquidacionesPage'
import { AnalistaMovimientosPage } from './views/analista/AnalistaMovimientosPage'
import { DashboardPage } from './views/admin/DashboardPage'
import { ClientView } from './views/ClientView'
import { LoginPage } from './views/LoginPage'
import { DepositoConfiguracionPage } from './views/deposito/DepositoConfiguracionPage'
import { DepositoDashboardPage } from './views/deposito/DepositoDashboardPage'
import { DepositoInsumosPage } from './views/deposito/DepositoInsumosPage'
import { DepositoInventarioPage } from './views/deposito/DepositoInventarioPage'
import { DepositoMovimientosPage } from './views/deposito/DepositoMovimientosPage'
import { DepositoTrazabilidadPage } from './views/deposito/DepositoTrazabilidadPage'
import { CampamentoComandasPage } from './views/campamento/CampamentoComandasPage'
import { CampamentoNuevaComandaPage } from './views/campamento/CampamentoNuevaComandaPage'
import { CampamentoInventarioPage } from './views/campamento/CampamentoInventarioPage'
import { CampamentoRecepcionPage } from './views/campamento/CampamentoRecepcionPage'
import { CampamentoSolicitudPage } from './views/campamento/CampamentoSolicitudPage'
import { DashboardComensalesPage } from './views/campamento/DashboardComensalesPage'
import { SolicitudMercaderiaDetallePage } from './views/SolicitudMercaderiaDetallePage'
import { ConfiguracionHoteleriaPage } from './views/hoteleria/ConfiguracionHoteleriaPage'
import { MapaCamasPage } from './views/hoteleria/MapaCamasPage'
import { PadronPage } from './views/hoteleria/PadronPage'
import { PernoctesPage } from './views/hoteleria/PernoctesPage'
import { ReporteLimpiezaPage } from './views/hoteleria/ReporteLimpiezaPage'
const TerminalComensalesPage = lazy(() =>
  import('./views/comedor/TerminalComensalesPage').then((m) => ({
    default: m.TerminalComensalesPage,
  })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ClientView />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute rolesPermitidos={['admin_cocina']}>
            <LayoutAdmin />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/pedidos" replace />} />
        <Route path="mercaderia/solicitud/:solicitudId" element={<SolicitudMercaderiaDetallePage />} />
        <Route path="pedidos" element={<AdminPedidosPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="menu" element={<AdminMenuPage />} />
        <Route path="recetario" element={<AdminRecetarioPage />} />
        <Route path="mercaderia" element={<AdminMercaderiaPage />} />
      </Route>

      <Route
        path="/deposito"
        element={
          <ProtectedRoute rolesPermitidos={['admin_deposito']}>
            <LayoutDeposito />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/deposito/dashboard" replace />} />
        <Route
          path="solicitudes"
          element={<Navigate to="/deposito/movimientos" replace />}
        />
        <Route path="dashboard" element={<DepositoDashboardPage />} />
        <Route path="insumos" element={<DepositoInsumosPage />} />
        <Route path="configuracion" element={<DepositoConfiguracionPage />} />
        <Route path="movimientos" element={<DepositoMovimientosPage />} />
        <Route path="inventario" element={<DepositoInventarioPage />} />
        <Route path="trazabilidad" element={<DepositoTrazabilidadPage />} />
        <Route
          path="recepcion"
          element={<Navigate to="/deposito/movimientos" replace />}
        />
      </Route>

      <Route
        path="/analista"
        element={
          <ProtectedRoute rolesPermitidos={['analista', 'gerencia']}>
            <LayoutAnalista />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/analista/dashboard" replace />} />
        <Route path="dashboard" element={<AnalistaDashboardPage />} />
        <Route path="liquidaciones" element={<AnalistaLiquidacionesPage />} />
        <Route path="auditoria" element={<AnalistaAuditoriaPage />} />
        <Route path="movimientos" element={<AnalistaMovimientosPage />} />
        <Route path="costos" element={<Navigate to="/analista/dashboard" replace />} />
        <Route path="logistica" element={<Navigate to="/analista/movimientos" replace />} />
        <Route path="resumen-mensual" element={<Navigate to="/analista/dashboard" replace />} />
        <Route path="produccion" element={<Navigate to="/analista/auditoria" replace />} />
      </Route>

      <Route
        path="/campamento"
        element={
          <ProtectedRoute rolesPermitidos={['admin_campamento', 'jefe_campamento']}>
            <LayoutCampamento />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/campamento/recepcion" replace />} />
        <Route path="solicitud-mercaderia/:solicitudId" element={<SolicitudMercaderiaDetallePage />} />
        <Route path="recepcion" element={<CampamentoRecepcionPage />} />
        <Route path="solicitud-mercaderia" element={<CampamentoSolicitudPage />} />
        <Route path="inventario" element={<CampamentoInventarioPage />} />
        <Route path="comandas/nueva" element={<CampamentoNuevaComandaPage />} />
        <Route path="comandas" element={<CampamentoComandasPage />} />
        <Route path="comensales" element={<DashboardComensalesPage />} />
      </Route>

      <Route
        path="/hoteleria"
        element={
          <ProtectedRoute rolesPermitidos={['hoteleria_casposo', 'jefe_campamento']}>
            <LayoutHoteleria />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/hoteleria/mapa" replace />} />
        <Route path="mapa" element={<MapaCamasPage />} />
        <Route path="padron" element={<PadronPage />} />
        <Route path="pernoctes" element={<PernoctesPage />} />
        <Route path="reporte-limpieza" element={<ReporteLimpiezaPage />} />
        <Route path="configuracion" element={<ConfiguracionHoteleriaPage />} />
      </Route>

      <Route
        path="/comedor"
        element={
          <ProtectedRoute rolesPermitidos={['terminal_comedor']}>
            <LayoutComedor />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense
              fallback={
                <div className="flex h-dvh items-center justify-center bg-neutral-900 text-neutral-400">
                  Cargando terminal…
                </div>
              }
            >
              <TerminalComensalesPage />
            </Suspense>
          }
        />
      </Route>

      <Route
        path="/admin-cocina"
        element={<Navigate to="/admin/pedidos" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
