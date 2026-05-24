/** Empresa registrada en el padrón corporativo (contratistas / clientes). */
export interface PadronEmpresa {
  id: string
  nombre: string
  /** Opcional; vacío si no se cargó. */
  cuit: string
  creadoEn: Date | null
}

export interface FilaImportPadronEmpresa {
  nombre: string
  cuit?: string
}
