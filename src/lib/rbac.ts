/**

 * Constantes y helpers de roles (RBAC) — segregación de funciones (9 roles).

 * Los literales deben coincidir con `usuarios/{uid}.rol` y `AuthContext`.

 */



import type { UserRole } from '../context/AuthContext'



/** Todos los roles con acceso al prefijo `/control`. */

export const ROLES_CONTROL = [

  'administrativo_campamento',

  'administrativo_finanzas',

  'administrativo_liquidaciones',

  'gerencia',

  'analista',

] as const satisfies readonly UserRole[]



export type RolControl = (typeof ROLES_CONTROL)[number]



/** Panel operativo: comensales, hotelería, padrón (sin finanzas puras). */

export const ROLES_PANEL_CONTROL = [

  'administrativo_campamento',

  'gerencia',

  'analista',

] as const satisfies readonly UserRole[]



export type RolPanelControl = (typeof ROLES_PANEL_CONTROL)[number]



/** Escritura en módulos operativos de `/control`. */

export const ROLES_PANEL_CONTROL_ESCRITURA = [

  'administrativo_campamento',

] as const satisfies readonly UserRole[]



export type RolPanelControlEscritura = (typeof ROLES_PANEL_CONTROL_ESCRITURA)[number]



/** Compras + tesorería — escritura (sin aprobar OC ni liquidaciones). */

export const ROLES_FINANZAS_ESCRITURA = [

  'administrativo_finanzas',

] as const satisfies readonly UserRole[]



export type RolFinanzasEscritura = (typeof ROLES_FINANZAS_ESCRITURA)[number]



/** Compras + tesorería — lectura (gerencia / analista supervisan). */

export const ROLES_FINANZAS_LECTURA = [

  'administrativo_finanzas',

  'gerencia',

  'analista',

] as const satisfies readonly UserRole[]



export type RolFinanzasLectura = (typeof ROLES_FINANZAS_LECTURA)[number]



/** Liquidaciones contratistas — escritura. */

export const ROLES_LIQUIDACIONES_ESCRITURA = [

  'administrativo_liquidaciones',

] as const satisfies readonly UserRole[]



export type RolLiquidacionesEscritura = (typeof ROLES_LIQUIDACIONES_ESCRITURA)[number]



/** Liquidaciones — lectura. */

export const ROLES_LIQUIDACIONES_LECTURA = [

  'administrativo_liquidaciones',

  'gerencia',

  'analista',

] as const satisfies readonly UserRole[]



export type RolLiquidacionesLectura = (typeof ROLES_LIQUIDACIONES_LECTURA)[number]



/** Logística de campamento (inventario, solicitudes, comandas, recepción). */

export const ROLES_LOGISTICA_CAMPAMENTO_ESCRITURA = [

  'administrativo_campamento',

] as const satisfies readonly UserRole[]



/** Lectura logística campamento (gerencia / analista — consultas). */

export const ROLES_LOGISTICA_CAMPAMENTO_LECTURA = [

  'administrativo_campamento',

  'gerencia',

  'analista',

] as const satisfies readonly UserRole[]



/** Terminal de comedor (quiosco / registro de accesos). */

export const ROLES_TERMINAL = ['control_comedor'] as const satisfies readonly UserRole[]



export type RolTerminal = (typeof ROLES_TERMINAL)[number]



/** Depósito central. */

export const ROLES_DEPOSITO = ['admin_deposito'] as const satisfies readonly UserRole[]



export type RolDeposito = (typeof ROLES_DEPOSITO)[number]



/** Lectura global sin silo por `ubicacionId`. */

export const ROLES_VISION_GLOBAL_LECTURA = [

  'analista',

  'gerencia',

  'administrativo_finanzas',

  'administrativo_liquidaciones',

] as const satisfies readonly UserRole[]



export type RolVisionGlobalLectura = (typeof ROLES_VISION_GLOBAL_LECTURA)[number]



export function esRolControl(rol: string | null | undefined): rol is RolControl {

  return (

    rol === 'administrativo_campamento' ||

    rol === 'administrativo_finanzas' ||

    rol === 'administrativo_liquidaciones' ||

    rol === 'gerencia' ||

    rol === 'analista'

  )

}



export function esRolPanelControl(rol: string | null | undefined): rol is RolPanelControl {

  return (

    rol === 'administrativo_campamento' ||

    rol === 'gerencia' ||

    rol === 'analista'

  )

}



export function esRolPanelControlEscritura(

  rol: string | null | undefined,

): rol is RolPanelControlEscritura {

  return rol === 'administrativo_campamento'

}



export function esRolFinanzasEscritura(

  rol: string | null | undefined,

): rol is RolFinanzasEscritura {

  return rol === 'administrativo_finanzas'

}



export function esRolFinanzasLectura(rol: string | null | undefined): rol is RolFinanzasLectura {

  return (

    rol === 'administrativo_finanzas' ||

    rol === 'gerencia' ||

    rol === 'analista'

  )

}



export function esRolLiquidacionesEscritura(

  rol: string | null | undefined,

): rol is RolLiquidacionesEscritura {

  return rol === 'administrativo_liquidaciones'

}



export function esRolLiquidacionesLectura(

  rol: string | null | undefined,

): rol is RolLiquidacionesLectura {

  return (

    rol === 'administrativo_liquidaciones' ||

    rol === 'gerencia' ||

    rol === 'analista'

  )

}



/** @deprecated Usar `esRolFinanzasLectura`. */

export function esRolTesoreria(rol: string | null | undefined): rol is RolFinanzasLectura {

  return esRolFinanzasLectura(rol)

}



export function esRolLogisticaCampamentoEscritura(

  rol: string | null | undefined,

): rol is (typeof ROLES_LOGISTICA_CAMPAMENTO_ESCRITURA)[number] {

  return rol === 'administrativo_campamento'

}



export function esRolLogisticaCampamentoLectura(

  rol: string | null | undefined,

): boolean {

  return (

    rol === 'administrativo_campamento' ||

    rol === 'gerencia' ||

    rol === 'analista'

  )

}



export function esRolControlComedor(rol: string | null | undefined): rol is RolTerminal {

  return rol === 'control_comedor'

}



export function esRolTerminal(rol: string | null | undefined): rol is RolTerminal {

  return rol === 'control_comedor'

}



/** @deprecated Usar `esRolTerminal`. */

export function esRolTerminalCampo(rol: string | null | undefined): rol is RolTerminal {

  return esRolTerminal(rol)

}



export function esRolDeposito(rol: string | null | undefined): rol is RolDeposito {

  return rol === 'admin_deposito'

}



export function esRolAdminCocina(rol: string | null | undefined): boolean {

  return rol === 'admin_cocina'

}



/** Nutrición: recetario, costos y planificación de menú. */

export const ROLES_NUTRICION = ['nutricion'] as const satisfies readonly UserRole[]



export type RolNutricion = (typeof ROLES_NUTRICION)[number]



export function esRolNutricion(rol: string | null | undefined): rol is RolNutricion {

  return rol === 'nutricion'

}



export function esRolGerencia(rol: string | null | undefined): boolean {

  return rol === 'gerencia'

}



export function esRolAnalista(rol: string | null | undefined): boolean {

  return rol === 'analista'

}



export function esRolVisionGlobalLectura(

  rol: string | null | undefined,

): rol is RolVisionGlobalLectura {

  return (

    rol === 'analista' ||

    rol === 'gerencia' ||

    rol === 'administrativo_finanzas' ||

    rol === 'administrativo_liquidaciones'

  )

}



/** Gerencia: único rol que aprueba OC. */

export function puedeAprobarOc(rol: string | null | undefined): boolean {

  return rol === 'gerencia'

}



/** Compras + tesorería (cuentas por pagar). */

export function puedeOperarFinanzas(rol: string | null | undefined): boolean {

  return rol === 'administrativo_finanzas'

}



/** Liquidaciones a contratistas (cuentas por cobrar). */

export function puedeOperarLiquidaciones(rol: string | null | undefined): boolean {

  return rol === 'administrativo_liquidaciones'

}



/** Ruta de inicio post-login; `null` si el rol no tiene módulo activo. */

export function rutaHomePorRol(rol: UserRole): string | null {

  if (rol === 'administrativo_finanzas') return '/control/compras'

  if (rol === 'administrativo_liquidaciones') return '/control/liquidaciones'

  if (esRolTerminal(rol)) return '/terminal'

  if (esRolControl(rol)) return '/control'

  if (esRolDeposito(rol)) return '/deposito'

  if (esRolAdminCocina(rol)) return '/admin/pedidos'

  if (esRolNutricion(rol)) return '/nutricion'

  return null

}



export function rolPuedeAccederRuta(rol: UserRole, pathname: string): boolean {

  if (pathname === '/control' || pathname.startsWith('/control/')) {

    if (pathname === '/control/compras' || pathname.startsWith('/control/compras/')) {

      return esRolFinanzasLectura(rol)

    }

    if (pathname === '/control/tesoreria' || pathname.startsWith('/control/tesoreria/')) {

      return esRolFinanzasLectura(rol)

    }

    if (pathname === '/control/proveedores' || pathname.startsWith('/control/proveedores/')) {

      return esRolFinanzasLectura(rol)

    }

    if (pathname === '/control/liquidaciones' || pathname.startsWith('/control/liquidaciones/')) {

      return esRolLiquidacionesLectura(rol)

    }

    return esRolControl(rol) && (esRolPanelControl(rol) || esRolFinanzasLectura(rol))

  }

  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) {

    return esRolTerminal(rol)

  }

  if (pathname === '/deposito' || pathname.startsWith('/deposito/')) {

    return esRolDeposito(rol)

  }

  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/admin-cocina') {

    return esRolAdminCocina(rol)

  }

  if (pathname === '/nutricion' || pathname.startsWith('/nutricion/')) {

    return esRolNutricion(rol)

  }

  if (pathname === '/analista' || pathname.startsWith('/analista/')) {

    return rol === 'gerencia' || rol === 'analista'

  }

  if (pathname === '/campamento' || pathname.startsWith('/campamento/')) {

    return esRolLogisticaCampamentoLectura(rol)

  }

  if (pathname === '/hoteleria' || pathname.startsWith('/hoteleria/')) {

    return rol === 'administrativo_campamento'

  }

  return false

}



/** Switcher legacy campamento ↔ hotelería. */

export function esAdministrativoCampamentoLegacy(

  rol: string | null | undefined,

): boolean {

  return rol === 'administrativo_campamento'

}


