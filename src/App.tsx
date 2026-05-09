import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LayoutAdmin } from './layouts/LayoutAdmin'
import { LayoutDeposito } from './layouts/LayoutDeposito'
import { AdminMenuPage } from './views/admin/AdminMenuPage'
import { AdminPedidosPage } from './views/admin/AdminPedidosPage'
import { AdminRecetarioPage } from './views/admin/AdminRecetarioPage'
import { AdminSolicitudMercaderiaPage } from './views/admin/AdminSolicitudMercaderiaPage'
import { DashboardPage } from './views/admin/DashboardPage'
import { ClientView } from './views/ClientView'
import { LoginPage } from './views/LoginPage'
import { DepositoInsumosPage } from './views/deposito/DepositoInsumosPage'
import { DepositoInventarioPage } from './views/deposito/DepositoInventarioPage'
import { DepositoMovimientosPage } from './views/deposito/DepositoMovimientosPage'
import { DepositoSolicitudesPage } from './views/deposito/DepositoSolicitudesPage'

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
        <Route path="mercaderia" element={<AdminSolicitudMercaderiaPage />} />
      </Route>

      <Route
        path="/deposito"
        element={
          <ProtectedRoute rolesPermitidos={['admin_deposito']}>
            <LayoutDeposito />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<Navigate to="/deposito/solicitudes" replace />}
        />
        <Route path="solicitudes" element={<DepositoSolicitudesPage />} />
        <Route path="insumos" element={<DepositoInsumosPage />} />
        <Route path="movimientos" element={<DepositoMovimientosPage />} />
        <Route path="inventario" element={<DepositoInventarioPage />} />
        <Route
          path="recepcion"
          element={<Navigate to="/deposito/movimientos" replace />}
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
