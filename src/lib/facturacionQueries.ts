import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COL_LIQUIDACIONES, mapLiquidacionContratista } from './facturacion'
import type { LiquidacionContratista } from '../types/facturacion'

export function subscribeLiquidacionesContratistas(
  onChange: (rows: LiquidacionContratista[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_LIQUIDACIONES), orderBy('creadoEn', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const rows: LiquidacionContratista[] = []
      snap.forEach((d) => {
        rows.push(mapLiquidacionContratista(d.id, d.data() as Record<string, unknown>))
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeLiquidacionesContratistas', err)
      onChange([])
    },
  )
}
