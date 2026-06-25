import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { descontarStockMenuLotesEnData, type MenuStockLote } from './menu'

export const COLLECTION_DESPACHOS_VIANDAS = 'despachos_viandas'

export type DespachoViandaItemLote = {
  lote: string
  fechaVencimiento: string
  cantidad: number
  produccionId: string
  codigoTrazabilidad: string
}

export type DespachoViandaItem = {
  menuItemId: string
  nombrePlato: string
  cantidadTotal: number
  lotes: DespachoViandaItemLote[]
}

export type DespachoViandaRegistro = {
  id: string
  fecha: Date | null
  empresa: string
  lugarEntrega: string
  numeroRemito: string
  pedidoIds: string[]
  items: DespachoViandaItem[]
  observaciones: string
}

function mapDespachoDoc(id: string, data: Record<string, unknown>): DespachoViandaRegistro | null {
  const fechaRaw = data.fecha
  let fecha: Date | null = null
  if (fechaRaw instanceof Timestamp) fecha = fechaRaw.toDate()

  const empresa = typeof data.empresa === 'string' ? data.empresa.trim() : ''
  if (!empresa) return null

  const lugarEntrega =
    typeof data.lugarEntrega === 'string' ? data.lugarEntrega.trim() : ''
  const numeroRemito =
    typeof data.numeroRemito === 'string' ? data.numeroRemito.trim() : ''
  const observaciones =
    typeof data.observaciones === 'string' ? data.observaciones.trim() : ''

  const pedidoIds: string[] = []
  if (Array.isArray(data.pedidoIds)) {
    for (const p of data.pedidoIds) {
      if (typeof p === 'string' && p.trim()) pedidoIds.push(p.trim())
    }
  }

  const items: DespachoViandaItem[] = []
  if (Array.isArray(data.items)) {
    for (const row of data.items) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const menuItemId = typeof o.menuItemId === 'string' ? o.menuItemId.trim() : ''
      const nombrePlato = typeof o.nombrePlato === 'string' ? o.nombrePlato.trim() : '—'
      const cantidadTotal = Math.max(0, Math.floor(Number(o.cantidadTotal)))
      const lotes: DespachoViandaItemLote[] = []
      if (Array.isArray(o.lotes)) {
        for (const lr of o.lotes) {
          if (!lr || typeof lr !== 'object') continue
          const l = lr as Record<string, unknown>
          const cantidad = Math.max(0, Math.floor(Number(l.cantidad)))
          if (cantidad <= 0) continue
          lotes.push({
            lote: typeof l.lote === 'string' ? l.lote.trim() : '',
            fechaVencimiento:
              typeof l.fechaVencimiento === 'string' ? l.fechaVencimiento.trim() : '',
            cantidad,
            produccionId: typeof l.produccionId === 'string' ? l.produccionId.trim() : '',
            codigoTrazabilidad:
              typeof l.codigoTrazabilidad === 'string' ? l.codigoTrazabilidad.trim() : '',
          })
        }
      }
      if (!menuItemId || lotes.length === 0) continue
      items.push({ menuItemId, nombrePlato, cantidadTotal, lotes })
    }
  }

  if (items.length === 0) return null

  return {
    id,
    fecha,
    empresa,
    lugarEntrega,
    numeroRemito,
    pedidoIds,
    items,
    observaciones,
  }
}

export function subscribeDespachosViandas(
  onChange: (rows: DespachoViandaRegistro[]) => void,
  limite = 300,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_DESPACHOS_VIANDAS),
    orderBy('fecha', 'desc'),
    limit(Math.min(Math.max(1, limite), 500)),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: DespachoViandaRegistro[] = []
      snap.forEach((d) => {
        const m = mapDespachoDoc(d.id, d.data() as Record<string, unknown>)
        if (m) rows.push(m)
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeDespachosViandas', err)
      onChange([])
    },
  )
}

export function filtrarDespachosPorProduccionId(
  despachos: DespachoViandaRegistro[],
  produccionId: string,
): DespachoViandaRegistro[] {
  const pid = produccionId.trim()
  if (!pid) return []
  return despachos.filter((d) =>
    d.items.some((it) => it.lotes.some((l) => l.produccionId === pid)),
  )
}

export function loteKeyMenu(l: MenuStockLote): string {
  return `${l.produccionId}::${l.lote}::${l.fechaVencimiento}`
}

/** Orden FEFO: vencimiento más próximo primero. */
export function ordenarLotesFifo(lotes: MenuStockLote[]): MenuStockLote[] {
  return [...lotes].sort((a, b) => {
    const va = a.fechaVencimiento.trim()
    const vb = b.fechaVencimiento.trim()
    if (!va && !vb) return a.lote.localeCompare(b.lote, 'es')
    if (!va) return 1
    if (!vb) return -1
    const cmp = va.localeCompare(vb)
    if (cmp !== 0) return cmp
    return a.lote.localeCompare(b.lote, 'es')
  })
}

/** Asigna cantidades por lote consumiendo stock FEFO. */
export function sugerirAsignacionFifo(
  lotes: MenuStockLote[],
  cantidadTotal: number,
): Record<string, string> {
  const qty = Math.max(0, Math.floor(cantidadTotal))
  if (qty <= 0) return {}
  const out: Record<string, string> = {}
  let restante = qty
  for (const l of ordenarLotesFifo(lotes)) {
    if (restante <= 0) break
    if (l.cantidad <= 0) continue
    const tomar = Math.min(l.cantidad, restante)
    out[loteKeyMenu(l)] = String(tomar)
    restante -= tomar
  }
  return out
}

function sugerirNumeroRemito(): string {
  const hoy = new Date()
  const ymd = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('')
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `REM-${ymd}-${rnd}`
}

export async function registrarDespachoViandas(input: {
  fecha: Date
  empresa: string
  lugarEntrega?: string
  pedidoIds?: string[]
  marcarPedidosDespachados?: boolean
  items: DespachoViandaItem[]
  observaciones?: string
}): Promise<{ id: string; numeroRemito: string }> {
  const db = getDb()
  const empresa = input.empresa.trim()
  if (!empresa) throw new Error('Indicá la empresa destinataria.')

  const items = input.items
    .map((it) => ({
      ...it,
      menuItemId: it.menuItemId.trim(),
      nombrePlato: it.nombrePlato.trim(),
      lotes: it.lotes.filter((l) => l.cantidad > 0),
    }))
    .filter((it) => it.menuItemId && it.lotes.length > 0)

  if (items.length === 0) {
    throw new Error('Agregá al menos una vianda con lote y cantidad.')
  }

  for (const it of items) {
    const sumLotes = it.lotes.reduce((acc, l) => acc + l.cantidad, 0)
    if (sumLotes !== it.cantidadTotal) {
      throw new Error(
        `La suma de lotes de «${it.nombrePlato}» (${sumLotes}) no coincide con la cantidad total (${it.cantidadTotal}).`,
      )
    }
  }

  const despachoRef = doc(collection(db, COLLECTION_DESPACHOS_VIANDAS))
  const numeroRemito = sugerirNumeroRemito()
  const fechaTs = Timestamp.fromDate(input.fecha)
  const lugarEntrega = input.lugarEntrega?.trim() ?? ''
  const pedidoIds = [...new Set((input.pedidoIds ?? []).map((p) => p.trim()).filter(Boolean))]
  const observaciones = input.observaciones?.trim() ?? ''
  const marcarPedidos = input.marcarPedidosDespachados !== false && pedidoIds.length > 0

  await runTransaction(db, async (t) => {
    const menuSnaps = await Promise.all(
      items.map((it) => t.get(doc(db, 'menu', it.menuItemId))),
    )

    const pedidoSnaps = marcarPedidos
      ? await Promise.all(pedidoIds.map((pid) => t.get(doc(db, 'pedidos', pid))))
      : []

    const menuUpdates: {
      ref: ReturnType<typeof doc>
      stock: number
      stockLotes: unknown
    }[] = []

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const snap = menuSnaps[i]
      if (!snap.exists()) {
        throw new Error(`El plato «${it.nombrePlato}» ya no está en el menú.`)
      }
      const merged = descontarStockMenuLotesEnData(
        snap.data() as Record<string, unknown>,
        it.lotes.map((l) => ({
          lote: l.lote,
          fechaVencimiento: l.fechaVencimiento,
          produccionId: l.produccionId,
          cantidad: l.cantidad,
        })),
      )
      menuUpdates.push({
        ref: snap.ref,
        stock: merged.stock,
        stockLotes: merged.stockLotes,
      })
    }

    t.set(despachoRef, {
      fecha: fechaTs,
      empresa,
      lugarEntrega,
      numeroRemito,
      pedidoIds,
      items: items.map((it) => ({
        menuItemId: it.menuItemId,
        nombrePlato: it.nombrePlato,
        cantidadTotal: it.cantidadTotal,
        lotes: it.lotes.map((l) => ({
          lote: l.lote,
          fechaVencimiento: l.fechaVencimiento,
          cantidad: l.cantidad,
          produccionId: l.produccionId,
          codigoTrazabilidad: l.codigoTrazabilidad,
        })),
      })),
      observaciones,
      creadoEn: serverTimestamp(),
    })

    for (const upd of menuUpdates) {
      t.update(upd.ref, {
        stock: upd.stock,
        stockLotes: upd.stockLotes,
      })
    }

    if (marcarPedidos) {
      for (const ps of pedidoSnaps) {
        if (!ps.exists()) continue
        const data = ps.data() as Record<string, unknown>
        if (data.estado !== 'activo') continue
        t.update(ps.ref, {
          estado: 'despachado',
          despachoId: despachoRef.id,
          numeroRemito,
          fechaDespacho: fechaTs,
        })
      }
    }
  })

  return { id: despachoRef.id, numeroRemito }
}

export async function fetchDespachoViandaById(
  id: string,
): Promise<DespachoViandaRegistro | null> {
  const db = getDb()
  const snap = await getDoc(doc(db, COLLECTION_DESPACHOS_VIANDAS, id.trim()))
  if (!snap.exists()) return null
  return mapDespachoDoc(snap.id, snap.data() as Record<string, unknown>)
}
