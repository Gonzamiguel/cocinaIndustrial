import { Navigate, Route, Routes } from 'react-router-dom'
import { LayoutAdmin } from './layouts/LayoutAdmin'
import { AdminMenuPage } from './views/admin/AdminMenuPage'
import { AdminPedidosPage } from './views/admin/AdminPedidosPage'
import { DashboardPage } from './views/admin/DashboardPage'
import { ClientView } from './views/ClientView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ClientView />} />
      <Route path="/admin" element={<LayoutAdmin />}>
        <Route index element={<Navigate to="/admin/pedidos" replace />} />
        <Route path="pedidos" element={<AdminPedidosPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="menu" element={<AdminMenuPage />} />
      </Route>
      <Route
        path="/admin-cocina"
        element={<Navigate to="/admin/pedidos" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
