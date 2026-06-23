/**
 * Lectura/escritura de saldos contables en `padron_empresas`.
 * - saldoProveedor: pasivo (cuentas por pagar).
 * - saldoCliente: activo (cuentas por cobrar / contratistas).
 */

import { deleteField } from 'firebase/firestore'

const MONEY_PRECISION = 100

export function roundMoneySaldo(n: number): number {
  return Math.round(n * MONEY_PRECISION) / MONEY_PRECISION
}

function condicionesRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const cond = raw.condicionesComerciales
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    return { ...(cond as Record<string, unknown>) }
  }
  return {}
}

/** Lee cuentas por pagar (solo `condicionesComerciales.saldoProveedor`). */
export function leerSaldoProveedor(raw: Record<string, unknown>): number {
  const cond = condicionesRaw(raw)
  const saldo = Number(cond.saldoProveedor)
  if (!Number.isFinite(saldo)) return 0
  return roundMoneySaldo(Math.max(0, saldo))
}

/** Lee cuentas por cobrar (solo `condicionesComerciales.saldoCliente`). */
export function leerSaldoCliente(raw: Record<string, unknown>): number {
  const cond = condicionesRaw(raw)
  const saldo = Number(cond.saldoCliente)
  if (!Number.isFinite(saldo)) return 0
  return roundMoneySaldo(Math.max(0, saldo))
}

/** Elimina el campo legacy en Firestore (merge profundo no borra claves omitidas). */
const LEGACY_SALDO_CC_DELETE = {
  'condicionesComerciales.saldoCuentaCorriente': deleteField(),
} as const

/** Patch merge-safe: actualiza solo `saldoProveedor`, preserva `saldoCliente` y demás campos. */
export function patchCondicionesSaldoProveedor(
  raw: Record<string, unknown>,
  saldoProveedor: number,
): Record<string, unknown> {
  const prev = condicionesRaw(raw)
  delete prev.saldoCuentaCorriente
  return {
    condicionesComerciales: {
      ...prev,
      saldoProveedor: roundMoneySaldo(Math.max(0, saldoProveedor)),
    },
    ...LEGACY_SALDO_CC_DELETE,
  }
}

/** Patch merge-safe: actualiza solo `saldoCliente`, preserva `saldoProveedor` y demás campos. */
export function patchCondicionesSaldoCliente(
  raw: Record<string, unknown>,
  saldoCliente: number,
): Record<string, unknown> {
  const prev = condicionesRaw(raw)
  delete prev.saldoCuentaCorriente
  return {
    condicionesComerciales: {
      ...prev,
      saldoCliente: roundMoneySaldo(Math.max(0, saldoCliente)),
    },
    ...LEGACY_SALDO_CC_DELETE,
  }
}
