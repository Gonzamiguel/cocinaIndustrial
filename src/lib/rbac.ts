/**
 * Constantes y helpers de roles (RBAC) compartidos sin acoplar a React.
 * Los literales deben coincidir con `usuarios/{uid}.rol` y `AuthContext`.
 */

import type { UserRole } from '../context/AuthContext'

/** Panel MVP: comensales + hotelería (escritorio). */
export const ROLES_PANEL_CONTROL = [
  'admin_campamento',
  'hoteleria_casposo',
  'gerencia',
  'analista',
] as const satisfies readonly UserRole[]

export type RolPanelControl = (typeof ROLES_PANEL_CONTROL)[number]

/** Terminal móvil de campo (sin sidebar de escritorio). */
export const ROLES_TERMINAL_CAMPO = [
  'jefe_campamento',
  'terminal_comedor',
] as const satisfies readonly UserRole[]

export type RolTerminalCampo = (typeof ROLES_TERMINAL_CAMPO)[number]

/** Depósito central — inventario, movimientos y compras (Módulo A operativo). */
export const ROLES_DEPOSITO = ['admin_deposito'] as const satisfies readonly UserRole[]

export type RolDeposito = (typeof ROLES_DEPOSITO)[number]

export function esRolDeposito(rol: string | null | undefined): rol is RolDeposito {
  return rol === 'admin_deposito'
}

export function esRolPanelControl(rol: string | null | undefined): rol is RolPanelControl {
  return (
    rol === 'admin_campamento' ||
    rol === 'hoteleria_casposo' ||
    rol === 'gerencia' ||
    rol === 'analista'
  )
}

export function esRolTerminalCampo(rol: string | null | undefined): rol is RolTerminalCampo {
  return rol === 'jefe_campamento' || rol === 'terminal_comedor'
}

export function esRolAdminCocina(rol: string | null | undefined): boolean {
  return rol === 'admin_cocina'
}

/** Ruta de inicio post-login en el MVP; `null` si el rol no tiene módulo activo. */
export function rutaHomePorRol(rol: UserRole): string | null {
  if (esRolPanelControl(rol)) return '/control'
  if (esRolTerminalCampo(rol)) return '/terminal'
  if (esRolDeposito(rol)) return '/deposito'
  if (esRolAdminCocina(rol)) return '/admin/pedidos'
  return null
}

export function rolPuedeAccederRuta(
  rol: UserRole,
  pathname: string,
): boolean {
  if (pathname === '/control' || pathname.startsWith('/control/')) {
    return esRolPanelControl(rol)
  }
  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) {
    return esRolTerminalCampo(rol)
  }
  if (pathname === '/deposito' || pathname.startsWith('/deposito/')) {
    return esRolDeposito(rol)
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/admin-cocina') {
    return esRolAdminCocina(rol)
  }
  return false
}

/** Módulo B — Tesorería y cuentas por pagar (`/control/tesoreria`). */
export const ROLES_TESORERIA = ['gerencia', 'analista'] as const satisfies readonly UserRole[]

export type RolTesoreria = (typeof ROLES_TESORERIA)[number]

export function esRolTesoreria(rol: string | null | undefined): rol is RolTesoreria {
  return rol === 'gerencia' || rol === 'analista'
}

/** Roles con lectura global de datos operativos (sin silo por `ubicacionId` en consultas). */
export const ROLES_VISION_GLOBAL_LECTURA = ['analista', 'gerencia'] as const

export type RolVisionGlobalLectura = (typeof ROLES_VISION_GLOBAL_LECTURA)[number]

export function esRolVisionGlobalLectura(rol: string | null | undefined): rol is RolVisionGlobalLectura {
  return rol === 'analista' || rol === 'gerencia'
}

/** Escritura operativa en `/control` (hotelería, padrón, comensales). Incluye analista y gerencia. */
export const ROLES_PANEL_CONTROL_ESCRITURA = [
  'admin_campamento',
  'hoteleria_casposo',
  'gerencia',
  'analista',
] as const satisfies readonly UserRole[]

export type RolPanelControlEscritura = (typeof ROLES_PANEL_CONTROL_ESCRITURA)[number]

export function esRolPanelControlEscritura(
  rol: string | null | undefined,
): rol is RolPanelControlEscritura {
  return (
    rol === 'admin_campamento' ||
    rol === 'hoteleria_casposo' ||
    rol === 'gerencia' ||
    rol === 'analista'
  )
}

/** Jefe de campamento: acceso UI a módulos campamento + hotelería (mismas operaciones que cada rol de silo). */
export function esJefeCampamento(rol: string | null | undefined): boolean {
  return rol === 'jefe_campamento'
}
