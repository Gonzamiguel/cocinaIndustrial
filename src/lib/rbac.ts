/**
 * Constantes y helpers de roles (RBAC) compartidos sin acoplar a React.
 * Los literales deben coincidir con `usuarios/{uid}.rol` y `AuthContext`.
 */

/** Roles con lectura global de datos operativos (sin silo por `ubicacionId` en consultas). */
export const ROLES_VISION_GLOBAL_LECTURA = ['analista', 'gerencia'] as const

export type RolVisionGlobalLectura = (typeof ROLES_VISION_GLOBAL_LECTURA)[number]

export function esRolVisionGlobalLectura(rol: string | null | undefined): rol is RolVisionGlobalLectura {
  return rol === 'analista' || rol === 'gerencia'
}

/** Jefe de campamento: acceso UI a módulos campamento + hotelería (mismas operaciones que cada rol de silo). */
export function esJefeCampamento(rol: string | null | undefined): boolean {
  return rol === 'jefe_campamento'
}
