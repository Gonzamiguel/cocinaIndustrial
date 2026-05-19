# ERP Campamento minero — Documentación técnica y funcional (estado actual)

> **Alcance:** fotografía del código en el repositorio (rutas, RBAC, layouts, vistas principales, cliente Firebase y reglas Firestore). Fecha de referencia: según última revisión del árbol `src/` y `firestore.rules`.

---

## 1. Roles y accesos (RBAC)

### 1.1 Definición de roles

Los roles válidos están tipados en `AuthContext` (`UserRole`) y deben coincidir **literalmente** con el campo `rol` del documento Firestore `usuarios/{uid}`:

| Rol | Identificador en código / Firestore |
|-----|----------------------------------------|
| Administración cocina | `admin_cocina` |
| Administración depósito | `admin_deposito` |
| Administración campamento / sub-depósito | `admin_campamento` |
| Jefe de campamento (campamento + hotelería) | `jefe_campamento` |
| Hotelería Casposo | `hoteleria_casposo` |
| Terminal comedor (quiosco) | `terminal_comedor` |
| Analista | `analista` |
| Gerencia (misma app que analista; lectura global en reglas) | `gerencia` |

### 1.2 Cómo se obtiene el rol y la sucursal

- Tras el login con Firebase Auth, se lee **`usuarios/{uid}`** con `getDoc`.
- **`ubicacionId`** (opcional en el documento de usuario):
  - `admin_campamento`, `jefe_campamento` y `hoteleria_casposo`: si falta, fallback **`CASPOSO`** (`UBICACION_CAMPAMENTO_CASPOSO`).
  - `admin_cocina`: si falta, fallback **`COCINA`** (`UBICACION_COCINA_CENTRAL`).
  - Otros roles: se usa solo lo guardado en el documento (puede ser `null`).

### 1.3 Protección de rutas (`ProtectedRoute`)

- Si no hay sesión → redirección a **`/login`** (con `state.from`).
- Si hay sesión pero el `rol` no está en `rolesPermitidos` del layout → pantalla **“Acceso denegado”** (no redirige automáticamente a otra app).

### 1.4 Matriz rol → URL base, layout y redirección post-login

| Rol | Prefijo principal | Layout | Redirección por defecto tras login (`LoginPage` / `useEffect`) |
|-----|-------------------|--------|------------------------------------------------------------------|
| `admin_cocina` | `/admin/*` | `LayoutAdmin` + `AdminSidebar` | `/admin/pedidos` |
| `admin_deposito` | `/deposito/*` | `LayoutDeposito` + `DepositoSidebar` | `/deposito/movimientos` |
| `admin_campamento` | `/campamento/*` | `LayoutCampamento` + `CampamentoSidebar` | `/campamento/recepcion` |
| `jefe_campamento` | `/campamento/*` y `/hoteleria/*` | `LayoutCampamento` o `LayoutHoteleria` + `JefeCampamentoModuleSwitcher` | `/campamento/recepcion` |
| `hoteleria_casposo` | `/hoteleria/*` | `LayoutHoteleria` + `HoteleriaSidebar` | `/hoteleria/mapa` |
| `terminal_comedor` | `/comedor` | `LayoutComedor` (sin sidebar) | `/comedor` |
| `analista` | `/analista/*` | `LayoutAnalista` + `AnalistaSidebar` | `/analista/dashboard` |
| `gerencia` | `/analista/*` | `LayoutAnalista` + `AnalistaSidebar` | `/analista/dashboard` |

### 1.5 Ítems de navegación por rol (sidebars)

**`admin_cocina`** (`AdminSidebar`): Pedidos del día, Dashboard, Gestión de menú, Recetario, Mercadería.

**`admin_deposito`** (`DepositoSidebar`): Dashboard, Catálogo de insumos, Movimientos, Inventario actual, Reporte de trazabilidad, Configuración.

**`admin_campamento`** (`CampamentoSidebar`): Recepción de mercadería, Solicitud al depósito, Inventario local / Kardex, Comandas de consumo diario, Control de comensales.

**`hoteleria_casposo`** (`HoteleriaSidebar`): Mapa de camas, Padrón de personas, Reporte de pernoctes, Auditoría de limpieza, Configuración.

**`analista`** (`AnalistaSidebar`): Dashboard, Reporte maestro, Auditoría de costos, Estadística logística, Resumen mensual, Eficiencia de receta.

**`gerencia`**: mismas rutas y sidebar que analista (`/analista/*`).

**`jefe_campamento`**: barra superior `JefeCampamentoModuleSwitcher` para alternar entre módulo campamento y hotelería; en cada módulo se muestra solo el sidebar correspondiente.

**`terminal_comedor`**: sin menú lateral; una sola ruta hija con terminal a pantalla completa.

### 1.6 Rutas públicas y legacy

- **`/`** → `ClientView` (pedido semanal de menú por cliente; autenticación anónima según `authPublico` / reglas de `pedidos`).
- **`/login`** → formulario de acceso staff.
- **`/admin-cocina`** → redirección permanente a **`/admin/pedidos`**.
- Cualquier otra URL → **`/`** (`path="*"`).

---

## 2. Mapa de rutas (routing)

Árbol lógico de URLs definidas en `App.tsx` (React Router v7). Las rutas anidadas bajo un layout **no** repiten el prefijo en la URL del padre.

```
/                                    ClientView (pedido menú cliente)
/login                               LoginPage

/admin                               LayoutAdmin (admin_cocina)
├── (index) → redirect /admin/pedidos
├── /admin/pedidos                   AdminPedidosPage
├── /admin/dashboard                 DashboardPage
├── /admin/menu                      AdminMenuPage
├── /admin/recetario                 AdminRecetarioPage
├── /admin/mercaderia                AdminMercaderiaPage (pestañas: solicitud, recepción, stock)
└── /admin/mercaderia/solicitud/:solicitudId   SolicitudMercaderiaDetallePage

/deposito                            LayoutDeposito (admin_deposito)
├── (index) → redirect /deposito/dashboard
├── /deposito/dashboard              DepositoDashboardPage
├── /deposito/insumos                DepositoInsumosPage
├── /deposito/movimientos            DepositoMovimientosPage
├── /deposito/inventario             DepositoInventarioPage
├── /deposito/trazabilidad           DepositoTrazabilidadPage
├── /deposito/configuracion          DepositoConfiguracionPage
├── /deposito/solicitudes → redirect /deposito/movimientos
└── /deposito/recepcion → redirect /deposito/movimientos

/analista                            LayoutAnalista (analista, gerencia)
├── (index) → redirect /analista/dashboard
├── /analista/dashboard              AnalistaDashboardPage (BI financiero)
├── /analista/liquidaciones          AnalistaLiquidacionesPage
├── /analista/auditoria              AnalistaAuditoriaPage
├── /analista/movimientos            AnalistaMovimientosPage
├── /analista/costos → redirect /analista/dashboard
├── /analista/logistica → redirect /analista/movimientos
├── /analista/resumen-mensual → redirect /analista/dashboard
└── /analista/produccion → redirect /analista/auditoria

/campamento                           LayoutCampamento (admin_campamento)
├── (index) → redirect /campamento/recepcion
├── /campamento/recepcion            CampamentoRecepcionPage
├── /campamento/solicitud-mercaderia CampamentoSolicitudPage
├── /campamento/solicitud-mercaderia/:solicitudId   SolicitudMercaderiaDetallePage
├── /campamento/inventario           CampamentoInventarioPage
├── /campamento/comandas             CampamentoComandasPage
├── /campamento/comandas/nueva       CampamentoNuevaComandaPage
└── /campamento/comensales           DashboardComensalesPage

/hoteleria                            LayoutHoteleria (hoteleria_casposo)
├── (index) → redirect /hoteleria/mapa
├── /hoteleria/mapa                  MapaCamasPage
├── /hoteleria/padron                PadronPage
├── /hoteleria/pernoctes             PernoctesPage
├── /hoteleria/reporte-limpieza      ReporteLimpiezaPage
└── /hoteleria/configuracion         ConfiguracionHoteleriaPage

/comedor                              LayoutComedor (terminal_comedor)
└── (index)                           TerminalComensalesPage (lazy + Suspense)

/admin-cocina → redirect /admin/pedidos
* → redirect /
```

---

## 3. Módulos y funcionalidades (el core)

Descripción basada en vistas y librerías asociadas. Donde aplique, se indica persistencia Firestore.

### 3.1 Cliente público — pedido de menú (`/`)

- **Vista:** `ClientView`.
- **Funcionalidad:** ventana rodante de días de consumo; selección de plato principal y guarnición por día; nombre del cliente y lugar de entrega; confirmación de pedido semanal con transacción (`menu.ts` / `pedidos`).
- **Auth:** sesión anónima para cumplir reglas de lectura/escritura según implementación en `lib/authPublico.ts`.

### 3.2 Cocina central — `/admin` (`admin_cocina`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **AdminPedidosPage** | Pedidos del día: listado, estados, operación sobre pedidos (`pedidos`, `menu`). |
| **DashboardPage** | Panel resumido de operación cocina (métricas / vistas según implementación). |
| **AdminMenuPage** | ABM de ítems de menú, stock, vínculo con recetario; descuento de stock al pedir; flujo de **registro de producción** cocina. |
| **AdminRecetarioPage** | Fichas técnicas / recetas (`recetario`). |
| **AdminMercaderiaPage** | Tres pestañas: solicitud de mercadería al depósito, recepción de traslados pendientes, inventario local en ubicación cocina (`InventarioUbicacionPanel` + `RecepcionTrasladoContenido`). |
| **SolicitudMercaderiaDetallePage** | Detalle de solicitud, ítems, confirmación de recepción si estado `Enviado` (`solicitudes_mercaderia`). |

### 3.3 Depósito central — `/deposito` (`admin_deposito`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **DepositoDashboardPage** | Resumen operativo del depósito. |
| **DepositoInsumosPage** | Catálogo `insumos`; alta/edición/baja; costos vinculados donde aplique. |
| **DepositoMovimientosPage** | Altas de **INGRESO**, **EGRESO** (incl. traslados a cocina/campamento), **DECOMISO**; documentos, lotes, vencimientos; PDF por movimiento; export Excel de movimientos; integración con solicitudes de mercadería donde esté cableado en UI. |
| **DepositoInventarioPage** | Inventario / kardex del depósito en ubicación **CENTRAL** (pantalla propia que agrega `movimientos_inventario`; no reutiliza `InventarioUbicacionPanel`). |
| **DepositoTrazabilidadPage** | Consulta por insumo/lote/movimientos para trazabilidad. |
| **DepositoConfiguracionPage** | Herramientas de mantenimiento (p. ej. rebuild de saldos de lotes según código). |

Constante de ubicación depósito: **`CENTRAL`** (`UBICACION_DEPOSITO_CENTRAL`).

### 3.4 Campamento / sub-depósito — `/campamento` (`admin_campamento`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **CampamentoRecepcionPage** | Recepción de mercadería en tránsito (cierre de egreso `EN_TRANSITO` → `RECIBIDO` para la `ubicacionId` del usuario). |
| **CampamentoSolicitudPage** | Solicitudes de mercadería al depósito (misma UI embebida que cocina, con rutas de detalle campamento). |
| **CampamentoInventarioPage** | Inventario local / kardex por `ubicacionId` del usuario; export Excel (hoja “Por lote” + “Resumen”). |
| **CampamentoComandasPage** | Listado y gestión de comandas de consumo diario (egresos vinculados a `movimientos_inventario`). |
| **CampamentoNuevaComandaPage** | Alta de comanda con ítems desde stock de la ubicación. |
| **DashboardComensalesPage** | Métricas y listados de registros de comedor (supervisión). |
| **SolicitudMercaderiaDetallePage** | Igual que en admin, con “volver” al listado campamento. |

### 3.5 Hotelería Casposo — `/hoteleria` (`hoteleria_casposo`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **MapaCamasPage** | Estado de camas, check-in / check-out, cambio de cama, operaciones masivas donde existan en UI (`camas`, `historial_pernoctes`, `padron_personas`). |
| **PadronPage** | ABM e importación de **padrón de personas** (`padron_personas`). |
| **PernoctesPage** | Reportes e historial de pernoctes (`historial_pernoctes`). |
| **ReporteLimpiezaPage** | Registro y listado de limpiezas por cama (`historial_limpiezas`). |
| **ConfiguracionHoteleriaPage** | Parámetros de módulo hotelería según implementación. |

### 3.6 Terminal comedor — `/comedor` (`terminal_comedor`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **TerminalComensalesPage** | Modo **QR** (cámara, `html5-qrcode`), **manual** por DNI, **historial** del día; resolución de servicio según horario (`useServicioComedor`); modo nochero (`CENA_NOCHERO`); indicador **online/offline**; cola offline (`encolarRegistroComedor`) hacia `registros_comedor`; búsqueda de persona en `padron_personas` por DNI; beep de éxito. |

### 3.7 Analista / gerencia — `/analista` (`analista`, `gerencia`)

| Vista | Funciones de negocio principales |
|-------|-----------------------------------|
| **AnalistaDashboardPage** | Dashboard financiero: capital inmovilizado (`saldo_lotes` + `insumos`), costo por egresos, índice de decomiso; gráfico dual egresos vs asistencias (`recharts`); export Excel. |
| **AnalistaLiquidacionesPage** | Liquidación contratistas: resumen por empresa (`registros_comedor` + `historial_pernoctes`), detalle comedor paginado, export multi-hoja. |
| **AnalistaAuditoriaPage** | Casposo: comandas de consumo vs asistencias por día; Cocina central: eficiencia de receta (`produccion_cocina`). |
| **AnalistaMovimientosPage** | Dataset crudo `movimientos_inventario` con filtros y export Excel (incluye destino/receptor/comanda). |

### 3.8 Componentes compartidos relevantes

- **`InventarioUbicacionPanel`:** usado en **cocina** (pestaña Mercadería) y **campamento** (página Inventario); suscripción a movimientos filtrados por `ubicacionId` del usuario, agregación por lote FEFO, filtros, paginación, Excel. El **depósito** usa **`DepositoInventarioPage`**, implementación paralela centrada en **CENTRAL**.
- **`RecepcionTrasladoContenido`:** recepción en cocina/campamento de egresos en tránsito.
- **Exports PDF:** p. ej. `mercaderiaPdf.ts`, `movimientosInventarioExport.ts`, `campamentoRecepcionPdf.ts` según pantallas que los invoquen.

---

## 4. Base de datos — colecciones Firestore

Lista **cerrada por reglas** en `firestore.rules` (más `usuarios`). Cualquier otra ruta cae en `match /{document=**}` → denegado.

| Colección | Uso resumido (desde código / reglas) |
|-----------|--------------------------------------|
| **`usuarios`** | Perfil staff: `rol`, opcional `ubicacionId`. Lectura solo del propio UID; escritura denegada desde cliente (gestión externa). |
| **`menu`** | Platos (`principal` / `guarnicion`), stock, opcional `recetaId`. CRUD cocina; cualquier usuario autenticado puede **solo bajar** `stock` (descuento por pedido). |
| **`pedidos`** | Pedidos de menú (cliente o staff). Creación con validación mínima; lectura cocina y analista; update/delete cocina. |
| **`insumos`** | Catálogo maestro de insumos (nombre genérico, marca, rubros, unidad base, costos, etc.). Lectura roles operativos; escritura depósito o analista según regla. |
| **`categorias`** | Rubros y subrubros para clasificación; depósito CRUD; lectura staff operativo. |
| **`recetario`** | Recetas / fichas técnicas; lectura cocina, depósito, analista; escritura cocina. |
| **`solicitudes_mercaderia`** | Solicitudes cocina/campamento ↔ depósito (estado, ítems, observaciones). Creación cocina o campamento; actualización cocina/depósito/campamento; delete solo depósito. |
| **`movimientos_inventario`** | Ledger de inventario: ingresos, egresos, decomisos, traslados con `ubicacionId`, ítems con lote y vencimiento, estados de traslado, etc. Lectura roles indicados; creación según ubicación; update especial para recepción; delete depósito. |
| **`saldo_lotes`** | Saldos agregados por clave de lote (materialización / control); escritura depósito o quien crea movimiento en ubicación permitida. |
| **`produccion_cocina`** | Registro de corridas de producción (porciones, costos teóricos/reales, vínculos a egreso/ingreso); solo creación desde cocina con campos obligatorios; sin update/delete por reglas. |
| **`padron_personas`** | Personas alojadas/comedor: DNI, nombre, empresa, etc. Lectura hotelería, terminal comedor y campamento; escritura solo hotelería. |
| **`registros_comedor`** | Marca de asistencia por servicio y día operativo; alta terminal (campos estrictos) o supervisor campamento (carga manual con observaciones); sin update/delete. |
| **`camas`** | Inventario de camas y ocupación actual; solo hotelería. |
| **`historial_limpiezas`** | Eventos de limpieza por cama; alta y lectura hotelería; sin update/delete. |
| **`historial_pernoctes`** | Estadías (check-in/out, cambios de cama, etc.); CRUD hotelería según reglas. |

### 4.1 Ubicaciones lógicas de inventario (constantes en código)

- **`CENTRAL`** — depósito.
- **`COCINA`** — cocina central (fallback usuario cocina).
- **`CASPOSO`** — campamento Casposo (fallback usuario campamento).

Estas cadenas aparecen en documentos de `movimientos_inventario` y en validaciones de reglas (`cocinaUbicacionUsuario`, `campamentoUbicacionUsuario`).

---

## 5. Referencias de archivos clave

| Tema | Archivo(s) |
|------|------------|
| Rutas | `src/App.tsx` |
| RBAC ruta | `src/components/ProtectedRoute.tsx` |
| Rol y ubicación | `src/context/AuthContext.tsx` |
| Reglas BD | `firestore.rules` |
| Movimientos y ubicaciones | `src/lib/movimientosInventario.ts` |
| Menú y pedidos | `src/lib/menu.ts` |
| Hotelería | `src/lib/hoteleria.ts`, `src/types/hoteleria.ts` |
| Comedor / terminal | `src/lib/comedor.ts`, `src/types/comedor.ts` |
| Solicitudes mercadería | `src/lib/solicitudesMercaderia.ts` |

---

*Documento generado como inventario del código; ante cualquier despliegue, validar que las reglas Firestore publicadas coincidan con el repositorio (`npm run deploy:firestore-rules`).*
