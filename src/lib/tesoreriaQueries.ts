import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COL_ORDENES_COMPRA } from './ordenesCompra'
import {
  COL_FACTURAS_PROVEEDORES,
  COL_ORDENES_PAGO,
  COL_PADRON_EMPRESAS,
} from './tesoreria'
import type { OrdenCompra, OrdenCompraDoc } from '../types/compras'
import type {
  FacturaProveedor,
  FacturaProveedorDoc,
  OrdenPago,
  OrdenPagoDoc,
} from '../types/tesoreria'
import type { PadronEmpresaExtendido, RolEmpresaPadron } from '../types/compras'
import { normalizarCuit, normalizarNombreEmpresa } from './padronEmpresas'

type FirestoreErrorish = { code?: string; message?: string }

function tsToDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return null
}

function onSnapshotDeferred(
  q: Query,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: FirestoreErrorish) => void,
): Unsubscribe {
  let inner: Unsubscribe | undefined
  const raf = requestAnimationFrame(() => {
    inner = onSnapshot(
      q,
      onNext,
      onError ??
        ((e: FirestoreErrorish) => {
          console.error('[Firestore] tesoreria', e)
        }),
    )
  })
  return () => {
    cancelAnimationFrame(raf)
    inner?.()
  }
}

export interface ProveedorTesoreria {
  id: string
  nombre: string
  cuit: string
  saldoCuentaCorriente: number
  proveedorActivo: boolean
  roles: RolEmpresaPadron[]
}

export function mapProveedorTesoreria(id: string, data: Record<string, unknown>): ProveedorTesoreria {
  const ext = data as PadronEmpresaExtendido & Record<string, unknown>
  const roles = Array.isArray(ext.roles)
    ? ext.roles.filter(
        (r): r is RolEmpresaPadron =>
          r === 'CONTRATISTA' || r === 'PROVEEDOR' || r === 'CLIENTE',
      )
    : []
  const cond = ext.condicionesComerciales
  const saldo =
    typeof cond?.saldoCuentaCorriente === 'number' && Number.isFinite(cond.saldoCuentaCorriente)
      ? cond.saldoCuentaCorriente
      : 0

  return {
    id,
    nombre: typeof data.nombre === 'string' ? normalizarNombreEmpresa(data.nombre) : '',
    cuit: typeof data.cuit === 'string' ? normalizarCuit(data.cuit) : '',
    saldoCuentaCorriente: saldo,
    proveedorActivo: ext.proveedorActivo !== false,
    roles,
  }
}

export function esProveedorTesoreria(p: ProveedorTesoreria): boolean {
  if (p.roles.includes('PROVEEDOR')) return true
  if (p.proveedorActivo && p.roles.length === 0) return true
  return p.saldoCuentaCorriente > 0
}

export function mapFacturaProveedor(id: string, data: Record<string, unknown>): FacturaProveedor {
  const doc = data as unknown as FacturaProveedorDoc
  return { ...doc, id }
}

export function mapOrdenPago(id: string, data: Record<string, unknown>): OrdenPago {
  const doc = data as unknown as OrdenPagoDoc
  return { ...doc, id }
}

export function mapOrdenCompra(id: string, data: Record<string, unknown>): OrdenCompra {
  const doc = data as unknown as OrdenCompraDoc
  return { ...doc, id }
}

function sortProveedores(rows: ProveedorTesoreria[]): ProveedorTesoreria[] {
  return [...rows].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  )
}

function sortFacturas(rows: FacturaProveedor[]): FacturaProveedor[] {
  return [...rows].sort((a, b) => {
    const va = a.fechaVencimiento || ''
    const vb = b.fechaVencimiento || ''
    if (va !== vb) return va.localeCompare(vb)
    return a.numeroFactura.localeCompare(b.numeroFactura, 'es')
  })
}

function sortOrdenesPago(rows: OrdenPago[]): OrdenPago[] {
  return [...rows].sort((a, b) => {
    const ta = tsToDate(a.creadoEn)?.getTime() ?? 0
    const tb = tsToDate(b.creadoEn)?.getTime() ?? 0
    return tb - ta
  })
}

function sortOrdenesCompra(rows: OrdenCompra[]): OrdenCompra[] {
  return [...rows].sort((a, b) => b.numero.localeCompare(a.numero, 'es'))
}

export function subscribeProveedoresTesoreria(
  onChange: (rows: ProveedorTesoreria[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_PADRON_EMPRESAS))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: ProveedorTesoreria[] = []
      snap.forEach((d) =>
        rows.push(mapProveedorTesoreria(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(sortProveedores(rows))
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] padron_empresas (tesorería): permiso denegado.')
      }
      onChange([])
    },
  )
}

export function subscribeFacturasProveedores(
  onChange: (rows: FacturaProveedor[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_FACTURAS_PROVEEDORES))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: FacturaProveedor[] = []
      snap.forEach((d) =>
        rows.push(mapFacturaProveedor(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(sortFacturas(rows))
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] facturas_proveedores: permiso denegado.')
      }
      onChange([])
    },
  )
}

export function subscribeOrdenesPago(onChange: (rows: OrdenPago[]) => void): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_ORDENES_PAGO))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: OrdenPago[] = []
      snap.forEach((d) => rows.push(mapOrdenPago(d.id, d.data() as Record<string, unknown>)))
      onChange(sortOrdenesPago(rows))
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] ordenes_pago: permiso denegado.')
      }
      onChange([])
    },
  )
}

export function subscribeOrdenesCompra(onChange: (rows: OrdenCompra[]) => void): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_ORDENES_COMPRA))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: OrdenCompra[] = []
      snap.forEach((d) => rows.push(mapOrdenCompra(d.id, d.data() as Record<string, unknown>)))
      onChange(sortOrdenesCompra(rows))
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] ordenes_compra: permiso denegado.')
      }
      onChange([])
    },
  )
}
