import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ControlLayout } from './components/layouts/ControlLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LayoutAdmin } from './layouts/LayoutAdmin'
import { LayoutAnalista } from './layouts/LayoutAnalista'
import { LayoutCampamento } from './layouts/LayoutCampamento'
import { LayoutComedor } from './layouts/LayoutComedor'
import { LayoutDeposito } from './layouts/LayoutDeposito'
import { LayoutHoteleria } from './layouts/LayoutHoteleria'
import { LayoutNutricion } from './layouts/LayoutNutricion'
import { DepositoConfiguracionPage } from './views/deposito/DepositoConfiguracionPage'
import { DepositoDashboardPage } from './views/deposito/DepositoDashboardPage'
import { DepositoInsumosPage } from './views/deposito/DepositoInsumosPage'
import { DepositoInventarioPage } from './views/deposito/DepositoInventarioPage'
import { DepositoMovimientosPage } from './views/deposito/DepositoMovimientosPage'
import { DepositoTrazabilidadPage } from './views/deposito/DepositoTrazabilidadPage'
import { DepositoOrdenesCompraPage } from './views/deposito/DepositoOrdenesCompraPage'
import { DepositoNuevoIngresoPage } from './views/deposito/DepositoNuevoIngresoPage'
import { AdminMenuPage } from './views/admin/AdminMenuPage'
import { AdminDespachoPage } from './views/admin/AdminDespachoPage'
import { AdminTrazabilidadViandaPage } from './views/admin/AdminTrazabilidadViandaPage'
import { AdminMercaderiaPage } from './views/admin/AdminMercaderiaPage'
import { AdminPedidosPage } from './views/admin/AdminPedidosPage'
import { AdminPlanificacionEmpresaPage } from './views/admin/AdminPlanificacionEmpresaPage'
import { AdminRecetarioPage } from './views/admin/AdminRecetarioPage'
import { DashboardPage } from './views/admin/DashboardPage'
import { NutricionDashboardPage } from './views/nutricion/NutricionDashboardPage'
import { NutricionComparativaProduccionPage } from './views/nutricion/NutricionComparativaProduccionPage'
import { NutricionPlanificacionMenuPage } from './views/nutricion/NutricionPlanificacionMenuPage'
import { DashboardComensalesPage } from './views/campamento/DashboardComensalesPage'
import { CampamentoComandasPage } from './views/campamento/CampamentoComandasPage'
import { CampamentoNuevaComandaPage } from './views/campamento/CampamentoNuevaComandaPage'
import { CampamentoInventarioPage } from './views/campamento/CampamentoInventarioPage'
import { CampamentoRecepcionPage } from './views/campamento/CampamentoRecepcionPage'
import { CampamentoSolicitudPage } from './views/campamento/CampamentoSolicitudPage'
import { AnalistaAuditoriaPage } from './views/analista/AnalistaAuditoriaPage'
import { AnalistaDashboardPage } from './views/analista/AnalistaDashboardPage'
import { AnalistaLiquidacionesPage } from './views/analista/AnalistaLiquidacionesPage'
import { AnalistaMovimientosPage } from './views/analista/AnalistaMovimientosPage'
import { ClientView } from './views/ClientView'
import { LoginPage } from './views/LoginPage'
import { DashboardHoteleriaPage } from './views/hoteleria/DashboardHoteleriaPage'
import { MapaCamasPage } from './views/hoteleria/MapaCamasPage'
import { PadronEmpresasPage } from './views/hoteleria/PadronEmpresasPage'
import { PadronPage } from './views/hoteleria/PadronPage'
import { ConfiguracionHoteleriaPage } from './views/hoteleria/ConfiguracionHoteleriaPage'
import { PernoctesPage } from './views/hoteleria/PernoctesPage'
import { ReporteLimpiezaPage } from './views/hoteleria/ReporteLimpiezaPage'
import { DashboardFacturacionPage } from './views/control/DashboardFacturacionPage'
import { TesoreriaDashboardPage } from './views/control/TesoreriaDashboardPage'
import { ComprasAprobacionPage } from './views/control/ComprasAprobacionPage'
import { OcDetallePage } from './views/control/OcDetallePage'
import { ProveedoresPage } from './views/control/ProveedoresPage'
import { ProveedorDetallePage } from './views/control/ProveedorDetallePage'
import { LiquidacionesPage } from './views/control/LiquidacionesPage'
import { SolicitudMercaderiaDetallePage } from './views/SolicitudMercaderiaDetallePage'
import {
  ROLES_CONTROL,
  ROLES_DEPOSITO,
  ROLES_FINANZAS_LECTURA,
  ROLES_LIQUIDACIONES_LECTURA,
  ROLES_NUTRICION,
  ROLES_PANEL_CONTROL,
  ROLES_TERMINAL,
} from './lib/rbac'

const TerminalComensalesPage = lazy(() =>
  import('./views/comedor/TerminalComensalesPage').then((m) => ({
    default: m.TerminalComensalesPage,
  })),
)

const terminalFallback = (
  <div className="flex h-dvh items-center justify-center bg-neutral-900 text-neutral-400">
    Cargando terminal…
  </div>
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/control"
        element={
          <ProtectedRoute rolesPermitidos={[...ROLES_CONTROL]}>
            <ControlLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <DashboardComensalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="padron"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <PadronPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="empresas"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <PadronEmpresasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="hoteleria"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <DashboardHoteleriaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="alojamiento"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <MapaCamasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reporte-limpieza"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <ReporteLimpiezaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="facturacion"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <DashboardFacturacionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="tesoreria"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_FINANZAS_LECTURA]}>
              <TesoreriaDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="proveedores/:id"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_FINANZAS_LECTURA]}>
              <ProveedorDetallePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="proveedores"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_FINANZAS_LECTURA]}>
              <ProveedoresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="compras/:id"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_FINANZAS_LECTURA]}>
              <OcDetallePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="compras"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_FINANZAS_LECTURA]}>
              <ComprasAprobacionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="liquidaciones"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_LIQUIDACIONES_LECTURA]}>
              <LiquidacionesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracion"
          element={
            <ProtectedRoute rolesPermitidos={[...ROLES_PANEL_CONTROL]}>
              <ConfiguracionHoteleriaPage />
            </ProtectedRoute>
          }
        />
        <Route path="menu" element={<Navigate to="/control" replace />} />
      </Route>

      <Route
        path="/terminal"
        element={
          <ProtectedRoute rolesPermitidos={[...ROLES_TERMINAL]}>
            <LayoutComedor />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={terminalFallback}>
              <TerminalComensalesPage />
            </Suspense>
          }
        />
      </Route>

      <Route path="/comedor" element={<Navigate to="/terminal" replace />} />
      <Route path="/comedor/*" element={<Navigate to="/terminal" replace />} />

      <Route
        path="/deposito"
        element={
          <ProtectedRoute rolesPermitidos={[...ROLES_DEPOSITO]}>
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
        <Route path="ordenes-compra" element={<DepositoOrdenesCompraPage />} />
        <Route path="insumos" element={<DepositoInsumosPage />} />
        <Route path="configuracion" element={<DepositoConfiguracionPage />} />
        <Route path="movimientos" element={<DepositoMovimientosPage />} />
        <Route path="ingreso" element={<DepositoNuevoIngresoPage />} />
        <Route path="inventario" element={<DepositoInventarioPage />} />
        <Route path="trazabilidad" element={<DepositoTrazabilidadPage />} />
        <Route
          path="recepcion"
          element={<Navigate to="/deposito/movimientos" replace />}
        />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute rolesPermitidos={['admin_cocina']}>
            <LayoutAdmin />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/pedidos" replace />} />
        <Route
          path="mercaderia/solicitud/:solicitudId"
          element={<SolicitudMercaderiaDetallePage />}
        />
        <Route path="pedidos" element={<AdminPedidosPage />} />
        <Route path="planificacion" element={<AdminPlanificacionEmpresaPage />} />
        <Route path="menu" element={<AdminMenuPage />} />
        <Route path="despacho" element={<AdminDespachoPage />} />
        <Route path="trazabilidad" element={<AdminTrazabilidadViandaPage />} />
        <Route path="mercaderia" element={<AdminMercaderiaPage />} />
        <Route path="dashboard" element={<Navigate to="/admin/pedidos" replace />} />
        <Route path="recetario" element={<Navigate to="/admin/pedidos" replace />} />
      </Route>

      <Route
        path="/nutricion"
        element={
          <ProtectedRoute rolesPermitidos={[...ROLES_NUTRICION]}>
            <LayoutNutricion />
          </ProtectedRoute>
        }
      >
        <Route index element={<NutricionDashboardPage />} />
        <Route path="recetario" element={<AdminRecetarioPage />} />
        <Route path="ingenieria-menu" element={<DashboardPage />} />
        <Route path="planificacion" element={<NutricionPlanificacionMenuPage />} />
        <Route path="produccion-real" element={<NutricionComparativaProduccionPage />} />
      </Route>

      <Route path="/admin-cocina" element={<Navigate to="/admin/pedidos" replace />} />

      <Route
        path="/analista"
        element={
          <ProtectedRoute rolesPermitidos={['gerencia', 'analista']}>
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
          <ProtectedRoute
            rolesPermitidos={[
              'administrativo_campamento',
              'gerencia',
              'analista',
            ]}
          >
            <LayoutCampamento />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/campamento/recepcion" replace />} />
        <Route
          path="solicitud-mercaderia/:solicitudId"
          element={<SolicitudMercaderiaDetallePage />}
        />
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
          <ProtectedRoute rolesPermitidos={['administrativo_campamento']}>
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

      <Route path="/pedido/:token" element={<ClientView />} />
      <Route path="/pedido" element={<ClientView />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
