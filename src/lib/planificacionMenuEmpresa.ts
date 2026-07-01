import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import {
  formatFechaConsumoLabel,
  formatYmdLocal,
  getProximaSemanaLaborable,
  getSemanaLaborableDesde,
  parseYmdLocal,
  type DiaConsumo,
} from './fechasDinamicas'
import type {
  PlanificacionDiaMenuEmpresa,
  PlanificacionMenuEmpresa,
  PlanificacionOpcionMenu,
  EstadoPlanificacionMenuEmpresa,
} from '../types/planificacionMenuEmpresa'
import type { MenuItem } from './menu'

export const COL_PLANIFICACION_MENU_EMPRESA = 'planificacion_menu_empresa'

function tsToDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return null
}

export function planificacionDocId(empresaId: string, semanaInicioYmd: string): string {
  return `${empresaId}_${semanaInicioYmd}`
}

export function urlFormularioPedido(token: string): string {
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''
  return `${base}/pedido/${encodeURIComponent(token)}`
}

function mapOpcion(raw: unknown): PlanificacionOpcionMenu | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const menuId = typeof o.menuId === 'string' ? o.menuId : ''
  const nombre = typeof o.nombre === 'string' ? o.nombre : ''
  if (!menuId) return null
  return { menuId, nombre }
}

function mapDia(raw: unknown): PlanificacionDiaMenuEmpresa | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const fechaYmd = typeof d.fechaYmd === 'string' ? d.fechaYmd : ''
  const fechaConsumo = typeof d.fechaConsumo === 'string' ? d.fechaConsumo : ''
  if (!fechaYmd || !fechaConsumo) return null

  let opcionesPrincipales: PlanificacionOpcionMenu[] = []
  let opcionesGuarniciones: PlanificacionOpcionMenu[] = []

  if (Array.isArray(d.opcionesPrincipales)) {
    opcionesPrincipales = d.opcionesPrincipales
      .map(mapOpcion)
      .filter((o): o is PlanificacionOpcionMenu => o !== null)
  }
  if (Array.isArray(d.opcionesGuarniciones)) {
    opcionesGuarniciones = d.opcionesGuarniciones
      .map(mapOpcion)
      .filter((o): o is PlanificacionOpcionMenu => o !== null)
  }

  // Compatibilidad con planificaciones guardadas con un solo ítem por día.
  if (
    opcionesPrincipales.length === 0 &&
    typeof d.principalMenuId === 'string' &&
    d.principalMenuId
  ) {
    opcionesPrincipales = [
      {
        menuId: d.principalMenuId,
        nombre: typeof d.principalNombre === 'string' ? d.principalNombre : '',
      },
    ]
  }
  if (
    opcionesGuarniciones.length === 0 &&
    typeof d.guarnicionMenuId === 'string' &&
    d.guarnicionMenuId
  ) {
    opcionesGuarniciones = [
      {
        menuId: d.guarnicionMenuId,
        nombre: typeof d.guarnicionNombre === 'string' ? d.guarnicionNombre : '',
      },
    ]
  }

  return {
    fechaYmd,
    fechaConsumo,
    opcionesPrincipales,
    opcionesGuarniciones,
    observaciones: typeof d.observaciones === 'string' ? d.observaciones : undefined,
  }
}

export function mapPlanificacionMenuEmpresa(
  id: string,
  data: Record<string, unknown>,
): PlanificacionMenuEmpresa {
  const diasRaw = Array.isArray(data.dias) ? data.dias : []
  const dias = diasRaw
    .map(mapDia)
    .filter((d): d is PlanificacionDiaMenuEmpresa => d !== null)

  const estadoRaw = data.estado
  const estado: EstadoPlanificacionMenuEmpresa =
    estadoRaw === 'PUBLICADA' || estadoRaw === 'CERRADA' ? estadoRaw : 'BORRADOR'

  return {
    id,
    empresaId: typeof data.empresaId === 'string' ? data.empresaId : '',
    empresaNombre: typeof data.empresaNombre === 'string' ? data.empresaNombre : '',
    empresaCuit: typeof data.empresaCuit === 'string' ? data.empresaCuit : undefined,
    semanaInicioYmd: typeof data.semanaInicioYmd === 'string' ? data.semanaInicioYmd : '',
    semanaFinYmd: typeof data.semanaFinYmd === 'string' ? data.semanaFinYmd : '',
    dias,
    estado,
    tokenPublico: typeof data.tokenPublico === 'string' ? data.tokenPublico : null,
    mensajeEmpresa: typeof data.mensajeEmpresa === 'string' ? data.mensajeEmpresa : undefined,
    lugarEntregaSugerido:
      typeof data.lugarEntregaSugerido === 'string' ? data.lugarEntregaSugerido : undefined,
    creadoPorUid: typeof data.creadoPorUid === 'string' ? data.creadoPorUid : '',
    creadoPorNombre: typeof data.creadoPorNombre === 'string' ? data.creadoPorNombre : '',
    creadoEn: tsToDate(data.creadoEn),
    actualizadoEn: tsToDate(data.actualizadoEn),
    publicadoEn: tsToDate(data.publicadoEn),
  }
}

export function buildDiasVaciosPlanificacion(dias: DiaConsumo[]): PlanificacionDiaMenuEmpresa[] {
  return dias.map((d) => ({
    fechaYmd: formatYmdLocal(d.fecha),
    fechaConsumo: d.fechaConsumo,
    opcionesPrincipales: [],
    opcionesGuarniciones: [],
    observaciones: '',
  }))
}

export function diaTieneOpcionesPlanificadas(dia: PlanificacionDiaMenuEmpresa): boolean {
  return dia.opcionesPrincipales.length > 0 || dia.opcionesGuarniciones.length > 0
}

export function toggleOpcionEnDia(
  dia: PlanificacionDiaMenuEmpresa,
  tipo: 'principal' | 'guarnicion',
  menuId: string,
  nombre: string,
): PlanificacionDiaMenuEmpresa {
  const key = tipo === 'principal' ? 'opcionesPrincipales' : 'opcionesGuarniciones'
  const actual = dia[key]
  const existe = actual.some((o) => o.menuId === menuId)
  const next = existe
    ? actual.filter((o) => o.menuId !== menuId)
    : [...actual, { menuId, nombre }]
  return { ...dia, [key]: next }
}

export function semanaLaborableDefault(): {
  lunesYmd: string
  viernesYmd: string
  dias: DiaConsumo[]
} {
  const { lunesYmd, viernesYmd, dias } = getProximaSemanaLaborable()
  return { lunesYmd, viernesYmd, dias }
}

export async function fetchPlanificacionMenuEmpresa(
  empresaId: string,
  semanaInicioYmd: string,
): Promise<PlanificacionMenuEmpresa | null> {
  const db = getDb()
  const ref = doc(db, COL_PLANIFICACION_MENU_EMPRESA, planificacionDocId(empresaId, semanaInicioYmd))
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapPlanificacionMenuEmpresa(snap.id, snap.data() as Record<string, unknown>)
}

export async function fetchPlanificacionByToken(
  token: string,
): Promise<PlanificacionMenuEmpresa | null> {
  const t = token.trim()
  if (!t) return null
  const db = getDb()
  const q = query(
    collection(db, COL_PLANIFICACION_MENU_EMPRESA),
    where('tokenPublico', '==', t),
    where('estado', '==', 'PUBLICADA'),
    limit(1),
  )
  const snap = await getDocs(q)
  const first = snap.docs[0]
  if (!first) return null
  return mapPlanificacionMenuEmpresa(first.id, first.data() as Record<string, unknown>)
}

export function subscribePlanificacionesMenuEmpresa(
  onChange: (rows: PlanificacionMenuEmpresa[]) => void,
): Unsubscribe {
  const db = getDb()
  return onSnapshot(
    collection(db, COL_PLANIFICACION_MENU_EMPRESA),
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapPlanificacionMenuEmpresa(d.id, d.data() as Record<string, unknown>),
      )
      rows.sort((a, b) => {
        const cmpSem = b.semanaInicioYmd.localeCompare(a.semanaInicioYmd)
        if (cmpSem !== 0) return cmpSem
        return a.empresaNombre.localeCompare(b.empresaNombre, 'es', { sensitivity: 'base' })
      })
      onChange(rows)
    },
    (err) => console.error('[Firestore] planificacion_menu_empresa', err),
  )
}

export interface GuardarPlanificacionInput {
  empresaId: string
  empresaNombre: string
  empresaCuit?: string
  semanaInicioYmd: string
  semanaFinYmd: string
  dias: PlanificacionDiaMenuEmpresa[]
  mensajeEmpresa?: string
  lugarEntregaSugerido?: string
  creadoPorUid: string
  creadoPorNombre: string
  esNueva: boolean
}

function serializarDia(d: PlanificacionDiaMenuEmpresa): Record<string, unknown> {
  return {
    fechaYmd: d.fechaYmd,
    fechaConsumo: d.fechaConsumo,
    opcionesPrincipales: d.opcionesPrincipales,
    opcionesGuarniciones: d.opcionesGuarniciones,
    ...(d.observaciones?.trim() ? { observaciones: d.observaciones.trim() } : {}),
  }
}

export async function guardarPlanificacionMenuEmpresa(
  input: GuardarPlanificacionInput,
): Promise<PlanificacionMenuEmpresa> {
  const db = getDb()
  const id = planificacionDocId(input.empresaId, input.semanaInicioYmd)
  const ref = doc(db, COL_PLANIFICACION_MENU_EMPRESA, id)

  const payload: Record<string, unknown> = {
    empresaId: input.empresaId,
    empresaNombre: input.empresaNombre.trim(),
    empresaCuit: input.empresaCuit?.trim() ?? '',
    semanaInicioYmd: input.semanaInicioYmd,
    semanaFinYmd: input.semanaFinYmd,
    dias: input.dias.map(serializarDia),
    actualizadoEn: serverTimestamp(),
    mensajeEmpresa: input.mensajeEmpresa?.trim() ?? '',
    lugarEntregaSugerido: input.lugarEntregaSugerido?.trim() ?? '',
  }

  if (input.esNueva) {
    payload.estado = 'BORRADOR'
    payload.creadoPorUid = input.creadoPorUid
    payload.creadoPorNombre = input.creadoPorNombre
    payload.creadoEn = serverTimestamp()
    payload.tokenPublico = null
    await setDoc(ref, payload)
  } else {
    const prevSnap = await getDoc(ref)
    if (prevSnap.exists()) {
      const prev = mapPlanificacionMenuEmpresa(prevSnap.id, prevSnap.data() as Record<string, unknown>)
      payload.estado = prev.estado
      payload.tokenPublico = prev.tokenPublico
    } else {
      payload.estado = 'BORRADOR'
      payload.tokenPublico = null
    }
    await setDoc(ref, payload, { merge: true })
  }

  const snap = await getDoc(ref)
  return mapPlanificacionMenuEmpresa(snap.id, snap.data() as Record<string, unknown>)
}

export async function publicarPlanificacionMenuEmpresa(
  empresaId: string,
  semanaInicioYmd: string,
): Promise<PlanificacionMenuEmpresa> {
  const db = getDb()
  const id = planificacionDocId(empresaId, semanaInicioYmd)
  const ref = doc(db, COL_PLANIFICACION_MENU_EMPRESA, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('Guardá la planificación antes de publicarla.')
  }
  const actual = mapPlanificacionMenuEmpresa(snap.id, snap.data() as Record<string, unknown>)
  const tieneAlMenosUnDia = actual.dias.some((d) => d.opcionesPrincipales.length > 0)
  if (!tieneAlMenosUnDia) {
    throw new Error('Asigná al menos una opción de plato principal en algún día antes de publicar.')
  }

  const token = actual.tokenPublico ?? crypto.randomUUID()

  await updateDoc(ref, {
    estado: 'PUBLICADA',
    tokenPublico: token,
    publicadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })

  const updated = await getDoc(ref)
  return mapPlanificacionMenuEmpresa(updated.id, updated.data() as Record<string, unknown>)
}

export function diasConsumoDesdePlanificacion(plan: PlanificacionMenuEmpresa): DiaConsumo[] {
  return plan.dias.map((d) => ({
    fecha: parseYmdLocal(d.fechaYmd),
    fechaConsumo: d.fechaConsumo,
  }))
}

/** El empleado elige; no pre-cargamos platos. */
export function seleccionInicialDesdePlanificacion(
  plan: PlanificacionMenuEmpresa,
): Record<string, { principalId: string | null; guarnicionId: string | null }> {
  const m: Record<string, { principalId: string | null; guarnicionId: string | null }> = {}
  for (const d of plan.dias) {
    m[d.fechaConsumo] = { principalId: null, guarnicionId: null }
  }
  return m
}

export function opcionesPrincipalesPermitidas(
  plan: PlanificacionMenuEmpresa,
  fechaConsumo: string,
): PlanificacionOpcionMenu[] {
  return plan.dias.find((d) => d.fechaConsumo === fechaConsumo)?.opcionesPrincipales ?? []
}

export function opcionesGuarnicionesPermitidas(
  plan: PlanificacionMenuEmpresa,
  fechaConsumo: string,
): PlanificacionOpcionMenu[] {
  return plan.dias.find((d) => d.fechaConsumo === fechaConsumo)?.opcionesGuarniciones ?? []
}

export function validarLineasContraPlanificacion(
  plan: PlanificacionMenuEmpresa,
  lineas: {
    fechaConsumo: string
    principalId: string | null
    guarnicionId: string | null
  }[],
): string | null {
  for (const line of lineas) {
    if (line.principalId) {
      const permitidos = opcionesPrincipalesPermitidas(plan, line.fechaConsumo).map(
        (o) => o.menuId,
      )
      if (!permitidos.includes(line.principalId)) {
        return `El plato principal elegido no está en el menú planificado para ${line.fechaConsumo}.`
      }
    }
    if (line.guarnicionId) {
      const permitidos = opcionesGuarnicionesPermitidas(plan, line.fechaConsumo).map(
        (o) => o.menuId,
      )
      if (!permitidos.includes(line.guarnicionId)) {
        return `La guarnición elegida no está en el menú planificado para ${line.fechaConsumo}.`
      }
    }
  }
  return null
}

export function etiquetaSemanaPlanificacion(lunesYmd: string, viernesYmd: string): string {
  const lunes = parseYmdLocal(lunesYmd)
  const viernes = parseYmdLocal(viernesYmd)
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${formatFechaConsumoLabel(lunes).split(' ')[0]} ${fmt(lunes)} – ${fmt(viernes)}`
}

export function reconstruirDiasSiCambioSemana(
  semanaInicioYmd: string,
  diasActuales: PlanificacionDiaMenuEmpresa[],
): PlanificacionDiaMenuEmpresa[] {
  const lunes = parseYmdLocal(semanaInicioYmd)
  const diasSemana = getSemanaLaborableDesde(lunes)
  const porYmd = new Map(diasActuales.map((d) => [d.fechaYmd, d]))
  return buildDiasVaciosPlanificacion(diasSemana).map((vacío) => {
    const prev = porYmd.get(vacío.fechaYmd)
    return prev ?? vacío
  })
}

export function itemsMenuDesdeOpcionesPlanificadas(
  opciones: PlanificacionOpcionMenu[],
  categoria: 'principal' | 'guarnicion',
  itemsById: Map<string, MenuItem>,
  seleccionadoId: string | null,
): MenuItem[] {
  const items: MenuItem[] = []
  const vistos = new Set<string>()

  for (const o of opciones) {
    if (vistos.has(o.menuId)) continue
    vistos.add(o.menuId)
    const item = itemsById.get(o.menuId)
    items.push(
      item ?? {
        id: o.menuId,
        nombre: o.nombre,
        categoria,
        stock: 0,
        aceptaGuarnicion: categoria === 'principal',
      },
    )
  }

  if (seleccionadoId && !vistos.has(seleccionadoId)) {
    const item = itemsById.get(seleccionadoId)
    const snap = opciones.find((o) => o.menuId === seleccionadoId)
    items.push(
      item ?? {
        id: seleccionadoId,
        nombre: snap?.nombre ?? '—',
        categoria,
        stock: 0,
        aceptaGuarnicion: categoria === 'principal',
      },
    )
  }

  return items
}

export function resumenOpcionesDia(dia: PlanificacionDiaMenuEmpresa): string {
  const p =
    dia.opcionesPrincipales.length > 0
      ? dia.opcionesPrincipales.map((o) => o.nombre).join(', ')
      : '—'
  const g =
    dia.opcionesGuarniciones.length > 0
      ? dia.opcionesGuarniciones.map((o) => o.nombre).join(', ')
      : '—'
  return `${p} · ${g}`
}
