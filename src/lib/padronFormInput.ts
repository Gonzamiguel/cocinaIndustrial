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
  return valor.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normalizarPersonaPadronInput(input: {
  dni: string
  nombre: string
  apellido: string
  empresa: string
}): { dni: string; nombre: string; apellido: string; empresa: string } {
  return {
    dni: sanitizarDniInput(input.dni),
    nombre: sanitizarNombreApellidoInput(input.nombre),
    apellido: sanitizarNombreApellidoInput(input.apellido),
    empresa: sanitizarEmpresaInput(input.empresa),
  }
}

export const MAX_LENGTH_DNI_PADRON = 9
