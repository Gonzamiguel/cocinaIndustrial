import type { PadronPersona } from './hoteleria'

/** Payload del modal de ajuste manual (null historialId = alta nueva). */
export type RegistroAjusteEstadia = {
  historialId: string | null
  personaId: string
  persona: PadronPersona | null
  fechaCheckIn: string
  fechaCheckOut: string
  habitacionCama: string
  camaId: string
}
