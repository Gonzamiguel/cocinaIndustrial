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

/** Ruta de inicio post-login en el MVP; `null` si el rol no tiene módulo activo. */
export function rutaHomePorRol(rol: UserRole): string | null {
  if (esRolPanelControl(rol)) return '/control'
  if (esRolTerminalCampo(rol)) return '/terminal'
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
  return false
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
