import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'

export type CategoriaMenu = 'principal' | 'guarnicion'

export interface MenuItem {
  id: string
  nombre: string
  categoria: CategoriaMenu
  stock: number
}

const MENU_COLLECTION = 'menu'
const PEDIDOS_COLLECTION = 'pedidos'

export const LUGARES_ENTREGA = ['Oficinas', 'Depósito', 'Predio'] as const
export type LugarEntrega = (typeof LUGARES_ENTREGA)[number]

export type EstadoPedido = 'activo' | 'archivado'

export interface PedidoDelDia {
  id: string
  nombreCliente: string
  lugarEntrega: string
  platoPrincipal: string
  guarnicion: string
  fecha: Date | null
  estado: EstadoPedido
}

function esLugarEntregaValido(v: string): v is LugarEntrega {
  return (LUGARES_ENTREGA as readonly string[]).includes(v)
}

function mapPedidoDoc(id: string, data: Record<string, unknown>): PedidoDelDia {
  const fechaRaw = data.fecha ?? data.timestamp
  let fecha: Date | null = null
  if (fechaRaw instanceof Timestamp) {
    fecha = fechaRaw.toDate()
  }

  const nombreCliente =
    typeof data.nombreCliente === 'string' ? data.nombreCliente : '—'
  const lugarEntrega =
    typeof data.lugarEntrega === 'string' ? data.lugarEntrega : '—'
  const platoPrincipal =
    typeof data.platoPrincipal === 'string' ? data.platoPrincipal : '—'
  const guarnicion = typeof data.guarnicion === 'string' ? data.guarnicion : '—'

  const estadoRaw = data.estado
  const estado: EstadoPedido =
    estadoRaw === 'archivado' ? 'archivado' : 'activo'

  return {
    id,
    nombreCliente,
    lugarEntrega,
    platoPrincipal,
    guarnicion,
    fecha,
    estado,
  }
}

/** Pedido mínimo para analíticas del dashboard (todos los estados). */
export interface PedidoHistorico {
  id: string
  platoPrincipal: string
  guarnicion: string
  lugarEntrega: string
  fecha: Date | null
}

function mapPedidoHistorico(
  id: string,
  data: Record<string, unknown>,
): PedidoHistorico {
  const fechaRaw = data.fecha ?? data.timestamp
  let fecha: Date | null = null
  if (fechaRaw instanceof Timestamp) {
    fecha = fechaRaw.toDate()
  }
  return {
    id,
    platoPrincipal:
      typeof data.platoPrincipal === 'string' ? data.platoPrincipal : '—',
    guarnicion: typeof data.guarnicion === 'string' ? data.guarnicion : '—',
    lugarEntrega:
      typeof data.lugarEntrega === 'string' ? data.lugarEntrega : '—',
    fecha,
  }
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * Pedidos en un rango de fechas (inclusive), activos y archivados.
 * Usa `fecha`; si existe índice/consulta válida, complementa con `timestamp` para legado.
 */
export async function fetchPedidosPorRangoFecha(
  inicio: Date,
  fin: Date,
): Promise<PedidoHistorico[]> {
  const db = getDb()
  let dInicio = new Date(inicio)
  let dFin = new Date(fin)
  if (dInicio > dFin) {
    const t = dInicio
    dInicio = dFin
    dFin = t
  }
  const start = startOfDayLocal(dInicio)
  const end = endOfDayLocal(dFin)

  const startTs = Timestamp.fromDate(start)
  const endTs = Timestamp.fromDate(end)
  const merge = new Map<string, PedidoHistorico>()

  const qFecha = query(
    collection(db, PEDIDOS_COLLECTION),
    where('fecha', '>=', startTs),
    where('fecha', '<=', endTs),
    orderBy('fecha', 'asc'),
  )
  const snapFecha = await getDocs(qFecha)
  snapFecha.forEach((d) => {
    merge.set(
      d.id,
      mapPedidoHistorico(d.id, d.data() as Record<string, unknown>),
    )
  })

  try {
    const qTs = query(
      collection(db, PEDIDOS_COLLECTION),
      where('timestamp', '>=', startTs),
      where('timestamp', '<=', endTs),
      orderBy('timestamp', 'asc'),
    )
    const snapTs = await getDocs(qTs)
    snapTs.forEach((d) => {
      if (!merge.has(d.id)) {
        merge.set(
          d.id,
          mapPedidoHistorico(d.id, d.data() as Record<string, unknown>),
        )
      }
    })
  } catch (e) {
    console.warn(
      'fetchPedidosPorRangoFecha: sin consulta por timestamp (índice o campo)',
      e,
    )
  }

  return [...merge.values()].sort((a, b) => {
    const ta = a.fecha?.getTime() ?? 0
    const tb = b.fecha?.getTime() ?? 0
    return ta - tb
  })
}

/**
 * Pedidos activos en tiempo real (excluye archivados). Más recientes primero.
 * Requiere índice compuesto en Firestore: colección `pedidos` → estado + fecha.
 */
export function subscribePedidos(
  onChange: (pedidos: PedidoDelDia[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, PEDIDOS_COLLECTION),
    where('estado', '==', 'activo'),
    orderBy('fecha', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const pedidos: PedidoDelDia[] = []
      snap.forEach((d) => {
        pedidos.push(mapPedidoDoc(d.id, d.data() as Record<string, unknown>))
      })
      onChange(pedidos)
    },
    (err) => {
      console.error('subscribePedidos', err)
      onChange([])
    },
  )
}

function mapDoc(id: string, data: Record<string, unknown>): MenuItem {
  const categoria = data.categoria === 'guarnicion' ? 'guarnicion' : 'principal'
  const stock = typeof data.stock === 'number' ? data.stock : 0
  const nombre = typeof data.nombre === 'string' ? data.nombre : 'Sin nombre'
  return { id, nombre, categoria, stock }
}

/** Suscripción en tiempo real a todo el menú (ordenado por nombre). */
export function subscribeMenu(onChange: (items: MenuItem[]) => void): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, MENU_COLLECTION), orderBy('nombre'))
  return onSnapshot(
    q,
    (snap) => {
      const items: MenuItem[] = []
      snap.forEach((d) => {
        items.push(mapDoc(d.id, d.data() as Record<string, unknown>))
      })
      onChange(items)
    },
    (err) => {
      console.error('subscribeMenu', err)
      onChange([])
    },
  )
}

export async function addMenuItem(input: {
  nombre: string
  categoria: CategoriaMenu
  stock: number
}): Promise<void> {
  const db = getDb()
  const nombre = input.nombre.trim()
  if (!nombre) throw new Error('El nombre es obligatorio')
  if (input.stock < 0 || !Number.isFinite(input.stock)) {
    throw new Error('El stock debe ser un número válido ≥ 0')
  }
  await addDoc(collection(db, MENU_COLLECTION), {
    nombre,
    categoria: input.categoria,
    stock: Math.floor(input.stock),
  })
}

export async function updateMenuStock(id: string, stock: number): Promise<void> {
  if (stock < 0 || !Number.isFinite(stock)) {
    throw new Error('El stock debe ser un número válido ≥ 0')
  }
  const db = getDb()
  await updateDoc(doc(db, MENU_COLLECTION, id), { stock: Math.floor(stock) })
}

/** Actualiza el nombre del plato en la colección `menu`. */
export async function updateMenuNombre(id: string, nombre: string): Promise<void> {
  const db = getDb()
  const n = nombre.trim()
  if (!n) throw new Error('El nombre no puede estar vacío')
  await updateDoc(doc(db, MENU_COLLECTION, id), { nombre: n })
}

export async function deleteMenuItem(id: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, MENU_COLLECTION, id))
}

export interface ConfirmarPedidoInput {
  principalId: string | null
  guarnicionId: string | null
  nombreCliente: string
  lugarEntrega: string
}

/**
 * Descuenta stock según selección (solo principal, solo guarnición, o ambos).
 * Registra el pedido en `pedidos` en una sola transacción.
 */
export async function confirmarPedidoConTransaccion(
  input: ConfirmarPedidoInput,
): Promise<void> {
  const { principalId, guarnicionId, nombreCliente, lugarEntrega } = input

  const nombre = nombreCliente.trim()
  if (!nombre) {
    throw new Error('El nombre y apellido son obligatorios')
  }
  if (!lugarEntrega || !esLugarEntregaValido(lugarEntrega)) {
    throw new Error('Elegí un lugar de entrega válido')
  }

  const tienePrincipal = Boolean(principalId)
  const tieneGuarnicion = Boolean(guarnicionId)
  if (!tienePrincipal && !tieneGuarnicion) {
    throw new Error(
      'Debés elegir al menos un plato principal o una guarnición para realizar el pedido.',
    )
  }
  if (
    tienePrincipal &&
    tieneGuarnicion &&
    principalId === guarnicionId
  ) {
    throw new Error('El principal y la guarnición deben ser ítems distintos')
  }

  const db = getDb()
  const principalRef = principalId
    ? doc(db, MENU_COLLECTION, principalId)
    : null
  const guarnicionRef = guarnicionId
    ? doc(db, MENU_COLLECTION, guarnicionId)
    : null

  await runTransaction(db, async (transaction) => {
    let p: MenuItem | null = null
    let g: MenuItem | null = null

    if (principalRef) {
      const pSnap = await transaction.get(principalRef)
      if (!pSnap.exists()) {
        throw new Error('El plato principal seleccionado ya no existe')
      }
      p = mapDoc(pSnap.id, pSnap.data() as Record<string, unknown>)
      if (p.categoria !== 'principal') {
        throw new Error('La selección de plato principal no es válida')
      }
      if (p.stock < 1) {
        throw new Error('Stock insuficiente del plato principal')
      }
    }

    if (guarnicionRef) {
      const gSnap = await transaction.get(guarnicionRef)
      if (!gSnap.exists()) {
        throw new Error('La guarnición seleccionada ya no existe')
      }
      g = mapDoc(gSnap.id, gSnap.data() as Record<string, unknown>)
      if (g.categoria !== 'guarnicion') {
        throw new Error('La selección de guarnición no es válida')
      }
      if (g.stock < 1) {
        throw new Error('Stock insuficiente de la guarnición')
      }
    }

    if (principalRef && p) {
      transaction.update(principalRef, { stock: p.stock - 1 })
    }
    if (guarnicionRef && g) {
      transaction.update(guarnicionRef, { stock: g.stock - 1 })
    }

    const pedidoRef = doc(collection(db, PEDIDOS_COLLECTION))
    transaction.set(pedidoRef, {
      nombreCliente: nombre,
      lugarEntrega,
      platoPrincipal: p?.nombre ?? '—',
      guarnicion: g?.nombre ?? '—',
      fecha: serverTimestamp(),
      estado: 'activo',
    })
  })
}

const BATCH_LIMIT = 500

/**
 * Marca como archivados todos los pedidos que no lo estén (conserva historial).
 * Incluye documentos antiguos sin campo `estado` (se les asigna archivado).
 */
export async function archivarPedidosActivos(): Promise<number> {
  const db = getDb()
  const snap = await getDocs(collection(db, PEDIDOS_COLLECTION))
  let batch = writeBatch(db)
  let ops = 0
  let total = 0
  for (const d of snap.docs) {
    const data = d.data()
    if (data.estado === 'archivado') continue
    batch.update(d.ref, { estado: 'archivado' })
    ops++
    total++
    if (ops >= BATCH_LIMIT) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return total
}

