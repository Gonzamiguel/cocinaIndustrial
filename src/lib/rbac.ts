/**
 * Constantes y helpers de roles (RBAC) — segregación de funciones (6 roles).
 * Los literales deben coincidir con `usuarios/{uid}.rol` y `AuthContext`.
 */

import type { UserRole } from '../context/AuthContext'

/** Todos los roles con acceso al prefijo `/control`. */
export const ROLES_CONTROL = [
  'administrativo_campamento',
  'administrativo_finanzas',
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

/** Finanzas — escritura (OC, tesorería, liquidaciones; sin aprobar OC). */
export const ROLES_FINANZAS_ESCRITURA = [
  'administrativo_finanzas',
] as const satisfies readonly UserRole[]

export type RolFinanzasEscritura = (typeof ROLES_FINANZAS_ESCRITURA)[number]

/** Finanzas — lectura (incluye gerencia y analista). */
export const ROLES_FINANZAS_LECTURA = [
  'administrativo_finanzas',
  'gerencia',
  'analista',
] as const satisfies readonly UserRole[]

export type RolFinanzasLectura = (typeof ROLES_FINANZAS_LECTURA)[number]

/** Terminal de comedor (quiosco). */
export const ROLES_TERMINAL = ['administrativo_campamento'] as const satisfies readonly UserRole[]

export type RolTerminal = (typeof ROLES_TERMINAL)[number]

/** Depósito central. */
export const ROLES_DEPOSITO = ['admin_deposito'] as const satisfies readonly UserRole[]

export type RolDeposito = (typeof ROLES_DEPOSITO)[number]

/** Lectura global sin silo por `ubicacionId`. */
export const ROLES_VISION_GLOBAL_LECTURA = [
  'analista',
  'gerencia',
  'administrativo_finanzas',
] as const satisfies readonly UserRole[]

export type RolVisionGlobalLectura = (typeof ROLES_VISION_GLOBAL_LECTURA)[number]

export function esRolControl(rol: string | null | undefined): rol is RolControl {
  return (
    rol === 'administrativo_campamento' ||
    rol === 'administrativo_finanzas' ||
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

/** @deprecated Usar `esRolFinanzasLectura`. */
export function esRolTesoreria(rol: string | null | undefined): rol is RolFinanzasLectura {
  return esRolFinanzasLectura(rol)
}

export function esRolTerminal(rol: string | null | undefined): rol is RolTerminal {
  return rol === 'administrativo_campamento'
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
    rol === 'administrativo_finanzas'
  )
}

/** Gerencia: único rol que aprueba OC. */
export function puedeAprobarOc(rol: string | null | undefined): boolean {
  return rol === 'gerencia'
}

/** Administrativo finanzas: crear/enviar OC, tesorería y liquidaciones. */
export function puedeOperarFinanzas(rol: string | null | undefined): boolean {
  return rol === 'administrativo_finanzas'
}

/** Ruta de inicio post-login; `null` si el rol no tiene módulo activo. */
export function rutaHomePorRol(rol: UserRole): string | null {
  if (rol === 'administrativo_finanzas') return '/control/compras'
  if (esRolControl(rol)) return '/control'
  if (esRolDeposito(rol)) return '/deposito'
  if (esRolAdminCocina(rol)) return '/admin/pedidos'
  return null
}

export function rolPuedeAccederRuta(rol: UserRole, pathname: string): boolean {
  if (pathname === '/control' || pathname.startsWith('/control/')) {
    return esRolControl(rol)
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
  if (pathname === '/analista' || pathname.startsWith('/analista/')) {
    return rol === 'gerencia' || rol === 'analista'
  }
  if (pathname === '/campamento' || pathname.startsWith('/campamento/')) {
    return rol === 'administrativo_campamento'
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
