import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'

export const COLLECTION_SOLICITUDES = 'solicitudes_mercaderia'

export type PrioridadSolicitud = 'Normal' | 'Alta' | 'Urgente'

/** Estados del ciclo logístico (cocina ↔ depósito). */
export type EstadoSolicitud =
  | 'Pendiente'
  | 'En Preparación'
  | 'Enviado'
  | 'Recibido'
  | 'Rechazado'

/** Estados que el depósito puede asignar (no puede marcar Recibido). */
export type EstadoSolicitudDeposito = Exclude<EstadoSolicitud, 'Recibido'>

export const ESTADOS_DEPOSITO: EstadoSolicitudDeposito[] = [
  'Pendiente',
  'En Preparación',
  'Enviado',
  'Rechazado',
]

/** Colores de badge para tablas / UI (Pendiente → Rechazado). */
export function estiloBadgeEstadoSolicitud(estado: EstadoSolicitud): {
  backgroundColor: string
  color: string
} {
  switch (estado) {
    case 'Pendiente':
      return { backgroundColor: '#f3f4f6', color: '#4b5563' }
    case 'En Preparación':
      return { backgroundColor: 'rgba(190, 24, 24, 0.12)', color: '#be1818' }
    case 'Enviado':
      return { backgroundColor: '#e5e7eb', color: '#374151' }
    case 'Recibido':
      return { backgroundColor: '#f5f5f5', color: '#525252' }
    case 'Rechazado':
      return { backgroundColor: '#fee2e2', color: '#991b1b' }
    default:
      return { backgroundColor: '#f3f4f6', color: '#374151' }
  }
}

export interface ItemSolicitudMercaderia {
  producto: string
  cantidad: number
  unidadMedida: string
  presentacion: string
  observacion: string
}

export interface SolicitudMercaderia {
  id: string
  fechaCreacion: Date | null
  /** Valor del input date (YYYY-MM-DD) o texto legible según se guardó */
  fechaEntregaEsperada: string
  prioridad: PrioridadSolicitud
  estado: EstadoSolicitud
  observacionesDeposito: string
  /** Notas de cocina al confirmar recepción (opcional). */
  observacionesRecepcion: string
  items: ItemSolicitudMercaderia[]
}

export interface CrearSolicitudMercaderiaInput {
  fechaEntregaEsperada: string
  prioridad: PrioridadSolicitud
  items: ItemSolicitudMercaderia[]
}

function mapItem(raw: unknown): ItemSolicitudMercaderia | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const producto = typeof o.producto === 'string' ? o.producto.trim() : ''
  const cantidad =
    typeof o.cantidad === 'number' && Number.isFinite(o.cantidad)
      ? o.cantidad
      : Number(o.cantidad)
  const unidadMedida =
    typeof o.unidadMedida === 'string' ? o.unidadMedida.trim() : ''
  const presentacion =
    typeof o.presentacion === 'string' ? o.presentacion.trim() : ''
  const observacion =
    typeof o.observacion === 'string' ? o.observacion.trim() : ''
  if (!producto || !Number.isFinite(cantidad) || cantidad <= 0) return null
  return {
    producto,
    cantidad,
    unidadMedida: unidadMedida || '—',
    presentacion: presentacion || '—',
    observacion,
  }
}

function mapDoc(id: string, data: Record<string, unknown>): SolicitudMercaderia {
  const fechaRaw = data.fechaCreacion
  let fechaCreacion: Date | null = null
  if (fechaRaw instanceof Timestamp) {
    fechaCreacion = fechaRaw.toDate()
  }

  const fechaEntregaEsperada =
    typeof data.fechaEntregaEsperada === 'string'
      ? data.fechaEntregaEsperada
      : ''

  const prioridadRaw = data.prioridad
  const prioridad: PrioridadSolicitud =
    prioridadRaw === 'Alta' || prioridadRaw === 'Urgente' ? prioridadRaw : 'Normal'

  const estadoRaw = data.estado
  let estado: EstadoSolicitud = 'Pendiente'
  if (estadoRaw === 'En Preparación') estado = 'En Preparación'
  else if (estadoRaw === 'Enviado') estado = 'Enviado'
  else if (estadoRaw === 'Recibido') estado = 'Recibido'
  else if (estadoRaw === 'Rechazado') estado = 'Rechazado'
  else if (estadoRaw === 'Entregado')
    estado = 'Recibido'

  const observacionesDeposito =
    typeof data.observacionesDeposito === 'string'
      ? data.observacionesDeposito
      : ''

  const observacionesRecepcion =
    typeof data.observacionesRecepcion === 'string'
      ? data.observacionesRecepcion
      : ''

  const itemsRaw = data.items
  const items: ItemSolicitudMercaderia[] = []
  if (Array.isArray(itemsRaw)) {
    for (const it of itemsRaw) {
      const m = mapItem(it)
      if (m) items.push(m)
    }
  }

  return {
    id,
    fechaCreacion,
    fechaEntregaEsperada,
    prioridad,
    estado,
    observacionesDeposito,
    observacionesRecepcion,
    items,
  }
}

/**
 * Suscripción en tiempo real a todas las solicitudes (más recientes primero).
 */
export function subscribeSolicitudesMercaderia(
  onChange: (rows: SolicitudMercaderia[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_SOLICITUDES),
    orderBy('fechaCreacion', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: SolicitudMercaderia[] = []
      snap.forEach((d) => {
        rows.push(mapDoc(d.id, d.data() as Record<string, unknown>))
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeSolicitudesMercaderia', err)
      onChange([])
    },
  )
}

export async function crearSolicitudMercaderia(
  input: CrearSolicitudMercaderiaInput,
): Promise<void> {
  const items = input.items
    .map((it) => ({
      producto: it.producto.trim(),
      cantidad: it.cantidad,
      unidadMedida: it.unidadMedida.trim() || '—',
      presentacion: it.presentacion.trim() || '—',
      observacion: it.observacion.trim(),
    }))
    .filter((it) => it.producto.length > 0 && it.cantidad > 0)

  if (items.length === 0) {
    throw new Error('Agregá al menos un insumo con producto y cantidad válidos.')
  }
  if (!input.fechaEntregaEsperada?.trim()) {
    throw new Error('Indicá la fecha de entrega esperada.')
  }

  const db = getDb()
  await addDoc(collection(db, COLLECTION_SOLICITUDES), {
    fechaCreacion: serverTimestamp(),
    fechaEntregaEsperada: input.fechaEntregaEsperada.trim(),
    prioridad: input.prioridad,
    estado: 'Pendiente' as EstadoSolicitud,
    observacionesDeposito: '',
    observacionesRecepcion: '',
    items,
  })
}

/**
 * Actualización desde depósito. Si `estado` se omite, no se modifica el campo (útil cuando ya está `Recibido`).
 */
export async function actualizarSolicitudMercaderiaDeposito(
  id: string,
  payload: {
    observacionesDeposito: string
    estado?: EstadoSolicitudDeposito
  },
): Promise<void> {
  const db = getDb()
  const patch: Record<string, unknown> = {
    observacionesDeposito: payload.observacionesDeposito.trim(),
  }
  if (payload.estado !== undefined) {
    patch.estado = payload.estado
  }
  await updateDoc(doc(db, COLLECTION_SOLICITUDES, id), patch)
}

/** Cocina confirma que recibió la mercadería enviada por depósito. */
export async function confirmarRecepcionMercaderia(
  id: string,
  observacionesRecepcion?: string,
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, COLLECTION_SOLICITUDES, id), {
    estado: 'Recibido' as EstadoSolicitud,
    observacionesRecepcion: (observacionesRecepcion ?? '').trim(),
  })
}
