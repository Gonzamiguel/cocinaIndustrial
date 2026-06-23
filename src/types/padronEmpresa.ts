/** Empresa registrada en el padrón corporativo (contratistas / clientes / proveedores). */
export interface PadronEmpresa {
  id: string
  nombre: string
  /** Opcional; vacío si no se cargó. */
  cuit: string
  creadoEn: Date | null
}

/**
 * Saldos contables en `condicionesComerciales` (ver `PadronEmpresaExtendido` en `types/compras.ts`).
 * - saldoProveedor: pasivo (cuentas por pagar).
 * - saldoCliente: activo (cuentas por cobrar).
 */
export interface SaldosFinancierosEmpresa {
  saldoProveedor?: number
  saldoCliente?: number
}

export interface FilaImportPadronEmpresa {
  nombre: string
  cuit?: string
}
