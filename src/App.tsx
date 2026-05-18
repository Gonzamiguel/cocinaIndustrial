import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LayoutAdmin } from './layouts/LayoutAdmin'
import { LayoutAnalista } from './layouts/LayoutAnalista'
import { LayoutCampamento } from './layouts/LayoutCampamento'
import { LayoutDeposito } from './layouts/LayoutDeposito'
import { LayoutHoteleria } from './layouts/LayoutHoteleria'
import { AdminMenuPage } from './views/admin/AdminMenuPage'
import { AdminPedidosPage } from './views/admin/AdminPedidosPage'
import { AdminRecetarioPage } from './views/admin/AdminRecetarioPage'
import { AdminMercaderiaPage } from './views/admin/AdminMercaderiaPage'
import { AnalistaCostosPage } from './views/analista/AnalistaCostosPage'
import { AnalistaDashboardPage } from './views/analista/AnalistaDashboardPage'
import { AnalistaLogisticaPage } from './views/analista/AnalistaLogisticaPage'
import { AnalistaMovimientosPage } from './views/analista/AnalistaMovimientosPage'
import { AnalistaProduccionPage } from './views/analista/AnalistaProduccionPage'
import { AnalistaResumenMensualPage } from './views/analista/AnalistaResumenMensualPage'
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
import { ConfiguracionHoteleriaPage } from './views/hoteleria/ConfiguracionHoteleriaPage'
import { MapaCamasPage } from './views/hoteleria/MapaCamasPage'
import { PadronPage } from './views/hoteleria/PadronPage'
import { PernoctesPage } from './views/hoteleria/PernoctesPage'

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
          <ProtectedRoute rolesPermitidos={['analista']}>
            <LayoutAnalista />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/analista/dashboard" replace />} />
        <Route path="dashboard" element={<AnalistaDashboardPage />} />
        <Route path="movimientos" element={<AnalistaMovimientosPage />} />
        <Route path="costos" element={<AnalistaCostosPage />} />
        <Route path="logistica" element={<AnalistaLogisticaPage />} />
        <Route path="resumen-mensual" element={<AnalistaResumenMensualPage />} />
        <Route path="produccion" element={<AnalistaProduccionPage />} />
      </Route>

      <Route
        path="/campamento"
        element={
          <ProtectedRoute rolesPermitidos={['admin_campamento']}>
            <LayoutCampamento />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/campamento/recepcion" replace />} />
        <Route path="recepcion" element={<CampamentoRecepcionPage />} />
        <Route path="solicitud-mercaderia" element={<CampamentoSolicitudPage />} />
        <Route path="inventario" element={<CampamentoInventarioPage />} />
        <Route path="comandas/nueva" element={<CampamentoNuevaComandaPage />} />
        <Route path="comandas" element={<CampamentoComandasPage />} />
      </Route>

      <Route
        path="/hoteleria"
        element={
          <ProtectedRoute rolesPermitidos={['hoteleria_casposo']}>
            <LayoutHoteleria />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/hoteleria/mapa" replace />} />
        <Route path="mapa" element={<MapaCamasPage />} />
        <Route path="padron" element={<PadronPage />} />
        <Route path="pernoctes" element={<PernoctesPage />} />
        <Route path="configuracion" element={<ConfiguracionHoteleriaPage />} />
      </Route>

      <Route
        path="/admin-cocina"
        element={<Navigate to="/admin/pedidos" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
