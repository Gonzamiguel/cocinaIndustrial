/** Solo dígitos; sin puntos ni letras. */
export function sanitizarDniInput(valor: string, maxLength = 9): string {
  return valor.replace(/\D/g, '').slice(0, maxLength)
}

/** Letras (con acentos/ñ) y espacios; forzado a mayúsculas. */
export function sanitizarNombreApellidoInput(valor: string): string {
  return valor.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').toUpperCase()
}

/** Cualquier carácter permitido; forzado a mayúsculas. */
export function sanitizarEmpresaInput(valor: string): string {
  return valor.toUpperCase()
}

export const MAX_LENGTH_DNI_PADRON = 9
