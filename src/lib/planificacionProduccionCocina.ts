import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'

export const COL_PLAN_PRODUCCION_COCINA = 'planificacion_produccion_cocina'

export type EstadoPlanProduccionCocina = 'BORRADOR' | 'CONFIRMADA'

export type LineaPlanProduccionGuardada = {
  fechaYmd: string
  recetaId: string
  recetaNombre: string
  recetaCodigo: string
  categoria: string
  porciones: number
}

export type PlanProduccionCocina = {
  id: string
  semanaInicioYmd: string
  semanaFinYmd: string
  lineas: LineaPlanProduccionGuardada[]
  estado: EstadoPlanProduccionCocina
  solicitudMercaderiaId?: string
  creadoEn: Date | null
  actualizadoEn: Date | null
}

export function planProduccionDocId(semanaInicioYmd: string): string {
  return `COCINA_${semanaInicioYmd}`
}

function mapLinea(raw: unknown): LineaPlanProduccionGuardada | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const recetaId = typeof o.recetaId === 'string' ? o.recetaId.trim() : ''
  const porciones = Number(o.porciones)
  const fechaYmd = typeof o.fechaYmd === 'string' ? o.fechaYmd.trim() : ''
  if (!recetaId || !fechaYmd || !Number.isFinite(porciones) || porciones <= 0) return null
  return {
    fechaYmd,
    recetaId,
    recetaNombre: typeof o.recetaNombre === 'string' ? o.recetaNombre : '',
    recetaCodigo: typeof o.recetaCodigo === 'string' ? o.recetaCodigo : '',
    categoria: typeof o.categoria === 'string' ? o.categoria : '',
    porciones,
  }
}

function mapPlan(id: string, data: Record<string, unknown>): PlanProduccionCocina {
  const lineas: LineaPlanProduccionGuardada[] = []
  if (Array.isArray(data.lineas)) {
    for (const raw of data.lineas) {
      const m = mapLinea(raw)
      if (m) lineas.push(m)
    }
  }
  const creadoRaw = data.creadoEn
  const actRaw = data.actualizadoEn
  return {
    id,
    semanaInicioYmd: typeof data.semanaInicioYmd === 'string' ? data.semanaInicioYmd : '',
    semanaFinYmd: typeof data.semanaFinYmd === 'string' ? data.semanaFinYmd : '',
    lineas,
    estado: data.estado === 'CONFIRMADA' ? 'CONFIRMADA' : 'BORRADOR',
    solicitudMercaderiaId:
      typeof data.solicitudMercaderiaId === 'string' && data.solicitudMercaderiaId.trim()
        ? data.solicitudMercaderiaId.trim()
        : undefined,
    creadoEn: creadoRaw instanceof Timestamp ? creadoRaw.toDate() : null,
    actualizadoEn: actRaw instanceof Timestamp ? actRaw.toDate() : null,
  }
}

export function subscribePlanesProduccionCocina(
  onChange: (rows: PlanProduccionCocina[]) => void,
): Unsubscribe {
  const db = getDb()
  return onSnapshot(
    query(collection(db, COL_PLAN_PRODUCCION_COCINA), orderBy('semanaInicioYmd', 'desc')),
    (snap) => {
      onChange(snap.docs.map((d) => mapPlan(d.id, d.data() as Record<string, unknown>)))
    },
    (err) => {
      console.error('subscribePlanesProduccionCocina', err)
      onChange([])
    },
  )
}

export async function guardarPlanProduccionCocina(input: {
  semanaInicioYmd: string
  semanaFinYmd: string
  lineas: LineaPlanProduccionGuardada[]
  estado?: EstadoPlanProduccionCocina
  solicitudMercaderiaId?: string
}): Promise<string> {
  const semanaInicioYmd = input.semanaInicioYmd.trim()
  if (!semanaInicioYmd) throw new Error('Falta la semana del plan de producción.')
  if (input.lineas.length === 0) {
    throw new Error('Cargá al menos una receta con porciones en el plan.')
  }
  const id = planProduccionDocId(semanaInicioYmd)
  const db = getDb()
  const ref = doc(db, COL_PLAN_PRODUCCION_COCINA, id)
  await setDoc(
    ref,
    {
      semanaInicioYmd,
      semanaFinYmd: input.semanaFinYmd.trim(),
      lineas: input.lineas,
      estado: input.estado ?? 'BORRADOR',
      ...(input.solicitudMercaderiaId
        ? { solicitudMercaderiaId: input.solicitudMercaderiaId }
        : {}),
      actualizadoEn: serverTimestamp(),
      creadoEn: serverTimestamp(),
    },
    { merge: true },
  )
  return id
}

export async function vincularSolicitudAlPlan(
  planId: string,
  solicitudMercaderiaId: string,
): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, COL_PLAN_PRODUCCION_COCINA, planId), {
    solicitudMercaderiaId,
    estado: 'CONFIRMADA',
    actualizadoEn: serverTimestamp(),
  })
}
