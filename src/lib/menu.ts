import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
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

export type MenuStockLote = {
  lote: string
  fechaVencimiento: string
  cantidad: number
  produccionId: string
  codigoTrazabilidad: string
  registradoEn: string
}

export interface MenuItem {
  id: string
  nombre: string
  categoria: CategoriaMenu
  /** Stock físico (suma de lotes o manual). */
  stock: number
  /** Reservado por pedidos activos aún no despachados. */
  stockComprometido?: number
  aceptaGuarnicion: boolean
  /** Si viene del recetario, enlaza la ficha técnica con el ítem del menú cliente. */
  recetaId?: string
  /** Trazabilidad por lote de producción (platos terminados). */
  stockLotes?: MenuStockLote[]
}

const MENU_COLLECTION = 'menu'
const PEDIDOS_COLLECTION = 'pedidos'

export const LUGARES_ENTREGA = [
  'Oficinas',
  'Depósito',
  'Predio',
  'Cocina Central',
] as const
export type LugarEntrega = (typeof LUGARES_ENTREGA)[number]

export type EstadoPedido = 'activo' | 'archivado' | 'despachado'

export interface PedidoDelDia {
  id: string
  nombreCliente: string
  lugarEntrega: string
  platoPrincipal: string
  guarnicion: string
  principalMenuId?: string
  guarnicionMenuId?: string
  fecha: Date | null
  estado: EstadoPedido
  /** Día de consumo del menú (ej. pedido anticipado semanal). */
  fechaConsumo?: string
  /** Cliente de viandas (formulario planificado por empresa). */
  empresaId?: string
  empresaNombre?: string
  planificacionId?: string
  despachoId?: string
  numeroRemito?: string
}

export function esLugarEntregaValido(v: string): v is LugarEntrega {
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
    estadoRaw === 'archivado'
      ? 'archivado'
      : estadoRaw === 'despachado'
        ? 'despachado'
        : 'activo'

  const fechaConsumo =
    typeof data.fechaConsumo === 'string' ? data.fechaConsumo : undefined

  return {
    id,
    nombreCliente,
    lugarEntrega,
    platoPrincipal,
    guarnicion,
    principalMenuId:
      typeof data.principalMenuId === 'string' ? data.principalMenuId : undefined,
    guarnicionMenuId:
      typeof data.guarnicionMenuId === 'string' ? data.guarnicionMenuId : undefined,
    fecha,
    estado,
    fechaConsumo,
    empresaId: typeof data.empresaId === 'string' ? data.empresaId : undefined,
    empresaNombre:
      typeof data.empresaNombre === 'string' ? data.empresaNombre : undefined,
    planificacionId:
      typeof data.planificacionId === 'string' ? data.planificacionId : undefined,
    despachoId: typeof data.despachoId === 'string' ? data.despachoId : undefined,
    numeroRemito:
      typeof data.numeroRemito === 'string' ? data.numeroRemito : undefined,
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

function mapStockLotes(raw: unknown): MenuStockLote[] {
  if (!Array.isArray(raw)) return []
  const out: MenuStockLote[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const lote = typeof o.lote === 'string' ? o.lote.trim() : ''
    const fechaVencimiento =
      typeof o.fechaVencimiento === 'string' ? o.fechaVencimiento.trim() : ''
    const cantidad = Number(o.cantidad)
    const produccionId =
      typeof o.produccionId === 'string' ? o.produccionId.trim() : ''
    const codigoTrazabilidad =
      typeof o.codigoTrazabilidad === 'string' ? o.codigoTrazabilidad.trim() : ''
    const registradoEn =
      typeof o.registradoEn === 'string' ? o.registradoEn.trim() : ''
    if (!lote || !Number.isFinite(cantidad) || cantidad <= 0) continue
    out.push({
      lote,
      fechaVencimiento,
      cantidad: Math.floor(cantidad),
      produccionId,
      codigoTrazabilidad,
      registradoEn,
    })
  }
  return out
}

function stockTotalDesdeLotes(lotes: MenuStockLote[]): number {
  return lotes.reduce((acc, l) => acc + Math.max(0, Math.floor(l.cantidad)), 0)
}

export function stockComprometidoDesdeData(data: Record<string, unknown>): number {
  const v = data.stockComprometido
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0
}

export function stockFisicoDesdeData(data: Record<string, unknown>): number {
  const lotes = mapStockLotes(data.stockLotes)
  if (lotes.length > 0) return stockTotalDesdeLotes(lotes)
  const stockRaw = typeof data.stock === 'number' ? data.stock : 0
  return Math.max(0, Math.floor(stockRaw))
}

/** Unidades que aún se pueden pedir (físico − comprometido). */
export function stockDisponibleParaPedidosDesdeData(
  data: Record<string, unknown>,
): number {
  return Math.max(0, stockFisicoDesdeData(data) - stockComprometidoDesdeData(data))
}

export function stockDisponibleParaPedidos(item: MenuItem | undefined): number {
  if (!item) return 0
  return Math.max(0, item.stock - (item.stockComprometido ?? 0))
}

function mapDoc(id: string, data: Record<string, unknown>): MenuItem {
  const categoria = data.categoria === 'guarnicion' ? 'guarnicion' : 'principal'
  const stockLotes = mapStockLotes(data.stockLotes)
  const stock = stockFisicoDesdeData(data)
  const stockComprometido = stockComprometidoDesdeData(data)
  const nombre = typeof data.nombre === 'string' ? data.nombre : 'Sin nombre'
  const aceptaGuarnicionRaw = data.aceptaGuarnicion
  const aceptaGuarnicion =
    categoria === 'principal'
      ? aceptaGuarnicionRaw === false
        ? false
        : true
      : false
  const recetaIdRaw = data.recetaId
  const recetaId =
    typeof recetaIdRaw === 'string' && recetaIdRaw.trim().length > 0
      ? recetaIdRaw.trim()
      : undefined
  return {
    id,
    nombre,
    categoria,
    stock,
    stockComprometido,
    aceptaGuarnicion,
    recetaId,
    stockLotes,
  }
}

export type InputStockMenuProduccion = {
  lote: string
  fechaVencimiento: string
  cantidad: number
  produccionId: string
  codigoTrazabilidad: string
}

/** Fusiona un lote de producción en el documento menú (para transacciones). */
export function aplicarStockMenuProduccionEnData(
  data: Record<string, unknown>,
  input: InputStockMenuProduccion,
): { stock: number; stockLotes: MenuStockLote[] } {
  const cantidad = Math.max(0, Math.floor(input.cantidad))
  if (cantidad <= 0) {
    const lotesActuales = mapStockLotes(data.stockLotes)
    return {
      stock: stockTotalDesdeLotes(lotesActuales),
      stockLotes: lotesActuales,
    }
  }

  const lote = input.lote.trim()
  const fechaVencimiento = input.fechaVencimiento.trim()
  const produccionId = input.produccionId.trim()
  const codigoTrazabilidad = input.codigoTrazabilidad.trim()
  const registradoEn = new Date().toISOString()

  const lotes = mapStockLotes(data.stockLotes)
  const idx = lotes.findIndex(
    (row) =>
      row.lote === lote &&
      row.fechaVencimiento === fechaVencimiento &&
      row.produccionId === produccionId,
  )

  if (idx >= 0) {
    lotes[idx] = {
      ...lotes[idx],
      cantidad: lotes[idx].cantidad + cantidad,
      codigoTrazabilidad: codigoTrazabilidad || lotes[idx].codigoTrazabilidad,
    }
  } else {
    lotes.push({
      lote,
      fechaVencimiento,
      cantidad,
      produccionId,
      codigoTrazabilidad,
      registradoEn,
    })
  }

  lotes.sort((a, b) => {
    const cmpVto = a.fechaVencimiento.localeCompare(b.fechaVencimiento)
    if (cmpVto !== 0) return cmpVto
    return a.lote.localeCompare(b.lote, 'es')
  })

  return { stock: stockTotalDesdeLotes(lotes), stockLotes: lotes }
}

export type LineaDescontarStockMenu = {
  lote: string
  fechaVencimiento: string
  produccionId: string
  cantidad: number
}

/** Descuenta cantidades por lote de producción (para despacho / remito). */
export function descontarStockMenuLotesEnData(
  data: Record<string, unknown>,
  lineas: LineaDescontarStockMenu[],
): { stock: number; stockLotes: MenuStockLote[] } {
  const lotes = mapStockLotes(data.stockLotes).map((row) => ({ ...row }))

  for (const linea of lineas) {
    const qty = Math.max(0, Math.floor(linea.cantidad))
    if (qty <= 0) continue
    const lote = linea.lote.trim()
    const fechaVencimiento = linea.fechaVencimiento.trim()
    const produccionId = linea.produccionId.trim()
    const idx = lotes.findIndex(
      (row) =>
        row.lote === lote &&
        row.fechaVencimiento === fechaVencimiento &&
        row.produccionId === produccionId,
    )
    if (idx < 0) {
      throw new Error(`No hay stock del lote ${lote || '—'} (vto ${fechaVencimiento || '—'}).`)
    }
    if (lotes[idx].cantidad < qty) {
      throw new Error(
        `Stock insuficiente en lote ${lote}: hay ${lotes[idx].cantidad}, se pidieron ${qty}.`,
      )
    }
    lotes[idx].cantidad -= qty
  }

  const lotesPositivos = lotes.filter((row) => row.cantidad > 0)
  return { stock: stockTotalDesdeLotes(lotesPositivos), stockLotes: lotesPositivos }
}

/**
 * Crea o actualiza un documento en `menu` vinculado a una receta del recetario.
 * Así las fichas «Principal» / «Guarnición» aparecen en gestión de menú con stock inicial 0.
 */
export async function upsertMenuItemLinkedToReceta(
  recetaId: string,
  input: {
    nombre: string
    categoria: CategoriaMenu
    aceptaGuarnicion: boolean
  },
): Promise<void> {
  const rid = recetaId.trim()
  if (!rid) throw new Error('Identificador de receta inválido')

  const db = getDb()
  const nombre = input.nombre.trim()
  if (!nombre) throw new Error('El nombre es obligatorio')

  const q = query(
    collection(db, MENU_COLLECTION),
    where('recetaId', '==', rid),
    limit(1),
  )
  const snap = await getDocs(q)

  if (snap.empty) {
    await addDoc(collection(db, MENU_COLLECTION), {
      nombre,
      categoria: input.categoria,
      stock: 0,
      recetaId: rid,
      ...(input.categoria === 'principal'
        ? { aceptaGuarnicion: input.aceptaGuarnicion }
        : {}),
    })
    return
  }

  const existing = snap.docs[0]
  const payload: Record<string, unknown> = {
    nombre,
    categoria: input.categoria,
  }
  if (input.categoria === 'principal') {
    payload.aceptaGuarnicion = input.aceptaGuarnicion
  } else {
    payload.aceptaGuarnicion = false
  }
  await updateDoc(doc(db, MENU_COLLECTION, existing.id), payload)
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
  aceptaGuarnicion?: boolean
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
    ...(input.categoria === 'principal'
      ? { aceptaGuarnicion: input.aceptaGuarnicion ?? true }
      : {}),
  })
}

export async function updateMenuStock(id: string, stock: number): Promise<void> {
  if (stock < 0 || !Number.isFinite(stock)) {
    throw new Error('El stock debe ser un número válido ≥ 0')
  }
  const db = getDb()
  await updateDoc(doc(db, MENU_COLLECTION, id), { stock: Math.floor(stock) })
}

/**
 * Actualiza el nombre del plato en la colección `menu`.
 * Para platos principales permite, opcionalmente, ajustar si aceptan guarnición.
 */
export async function updateMenuNombre(
  id: string,
  nombre: string,
  aceptaGuarnicion?: boolean,
): Promise<void> {
  const db = getDb()
  const n = nombre.trim()
  if (!n) throw new Error('El nombre no puede estar vacío')
  const payload: Record<string, unknown> = { nombre: n }
  if (typeof aceptaGuarnicion === 'boolean') {
    payload.aceptaGuarnicion = aceptaGuarnicion
  }
  await updateDoc(doc(db, MENU_COLLECTION, id), payload)
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
      if (stockDisponibleParaPedidos(p) < 1) {
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
      if (stockDisponibleParaPedidos(g) < 1) {
        throw new Error('Stock insuficiente de la guarnición')
      }
    }

    if (principalRef && p) {
      transaction.update(principalRef, {
        stockComprometido: (p.stockComprometido ?? 0) + 1,
      })
    }
    if (guarnicionRef && g) {
      transaction.update(guarnicionRef, {
        stockComprometido: (g.stockComprometido ?? 0) + 1,
      })
    }

    const pedidoRef = doc(collection(db, PEDIDOS_COLLECTION))
    transaction.set(pedidoRef, {
      nombreCliente: nombre,
      lugarEntrega,
      platoPrincipal: p?.nombre ?? '—',
      guarnicion: g?.nombre ?? '—',
      ...(principalId ? { principalMenuId: principalId } : {}),
      ...(guarnicionId ? { guarnicionMenuId: guarnicionId } : {}),
      fecha: serverTimestamp(),
      estado: 'activo',
    })
  })
}

export interface LineaPedidoSemanal {
  fechaConsumo: string
  principalId: string | null
  guarnicionId: string | null
}

export interface ConfirmarPedidoSemanalInput {
  nombreCliente: string
  lugarEntrega: string
  lineas: LineaPedidoSemanal[]
  empresaId?: string
  empresaNombre?: string
  planificacionId?: string
}

/**
 * Descuenta stock agregado en una sola transacción y crea un documento en `pedidos`
 * por cada día con menú (con `fechaConsumo` para filtros en admin).
 */
export async function confirmarPedidoSemanalConTransaccion(
  input: ConfirmarPedidoSemanalInput,
): Promise<void> {
  const nombre = input.nombreCliente.trim()
  if (!nombre) {
    throw new Error('El nombre y apellido son obligatorios')
  }
  if (!input.lugarEntrega?.trim()) {
    throw new Error('Falta el lugar de entrega')
  }
  const lugarEntrega = input.lugarEntrega.trim()
  const esPedidoEmpresa = Boolean(input.empresaNombre?.trim())
  if (!esPedidoEmpresa && !esLugarEntregaValido(lugarEntrega)) {
    throw new Error('Elegí un lugar de entrega válido')
  }

  const lineasValidadas: LineaPedidoSemanal[] = []

  for (const raw of input.lineas) {
    const tienePrincipal = Boolean(raw.principalId)
    const tieneGuarnicion = Boolean(raw.guarnicionId)
    if (!tienePrincipal && !tieneGuarnicion) continue

    if (
      tienePrincipal &&
      tieneGuarnicion &&
      raw.principalId === raw.guarnicionId
    ) {
      throw new Error('El principal y la guarnición deben ser ítems distintos')
    }

    const fechaConsumo = raw.fechaConsumo.trim()
    if (!fechaConsumo) {
      throw new Error('Falta la fecha de consumo en una línea del pedido')
    }

    lineasValidadas.push({
      fechaConsumo,
      principalId: tienePrincipal ? raw.principalId : null,
      guarnicionId: tieneGuarnicion ? raw.guarnicionId : null,
    })
  }

  if (lineasValidadas.length === 0) {
    throw new Error(
      'Elegí al menos un día de la semana con plato principal o guarnición.',
    )
  }

  const cantidadPorMenuId = new Map<string, number>()
  for (const line of lineasValidadas) {
    if (line.principalId) {
      cantidadPorMenuId.set(
        line.principalId,
        (cantidadPorMenuId.get(line.principalId) ?? 0) + 1,
      )
    }
    if (line.guarnicionId) {
      cantidadPorMenuId.set(
        line.guarnicionId,
        (cantidadPorMenuId.get(line.guarnicionId) ?? 0) + 1,
      )
    }
  }

  const db = getDb()

  await runTransaction(db, async (transaction) => {
    const cache = new Map<string, MenuItem>()

    for (const [menuId, cantidad] of cantidadPorMenuId) {
      const ref = doc(db, MENU_COLLECTION, menuId)
      const snap = await transaction.get(ref)
      if (!snap.exists()) {
        throw new Error('Un ítem del menú seleccionado ya no existe')
      }
      const item = mapDoc(snap.id, snap.data() as Record<string, unknown>)
      if (stockDisponibleParaPedidos(item) < cantidad) {
        throw new Error(
          `Stock insuficiente para «${item.nombre}» (pediste ${cantidad}, hay ${stockDisponibleParaPedidos(item)} disponible${cantidad === 1 ? '' : 's'}).`,
        )
      }
      cache.set(menuId, item)
    }

    for (const line of lineasValidadas) {
      const p = line.principalId ? cache.get(line.principalId) ?? null : null
      const g = line.guarnicionId ? cache.get(line.guarnicionId) ?? null : null

      if (line.principalId && (!p || p.categoria !== 'principal')) {
        throw new Error('La selección de plato principal no es válida')
      }
      if (line.guarnicionId && (!g || g.categoria !== 'guarnicion')) {
        throw new Error('La selección de guarnición no es válida')
      }
    }

    for (const [menuId, cantidad] of cantidadPorMenuId) {
      const item = cache.get(menuId)!
      const ref = doc(db, MENU_COLLECTION, menuId)
      transaction.update(ref, {
        stockComprometido: (item.stockComprometido ?? 0) + cantidad,
      })
    }

    for (const line of lineasValidadas) {
      const p = line.principalId ? cache.get(line.principalId) ?? null : null
      const g = line.guarnicionId ? cache.get(line.guarnicionId) ?? null : null

      const pedidoRef = doc(collection(db, PEDIDOS_COLLECTION))
      const pedidoData: Record<string, unknown> = {
        nombreCliente: nombre,
        lugarEntrega,
        platoPrincipal: p?.nombre ?? '—',
        guarnicion: g?.nombre ?? '—',
        fecha: serverTimestamp(),
        estado: 'activo',
        fechaConsumo: line.fechaConsumo,
      }
      if (line.principalId) pedidoData.principalMenuId = line.principalId
      if (line.guarnicionId) pedidoData.guarnicionMenuId = line.guarnicionId
      if (input.empresaId?.trim()) {
        pedidoData.empresaId = input.empresaId.trim()
      }
      if (input.empresaNombre?.trim()) {
        pedidoData.empresaNombre = input.empresaNombre.trim()
      }
      if (input.planificacionId?.trim()) {
        pedidoData.planificacionId = input.planificacionId.trim()
      }
      transaction.set(pedidoRef, pedidoData)
    }
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

  const liberarPorMenu = new Map<string, number>()
  const refsArchivar: ReturnType<typeof doc>[] = []

  for (const d of snap.docs) {
    const data = d.data()
    if (data.estado === 'archivado') continue

    refsArchivar.push(d.ref)

    const estado = data.estado
    if (estado === 'activo' || estado === undefined || estado === null) {
      const pid =
        typeof data.principalMenuId === 'string' ? data.principalMenuId.trim() : ''
      const gid =
        typeof data.guarnicionMenuId === 'string' ? data.guarnicionMenuId.trim() : ''
      if (pid) liberarPorMenu.set(pid, (liberarPorMenu.get(pid) ?? 0) + 1)
      if (gid) liberarPorMenu.set(gid, (liberarPorMenu.get(gid) ?? 0) + 1)
    }
  }

  if (refsArchivar.length === 0) return 0

  if (liberarPorMenu.size > 0) {
    await runTransaction(db, async (transaction) => {
      for (const [menuId, qty] of liberarPorMenu) {
        const ref = doc(db, MENU_COLLECTION, menuId)
        const ms = await transaction.get(ref)
        if (!ms.exists()) continue
        const actual = stockComprometidoDesdeData(ms.data() as Record<string, unknown>)
        transaction.update(ref, {
          stockComprometido: Math.max(0, actual - qty),
        })
      }
    })
  }

  let batch = writeBatch(db)
  let ops = 0
  let total = 0
  for (const ref of refsArchivar) {
    batch.update(ref, { estado: 'archivado' })
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

