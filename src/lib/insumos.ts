import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'

export const COLLECTION_INSUMOS = 'insumos'

export const UNIDADES_BASE_INSUMO = ['Kg', 'Lt', 'Un'] as const
export type UnidadBaseInsumo = (typeof UNIDADES_BASE_INSUMO)[number]

export interface Insumo {
  id: string
  nombreGenerico: string
  marca: string
  /** Rubro opcional en Firestore (ej. lácteos). Si falta, la UI puede usar presentación. */
  categoria: string
  presentacion: string
  unidadBase: UnidadBaseInsumo
  contenidoNeto: number
  costoEnvase: number
  /** Denormalizado al guardar: costoEnvase / contenidoNeto */
  costoPorUnidadBase: number
}

export interface CrearInsumoInput {
  nombreGenerico: string
  marca: string
  presentacion: string
  unidadBase: UnidadBaseInsumo
  contenidoNeto: number
  costoEnvase: number
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/**
 * Costo unitario en unidad base (kg, litro o unidad suelta).
 * Retorna 0 si contenidoNeto no es positivo.
 */
export function computeCostoPorUnidadBase(
  costoEnvase: number,
  contenidoNeto: number,
): number {
  const c = Number(costoEnvase)
  const net = Number(contenidoNeto)
  if (!Number.isFinite(c) || !Number.isFinite(net) || net <= 0) return 0
  return c / net
}

/** Etiqueta para buscador y pedidos: "Tomate - Arcor (Lata 500g)" */
export function formatLabelInsumo(i: Pick<Insumo, 'nombreGenerico' | 'marca' | 'presentacion'>): string {
  const name = (i.nombreGenerico || '').trim()
  const brand = (i.marca || '').trim()
  const pres = (i.presentacion || '').trim()
  const left = brand ? `${name} - ${brand}` : name
  return pres ? `${left} (${pres})` : left
}

function mapInsumoDoc(id: string, data: Record<string, unknown>): Insumo {
  const unidadRaw = data.unidadBase
  const unidadBase: UnidadBaseInsumo = UNIDADES_BASE_INSUMO.includes(
    unidadRaw as UnidadBaseInsumo,
  )
    ? (unidadRaw as UnidadBaseInsumo)
    : 'Un'

  const contenidoNeto = clampNonNegative(Number(data.contenidoNeto))
  const costoEnvase = clampNonNegative(Number(data.costoEnvase))
  const costoPorUnidadBase = computeCostoPorUnidadBase(costoEnvase, contenidoNeto)

  return {
    id,
    nombreGenerico:
      typeof data.nombreGenerico === 'string' ? data.nombreGenerico.trim() : '',
    marca: typeof data.marca === 'string' ? data.marca.trim() : '',
    categoria:
      typeof data.categoria === 'string' ? data.categoria.trim() : '',
    presentacion:
      typeof data.presentacion === 'string' ? data.presentacion.trim() : '',
    unidadBase,
    contenidoNeto,
    costoEnvase,
    costoPorUnidadBase,
  }
}

function buildInsumoPayload(input: CrearInsumoInput): {
  nombreGenerico: string
  marca: string
  presentacion: string
  unidadBase: UnidadBaseInsumo
  contenidoNeto: number
  costoEnvase: number
  costoPorUnidadBase: number
} {
  const nombreGenerico = input.nombreGenerico.trim()
  const marca = input.marca.trim()
  const presentacion = input.presentacion.trim()
  const contenidoNeto = Number(input.contenidoNeto)
  const costoEnvase = Number(input.costoEnvase)

  if (!nombreGenerico) {
    throw new Error('Ingresá el nombre genérico del insumo.')
  }
  if (!UNIDADES_BASE_INSUMO.includes(input.unidadBase)) {
    throw new Error('Seleccioná una unidad base válida (Kg, Lt o Un).')
  }
  if (!Number.isFinite(contenidoNeto) || contenidoNeto <= 0) {
    throw new Error('El contenido neto debe ser mayor a 0.')
  }
  if (!Number.isFinite(costoEnvase) || costoEnvase < 0) {
    throw new Error('El costo del envase no puede ser negativo.')
  }

  const costoPorUnidadBase = computeCostoPorUnidadBase(costoEnvase, contenidoNeto)

  return {
    nombreGenerico,
    marca,
    presentacion,
    unidadBase: input.unidadBase,
    contenidoNeto,
    costoEnvase: clampNonNegative(costoEnvase),
    costoPorUnidadBase: clampNonNegative(costoPorUnidadBase),
  }
}

export function subscribeInsumos(
  onChange: (rows: Insumo[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_INSUMOS),
    orderBy('nombreGenerico', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: Insumo[] = []
      snap.forEach((d) => {
        rows.push(mapInsumoDoc(d.id, d.data() as Record<string, unknown>))
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeInsumos', err)
      onChange([])
    },
  )
}

export async function crearInsumo(input: CrearInsumoInput): Promise<string> {
  const payload = buildInsumoPayload(input)
  const db = getDb()
  const ref = await addDoc(collection(db, COLLECTION_INSUMOS), {
    ...payload,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarInsumo(
  id: string,
  input: CrearInsumoInput,
): Promise<void> {
  const payload = buildInsumoPayload(input)
  const db = getDb()
  await updateDoc(doc(db, COLLECTION_INSUMOS, id), {
    ...payload,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarInsumo(id: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, COLLECTION_INSUMOS, id))
}

/**
 * Costo de una fila de receta: cantidad en unidad base × costo unitario × (1 + merma/100).
 * La merma incrementa el costo (más material requerido).
 */
export function costoFilaRecetaFromInsumo(
  cantidadBruta: number,
  porcentajeMerma: number,
  costoPorUnidadBase: number,
): number {
  const q = clampNonNegative(cantidadBruta)
  const m = clampNonNegative(porcentajeMerma)
  const unit = clampNonNegative(costoPorUnidadBase)
  return q * unit * (1 + m / 100)
}
