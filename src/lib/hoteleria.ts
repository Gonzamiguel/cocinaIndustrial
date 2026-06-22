import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { normalizarPersonaPadronInput } from './padronFormInput'
import {
  obtenerMapaEmpresasPadronPorClave,
  resolverEmpresaEnPadron,
} from './padronEmpresas'
import type {
  Cama,
  EstadoCama,
  FilaCargaMasivaPadron,
  FilaImportPadron,
  HistorialLimpieza,
  HistorialPernocte,
  PadronPersona,
} from '../types/hoteleria'

export const COL_PADRON = 'padron_personas'
export const COL_CAMAS = 'camas'
export const COL_HISTORIAL_PERNOCTES = 'historial_pernoctes'
export const COL_HISTORIAL_LIMPIEZAS = 'historial_limpiezas'

type FirestoreErrorish = { code?: string; message?: string }

function esPermissionDeniedFirestore(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'permission-denied'
  )
}

/** Mensaje orientativo cuando falta publicar reglas o el rol no coincide. */
function mensajePermisosLimpiezaFirestore(): string {
  return (
    'Permiso denegado en Firestore. Suele pasar si aún no se publicaron las reglas con la colección ' +
    '`historial_limpiezas`: ejecutá `firebase deploy --only firestore:rules` desde el proyecto, ' +
    'o pedí a quien administra Firebase que copie las reglas del archivo `firestore.rules` del repo. ' +
    'También verificá que en `usuarios/{tuUID}` el campo `rol` sea exactamente `hoteleria_casposo`.'
  )
}

function logErrorSuscripcion(coleccion: string, err: FirestoreErrorish) {
  if (err?.code === 'permission-denied') {
    console.error(
      `[Firestore] ${coleccion}: permiso denegado. ` +
        'Publicá las reglas del repositorio en tu proyecto: `firebase deploy --only firestore:rules` ' +
        '(desde la raíz del proyecto, con firebase.json). ' +
        'Comprobá `usuarios/{tuUID}.rol` (`admin_campamento`, `hoteleria_casposo`, `gerencia` o `analista` para `/control` con escritura).',
    )
    return
  }
  console.error(`[Firestore] ${coleccion}`, err)
}

/**
 * Evita un bug del SDK (p. ej. ID ca9 / b815: WatchChangeAggregator, ve: -1) cuando React 18+
 * Strict Mode monta y desmonta rápido: el listener se registra en el siguiente frame para que el
 * cleanup previo pueda cancelar el frame y no solapar targets.
 */
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
          console.error('onSnapshotDeferred', e)
        }),
    )
  })
  return () => {
    cancelAnimationFrame(raf)
    inner?.()
  }
}

function sortPadronRows(rows: PadronPersona[]): PadronPersona[] {
  return [...rows].sort((a, b) => {
    const c = a.apellido.localeCompare(b.apellido, 'es', { sensitivity: 'base' })
    if (c !== 0) return c
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

function sortCamasRows(rows: Cama[]): Cama[] {
  return [...rows].sort((a, b) => {
    const s = a.sector.localeCompare(b.sector, 'es', { numeric: true, sensitivity: 'base' })
    if (s !== 0) return s
    const h = a.habitacion.localeCompare(b.habitacion, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
    if (h !== 0) return h
    return a.denominacion.localeCompare(b.denominacion, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function tsToDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate()
  return null
}

/** Fin del día local (23:59:59.999) respecto de `ref`. */
function finDelDiaLocal(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Fecha de egreso programada al check-in (campo `fechaSalidaEstimada` en Firestore). */
function validarFechaEgresoProgramadaCheckIn(
  fechaCheckIn: Date,
  fechaEgresoProgramada: Date | null | undefined,
): void {
  if (!fechaEgresoProgramada) {
    throw new Error('Indicá la fecha de egreso.')
  }
  if (
    startOfDayLocal(fechaEgresoProgramada).getTime() < startOfDayLocal(fechaCheckIn).getTime()
  ) {
    throw new Error('La fecha de egreso debe ser igual o posterior al ingreso.')
  }
}

/** ¿Ya corresponde ejecutar el egreso programado? (día calendario local). */
export function egresoProgramadoVencido(
  fechaSalidaEstimada: Date | null | undefined,
  ref: Date = new Date(),
): boolean {
  if (!fechaSalidaEstimada) return false
  return (
    startOfDayLocal(ref).getTime() >= startOfDayLocal(fechaSalidaEstimada).getTime()
  )
}

export function fechaCheckOutDesdeEgresoProgramado(fechaSalidaEstimada: Date): Date {
  return new Date(
    fechaSalidaEstimada.getFullYear(),
    fechaSalidaEstimada.getMonth(),
    fechaSalidaEstimada.getDate(),
    12,
    0,
    0,
    0,
  )
}

/** Check-out real: no admite fechas posteriores al día de hoy (hora local). */
export function assertFechaCheckOutRealNoEsFutura(fechaCheckOut: Date): void {
  if (fechaCheckOut.getTime() > finDelDiaLocal(new Date()).getTime()) {
    throw new Error('La fecha de check-out real no puede ser posterior a hoy.')
  }
}

export function mapPadron(id: string, data: Record<string, unknown>): PadronPersona {
  let nombre = typeof data.nombre === 'string' ? data.nombre.trim() : ''
  let apellido = typeof data.apellido === 'string' ? data.apellido.trim() : ''
  const nombreCompleto =
    typeof data.nombreCompleto === 'string' ? data.nombreCompleto.trim() : ''
  if (!nombre && !apellido && nombreCompleto) {
    const partes = nombreCompleto.split(/\s+/).filter(Boolean)
    nombre = partes[0] ?? ''
    apellido = partes.slice(1).join(' ')
  }
  return {
    id,
    dni: typeof data.dni === 'string' ? data.dni.trim() : '',
    nombre,
    apellido,
    empresa: typeof data.empresa === 'string' ? data.empresa.trim() : '',
    creadoEn: tsToDate(data.creadoEn),
  }
}

/** Id de documento Firestore a partir del DNI (colección `padron_personas`). */
export function idDocumentoPadronPorDni(dni: string): string {
  const d = dni.trim().toUpperCase().replace(/\//g, '-')
  if (!d) throw new Error('DNI inválido.')
  return d
}

export function mapCama(id: string, data: Record<string, unknown>): Cama {
  const estadoRaw = data.estado
  const estado: EstadoCama =
    estadoRaw === 'OCUPADA' ||
    estadoRaw === 'SUCIA' ||
    estadoRaw === 'MANTENIMIENTO'
      ? estadoRaw
      : 'LIBRE'
  const hid = data.historialAbiertoId
  const on = data.ocupanteNombre
  const oe = data.ocupanteEmpresa
  return {
    id,
    sector: typeof data.sector === 'string' ? data.sector.trim() : '',
    habitacion: typeof data.habitacion === 'string' ? data.habitacion.trim() : '',
    denominacion: typeof data.denominacion === 'string' ? data.denominacion.trim() : '',
    estado,
    personaId:
      typeof data.personaId === 'string' && data.personaId.trim()
        ? data.personaId.trim()
        : null,
    fechaCheckIn: tsToDate(data.fechaCheckIn),
    historialAbiertoId:
      typeof hid === 'string' && hid.trim() ? hid.trim() : null,
    ocupanteNombre: typeof on === 'string' && on.trim() ? on.trim() : null,
    ocupanteEmpresa: typeof oe === 'string' && oe.trim() ? oe.trim() : null,
    fechaSalidaEstimada: tsToDate(data.fechaSalidaEstimada),
    ultimoResponsableLimpieza:
      typeof data.ultimoResponsableLimpieza === 'string' && data.ultimoResponsableLimpieza.trim()
        ? data.ultimoResponsableLimpieza.trim()
        : null,
    ultimaFechaLimpieza: tsToDate(data.ultimaFechaLimpieza),
  }
}

export function mapHistorialLimpieza(id: string, data: Record<string, unknown>): HistorialLimpieza {
  return {
    id,
    camaId: typeof data.camaId === 'string' ? data.camaId.trim() : '',
    sector: typeof data.sector === 'string' ? data.sector.trim() : '',
    habitacion: typeof data.habitacion === 'string' ? data.habitacion.trim() : '',
    responsableLimpieza:
      typeof data.responsableLimpieza === 'string' ? data.responsableLimpieza.trim() : '',
    fechaLimpieza: tsToDate(data.fechaLimpieza),
  }
}

export function mapHistorial(id: string, data: Record<string, unknown>): HistorialPernocte {
  return {
    id,
    personaId: typeof data.personaId === 'string' ? data.personaId.trim() : '',
    camaId: typeof data.camaId === 'string' ? data.camaId.trim() : '',
    empresa: typeof data.empresa === 'string' ? data.empresa.trim() : '',
    fechaCheckIn: tsToDate(data.fechaCheckIn),
    fechaCheckOut: tsToDate(data.fechaCheckOut),
    fechaSalidaEstimada: tsToDate(data.fechaSalidaEstimada),
    liquidado: data.liquidado === true ? true : undefined,
    liquidacionId:
      typeof data.liquidacionId === 'string' && data.liquidacionId.trim()
        ? data.liquidacionId.trim()
        : undefined,
  }
}

export function subscribePadronPersonas(
  onChange: (rows: PadronPersona[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_PADRON))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: PadronPersona[] = []
      snap.forEach((d) => rows.push(mapPadron(d.id, d.data() as Record<string, unknown>)))
      onChange(sortPadronRows(rows))
    },
    (err) => {
      logErrorSuscripcion('padron_personas', err as FirestoreErrorish)
      onChange([])
    },
  )
}

/** Descarga el padrón completo (usa caché IndexedDB de Firestore si está offline). */
export async function fetchPadronPersonasCompleto(): Promise<PadronPersona[]> {
  const db = getDb()
  const snap = await getDocs(query(collection(db, COL_PADRON)))
  const rows: PadronPersona[] = []
  snap.forEach((d) => rows.push(mapPadron(d.id, d.data() as Record<string, unknown>)))
  return sortPadronRows(rows)
}

export function subscribeCamas(onChange: (rows: Cama[]) => void): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_CAMAS))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: Cama[] = []
      snap.forEach((d) => rows.push(mapCama(d.id, d.data() as Record<string, unknown>)))
      onChange(sortCamasRows(rows))
    },
    (err) => {
      logErrorSuscripcion('camas', err as FirestoreErrorish)
      onChange([])
    },
  )
}

export function subscribeHistorialPernoctes(
  onChange: (rows: HistorialPernocte[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COL_HISTORIAL_PERNOCTES),
    orderBy('fechaCheckIn', 'desc'),
    limit(5000),
  )
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: HistorialPernocte[] = []
      snap.forEach((d) =>
        rows.push(mapHistorial(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(rows)
    },
    (err) => {
      logErrorSuscripcion('historial_pernoctes', err as FirestoreErrorish)
      onChange([])
    },
  )
}

/** Auditoría de limpiezas (SUCIA → LIBRE). Orden descendente por fecha. */
export function subscribeHistorialLimpiezas(
  onChange: (rows: HistorialLimpieza[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COL_HISTORIAL_LIMPIEZAS),
    orderBy('fechaLimpieza', 'desc'),
    limit(8000),
  )
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: HistorialLimpieza[] = []
      snap.forEach((d) =>
        rows.push(mapHistorialLimpieza(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(rows)
    },
    (err) => {
      logErrorSuscripcion('historial_limpiezas', err as FirestoreErrorish)
      onChange([])
    },
  )
}

/** Busca persona por DNI exacto (normalizado a mayúsculas, como en importaciones). */
export async function buscarPersonaPorDni(dni: string): Promise<PadronPersona | null> {
  const d = dni.trim().toUpperCase()
  if (!d) return null
  const db = getDb()
  const q = query(collection(db, COL_PADRON), where('dni', '==', d), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return mapPadron(docSnap.id, docSnap.data() as Record<string, unknown>)
}

/** Obtiene una persona del padrón por id de documento (p. ej. al abrir check-out). */
export async function buscarPersonaPadronPorId(personaId: string): Promise<PadronPersona | null> {
  const id = personaId.trim()
  if (!id) return null
  const db = getDb()
  const s = await getDoc(doc(db, COL_PADRON, id))
  if (!s.exists()) return null
  return mapPadron(s.id, s.data() as Record<string, unknown>)
}

/**
 * Si la persona ya tiene una cama en estado OCUPADA, devuelve esa cama (primera coincidencia).
 * Usado para impedir check-in duplicado en otra cama.
 */
export async function buscarCamaOcupadaPorPersona(personaId: string): Promise<Cama | null> {
  const id = personaId.trim()
  if (!id) return null
  const db = getDb()
  const q = query(
    collection(db, COL_CAMAS),
    where('estado', '==', 'OCUPADA' as EstadoCama),
    where('personaId', '==', id),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return mapCama(d.id, d.data() as Record<string, unknown>)
}

export interface ResultadoImportPadron {
  creados: number
  actualizados: number
}

export async function importarPadronDesdeFilas(
  filas: FilaImportPadron[],
): Promise<ResultadoImportPadron> {
  const db = getDb()
  const snap = await getDocs(collection(db, COL_PADRON))
  const porDni = new Map<string, { id: string; data: Record<string, unknown> }>()
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>
    const k = typeof raw.dni === 'string' ? raw.dni.trim().toUpperCase() : ''
    if (k) porDni.set(k, { id: d.id, data: raw })
  })

  let creados = 0
  let actualizados = 0
  let batch = writeBatch(db)
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const f of filas) {
    const norm = normalizarPersonaPadronInput({
      dni: f.dni,
      nombre: f.nombre,
      apellido: f.apellido,
      empresa: f.empresa,
    })
    const { dni, nombre, apellido, empresa } = norm
    if (!dni) continue
    if (!nombre && !apellido) continue

    const exist = porDni.get(dni)
    if (exist) {
      batch.update(doc(db, COL_PADRON, exist.id), {
        nombre,
        apellido,
        empresa,
      })
      actualizados++
    } else {
      const ref = doc(collection(db, COL_PADRON))
      batch.set(ref, {
        dni,
        nombre,
        apellido,
        empresa,
        creadoEn: serverTimestamp(),
      })
      porDni.set(dni, { id: ref.id, data: {} })
      creados++
    }
    ops++
    if (ops >= 450) await flush()
  }
  await flush()
  return { creados, actualizados }
}

const BATCH_PADRON_MAX = 500

/**
 * Carga masiva: un documento por DNI en `padron_personas` con `merge: true`.
 * La empresa debe existir en `padron_empresas` (coincidencia sin distinguir mayúsculas).
 */
export async function importarPadronCargaMasiva(
  filas: FilaCargaMasivaPadron[],
): Promise<{ procesados: number; omitidos: number; empresasDesconocidas: string[] }> {
  const db = getDb()
  const mapaEmpresas = await obtenerMapaEmpresasPadronPorClave()
  if (mapaEmpresas.size === 0) {
    throw new Error(
      'No hay empresas en el Padrón de Empresas. Cargá empresas antes de importar personas.',
    )
  }

  let procesados = 0
  let omitidos = 0
  const empresasDesconocidasSet = new Set<string>()

  for (let i = 0; i < filas.length; i += BATCH_PADRON_MAX) {
    const chunk = filas.slice(i, i + BATCH_PADRON_MAX)
    const batch = writeBatch(db)
    let ops = 0

    for (const f of chunk) {
      const norm = normalizarPersonaPadronInput({
        dni: f.dni,
        nombre: f.nombre,
        apellido: f.apellido,
        empresa: f.empresa,
      })
      const dni = norm.dni
      if (!dni) {
        omitidos++
        continue
      }

      const empresaCanonica = resolverEmpresaEnPadron(norm.empresa, mapaEmpresas)
      if (!empresaCanonica) {
        omitidos++
        if (norm.empresa) empresasDesconocidasSet.add(norm.empresa)
        continue
      }

      const docId = idDocumentoPadronPorDni(dni)
      const ref = doc(db, COL_PADRON, docId)
      const nombreCompleto = `${norm.nombre} ${norm.apellido}`.trim()

      const payload: Record<string, unknown> = {
        dni,
        nombre: norm.nombre,
        apellido: norm.apellido,
        nombreCompleto,
        empresa: empresaCanonica,
        estado: f.estado,
      }
      if (f.legajo) payload.legajo = f.legajo
      if (f.posicion) payload.posicion = f.posicion
      if (f.sector) payload.sector = f.sector

      batch.set(ref, payload, { merge: true })
      ops++
      procesados++
    }

    if (ops > 0) await batch.commit()
  }

  return {
    procesados,
    omitidos,
    empresasDesconocidas: [...empresasDesconocidasSet].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    ),
  }
}

/** Alta manual en padrón; falla si el DNI ya existe. */
export async function crearPersonaPadron(input: {
  dni: string
  nombre: string
  apellido: string
  empresa: string
}): Promise<string> {
  let { dni, nombre, apellido, empresa } = normalizarPersonaPadronInput(input)
  if (!dni) throw new Error('El DNI es obligatorio.')
  if (!nombre || !apellido) throw new Error('Nombre y apellido son obligatorios.')
  if (empresa) {
    const mapa = await obtenerMapaEmpresasPadronPorClave()
    const canonica = resolverEmpresaEnPadron(empresa, mapa)
    if (!canonica) {
      throw new Error(
        `La empresa «${empresa}» no está en el Padrón de Empresas. Cargala primero o elegila del listado.`,
      )
    }
    empresa = canonica
  }
  const exist = await buscarPersonaPorDni(dni)
  if (exist) throw new Error('Ya existe una persona con ese DNI.')
  const db = getDb()
  const ref = doc(collection(db, COL_PADRON))
  await setDoc(ref, {
    dni,
    nombre,
    apellido,
    empresa,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

/** Actualiza datos del padrón; valida DNI único excluyendo el registro actual. */
export async function actualizarPersonaPadron(
  id: string,
  input: {
    dni: string
    nombre: string
    apellido: string
    empresa: string
  },
): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new Error('Registro inválido.')
  let { dni, nombre, apellido, empresa } = normalizarPersonaPadronInput(input)
  if (!dni) throw new Error('El DNI es obligatorio.')
  if (!nombre || !apellido) throw new Error('Nombre y apellido son obligatorios.')
  if (empresa) {
    const mapa = await obtenerMapaEmpresasPadronPorClave()
    const canonica = resolverEmpresaEnPadron(empresa, mapa)
    if (!canonica) {
      throw new Error(
        `La empresa «${empresa}» no está en el Padrón de Empresas. Cargala primero o elegila del listado.`,
      )
    }
    empresa = canonica
  }
  const otro = await buscarPersonaPorDni(dni)
  if (otro && otro.id !== docId) throw new Error('Ya existe otra persona con ese DNI.')
  const db = getDb()
  await updateDoc(doc(db, COL_PADRON, docId), { dni, nombre, apellido, empresa })
}

/** Elimina una persona del padrón si no tiene check-in activo. */
export async function eliminarPersonaPadron(id: string): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new Error('Registro inválido.')
  const cama = await buscarCamaOcupadaPorPersona(docId)
  if (cama) {
    throw new Error(
      'No se puede eliminar: la persona tiene un check-in activo. Hacé check-out primero.',
    )
  }
  const db = getDb()
  await deleteDoc(doc(db, COL_PADRON, docId))
}

export async function crearCama(input: {
  sector: string
  habitacion: string
  denominacion: string
}): Promise<string> {
  const db = getDb()
  const ref = doc(collection(db, COL_CAMAS))
  await setDoc(ref, {
    sector: input.sector.trim(),
    habitacion: input.habitacion.trim(),
    denominacion: input.denominacion.trim(),
    estado: 'LIBRE' as EstadoCama,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

/** Crea varias camas LIBRE en la misma habitación (uno o más lotes de writeBatch de hasta 450 ops). */
export async function crearCamasMasivoBatch(input: {
  sector: string
  habitacion: string
  denominaciones: string[]
}): Promise<number> {
  const sector = input.sector.trim()
  const habitacion = input.habitacion.trim()
  const seen = new Set<string>()
  const denominaciones: string[] = []
  for (const raw of input.denominaciones) {
    const d = raw.trim()
    if (!d || seen.has(d)) continue
    seen.add(d)
    denominaciones.push(d)
  }
  if (!sector || !habitacion) throw new Error('Completá sector y habitación.')
  if (!denominaciones.length) throw new Error('Agregá al menos una denominación de cama.')

  const db = getDb()
  let batch = writeBatch(db)
  let ops = 0
  let creadas = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  for (const denominacion of denominaciones) {
    const ref = doc(collection(db, COL_CAMAS))
    batch.set(ref, {
      sector,
      habitacion,
      denominacion,
      estado: 'LIBRE' as EstadoCama,
      creadoEn: serverTimestamp(),
    })
    ops++
    creadas++
    if (ops >= 450) await flush()
  }
  await flush()
  return creadas
}

/** Elimina una cama solo si no está ocupada (evita historial inconsistente). */
export async function eliminarCamaNoOcupada(camaId: string): Promise<void> {
  const db = getDb()
  const ref = doc(db, COL_CAMAS, camaId)
  await runTransaction(db, async (t) => {
    const s = await t.get(ref)
    if (!s.exists()) throw new Error('La cama no existe.')
    const c = mapCama(s.id, s.data() as Record<string, unknown>)
    if (c.estado === 'OCUPADA') {
      throw new Error('No se puede eliminar una cama ocupada. Hacé check-out o mové al huésped.')
    }
    t.delete(ref)
  })
}

export async function checkInCamaTransaccion(input: {
  camaId: string
  personaId: string
  fecha: Date
  fechaSalidaEstimada: Date
}): Promise<string> {
  validarFechaEgresoProgramadaCheckIn(input.fecha, input.fechaSalidaEstimada)
  const db = getDb()
  const camaRef = doc(db, COL_CAMAS, input.camaId)
  const personaRef = doc(db, COL_PADRON, input.personaId)
  const histRef = doc(collection(db, COL_HISTORIAL_PERNOCTES))
  const fechaTs = Timestamp.fromDate(input.fecha)
  const fseTs = Timestamp.fromDate(input.fechaSalidaEstimada)

  await runTransaction(db, async (t) => {
    const [cSnap, pSnap] = await Promise.all([t.get(camaRef), t.get(personaRef)])
    if (!cSnap.exists()) throw new Error('La cama no existe.')
    if (!pSnap.exists()) throw new Error('La persona no está en el padrón.')
    const c = mapCama(cSnap.id, cSnap.data() as Record<string, unknown>)
    if (c.estado !== 'LIBRE') {
      throw new Error('La cama no está libre. Actualizá el mapa e intentá de nuevo.')
    }
    const p = mapPadron(pSnap.id, pSnap.data() as Record<string, unknown>)
    const ocupanteNombre = `${p.apellido}, ${p.nombre}`.trim() || p.nombre || p.apellido || null
    const ocupanteEmpresa = p.empresa.trim() || null

    t.update(camaRef, {
      estado: 'OCUPADA',
      personaId: input.personaId,
      fechaCheckIn: fechaTs,
      historialAbiertoId: histRef.id,
      ocupanteNombre,
      ocupanteEmpresa,
      fechaSalidaEstimada: fseTs,
    })
    t.set(histRef, {
      personaId: input.personaId,
      camaId: input.camaId,
      empresa: p.empresa,
      fechaCheckIn: fechaTs,
      fechaCheckOut: null,
      fechaSalidaEstimada: fseTs,
    })
  })
  return histRef.id
}

/**
 * Check-out efectivo: persiste `fechaCheckOut` en el historial, limpia la planificación
 * y deja la cama en estado SUCIA (pendiente de limpieza).
 */
export async function checkOutCamaTransaccion(input: {
  camaId: string
  fechaCheckOut: Date
}): Promise<void> {
  assertFechaCheckOutRealNoEsFutura(input.fechaCheckOut)
  const db = getDb()
  const camaRef = doc(db, COL_CAMAS, input.camaId)
  const outTs = Timestamp.fromDate(input.fechaCheckOut)

  await runTransaction(db, async (t) => {
    const cSnap = await t.get(camaRef)
    if (!cSnap.exists()) throw new Error('La cama no existe.')
    const c = mapCama(cSnap.id, cSnap.data() as Record<string, unknown>)
    if (c.estado !== 'OCUPADA' || !c.personaId || !c.historialAbiertoId) {
      throw new Error('La cama no tiene ocupación activa.')
    }

    const hRef = doc(db, COL_HISTORIAL_PERNOCTES, c.historialAbiertoId)
    const hSnap = await t.get(hRef)
    if (!hSnap.exists()) throw new Error('Historial de pernocte no encontrado.')
    const hd = hSnap.data() as Record<string, unknown>
    if (hd.fechaCheckOut != null) {
      throw new Error('El pernocte ya fue cerrado.')
    }

    t.update(hRef, { fechaCheckOut: outTs, fechaSalidaEstimada: null })
    t.update(camaRef, {
      estado: 'SUCIA',
      personaId: null,
      fechaCheckIn: null,
      historialAbiertoId: null,
      ocupanteNombre: null,
      ocupanteEmpresa: null,
      fechaSalidaEstimada: null,
    })
  })
}

/**
 * Ejecuta check-out automático en camas cuya fecha de egreso programada ya venció.
 * Se invoca al cargar vistas de hotelería (p. ej. al abrir el mapa al día siguiente).
 */
export async function procesarEgresosProgramadosCamas(camas: Cama[]): Promise<number> {
  const candidatas = camas.filter(
    (c) =>
      c.estado === 'OCUPADA' &&
      c.historialAbiertoId &&
      egresoProgramadoVencido(c.fechaSalidaEstimada),
  )
  let procesadas = 0
  for (const c of candidatas) {
    const fse = c.fechaSalidaEstimada
    if (!fse) continue
    try {
      await checkOutCamaTransaccion({
        camaId: c.id,
        fechaCheckOut: fechaCheckOutDesdeEgresoProgramado(fse),
      })
      procesadas += 1
    } catch (err) {
      console.error('[hoteleria] egreso programado automático', c.id, err)
    }
  }
  return procesadas
}

/** Alias semántico para el check-out efectivo desde la UI operativa. */
export async function registrarCheckOutEfectivo(input: {
  camaId: string
  fechaCheckOut: Date
}): Promise<void> {
  return checkOutCamaTransaccion(input)
}

/**
 * Actualiza la fecha de egreso programada (`fechaSalidaEstimada`).
 * Si la nueva fecha ya venció, el caller debe ejecutar el check-out automático.
 */
export async function actualizarPlanificacionEstadiaTransaccion(input: {
  camaId: string
  fechaSalidaEstimada: Date
}): Promise<void> {
  const db = getDb()
  const camaRef = doc(db, COL_CAMAS, input.camaId)
  const fseTs = Timestamp.fromDate(input.fechaSalidaEstimada)

  await runTransaction(db, async (t) => {
    const cSnap = await t.get(camaRef)
    if (!cSnap.exists()) throw new Error('La cama no existe.')
    const c = mapCama(cSnap.id, cSnap.data() as Record<string, unknown>)
    if (c.estado !== 'OCUPADA' || !c.historialAbiertoId) {
      throw new Error(
        'Solo se puede editar la planificación en una cama ocupada con estadía activa.',
      )
    }
    const checkIn = c.fechaCheckIn
    if (checkIn) {
      validarFechaEgresoProgramadaCheckIn(checkIn, input.fechaSalidaEstimada)
    }
    const hRef = doc(db, COL_HISTORIAL_PERNOCTES, c.historialAbiertoId)
    const hSnap = await t.get(hRef)
    if (!hSnap.exists()) throw new Error('Historial de pernocte no encontrado.')
    const hd = hSnap.data() as Record<string, unknown>
    if (hd.fechaCheckOut != null) {
      throw new Error('El pernocte ya fue cerrado.')
    }
    t.update(camaRef, { fechaSalidaEstimada: fseTs })
    t.update(hRef, { fechaSalidaEstimada: fseTs })
  })
}

/** @deprecated Usar `actualizarPlanificacionEstadiaTransaccion`. */
export const actualizarFechaSalidaEstimadaTransaccion = actualizarPlanificacionEstadiaTransaccion

export async function trasladarCamaTransaccion(input: {
  camaOrigenId: string
  camaDestinoId: string
  fecha: Date
}): Promise<void> {
  if (input.camaOrigenId === input.camaDestinoId) {
    throw new Error('Elegí una cama destino distinta del origen.')
  }
  const db = getDb()
  const refO = doc(db, COL_CAMAS, input.camaOrigenId)
  const refD = doc(db, COL_CAMAS, input.camaDestinoId)
  const ts = Timestamp.fromDate(input.fecha)
  const nuevoHist = doc(collection(db, COL_HISTORIAL_PERNOCTES))

  await runTransaction(db, async (t) => {
    const [sO, sD] = await Promise.all([t.get(refO), t.get(refD)])
    if (!sO.exists() || !sD.exists()) throw new Error('Cama origen o destino inexistente.')
    const o = mapCama(sO.id, sO.data() as Record<string, unknown>)
    const d = mapCama(sD.id, sD.data() as Record<string, unknown>)
    if (o.estado !== 'OCUPADA' || !o.personaId || !o.historialAbiertoId) {
      throw new Error('La cama de origen no tiene ocupación activa.')
    }
    if (d.estado !== 'LIBRE') {
      throw new Error('La cama destino no está libre.')
    }

    const hRefO = doc(db, COL_HISTORIAL_PERNOCTES, o.historialAbiertoId)
    const hSnap = await t.get(hRefO)
    if (!hSnap.exists()) throw new Error('Historial de pernocte no encontrado.')
    const hData = hSnap.data() as Record<string, unknown>
    if (hData.fechaCheckOut != null) throw new Error('El pernocte de origen ya está cerrado.')
    const empresaHist = typeof hData.empresa === 'string' ? hData.empresa.trim() : ''
    let ocupanteEmpresa = o.ocupanteEmpresa?.trim() ?? ''
    let ocupanteNombre = o.ocupanteNombre?.trim() ?? ''
    if (!ocupanteNombre || !ocupanteEmpresa) {
      const pRef = doc(db, COL_PADRON, o.personaId)
      const pSnap = await t.get(pRef)
      if (pSnap.exists()) {
        const p = mapPadron(pSnap.id, pSnap.data() as Record<string, unknown>)
        if (!ocupanteNombre) {
          ocupanteNombre = `${p.apellido}, ${p.nombre}`.trim() || p.nombre || p.apellido || ''
        }
        if (!ocupanteEmpresa) ocupanteEmpresa = p.empresa.trim()
      }
    }
    if (!ocupanteEmpresa) ocupanteEmpresa = empresaHist
    const fseOrigen = o.fechaSalidaEstimada ?? tsToDate(hData.fechaSalidaEstimada)
    const fseTsTraslado = fseOrigen ? Timestamp.fromDate(fseOrigen) : null

    t.update(hRefO, { fechaCheckOut: ts })
    t.update(refO, {
      estado: 'SUCIA',
      personaId: null,
      fechaCheckIn: null,
      historialAbiertoId: null,
      ocupanteNombre: null,
      ocupanteEmpresa: null,
      fechaSalidaEstimada: null,
    })
    t.update(refD, {
      estado: 'OCUPADA',
      personaId: o.personaId,
      fechaCheckIn: ts,
      historialAbiertoId: nuevoHist.id,
      ocupanteNombre: ocupanteNombre || null,
      ocupanteEmpresa: ocupanteEmpresa.trim() || null,
      fechaSalidaEstimada: fseTsTraslado,
    })
    t.set(nuevoHist, {
      personaId: o.personaId,
      camaId: input.camaDestinoId,
      empresa: ocupanteEmpresa.trim() || empresaHist,
      fechaCheckIn: ts,
      fechaCheckOut: null,
      fechaSalidaEstimada: fseTsTraslado,
    })
  })
}

export type ItemCheckInMasivo = {
  camaId: string
  personaId: string
  empresa: string
  ocupanteNombre: string
  fecha: Date
  fechaSalidaEstimada: Date
}

/** Check-in masivo: cada `writeBatch.commit()` es atómico (hasta ~225 camas por lote de 450 ops). */
export async function checkInCamasMasivoBatch(items: ItemCheckInMasivo[]): Promise<void> {
  if (!items.length) return
  const ids = new Set<string>()
  for (const it of items) {
    if (ids.has(it.camaId)) throw new Error('Hay cama duplicada en la lista.')
    ids.add(it.camaId)
  }
  const db = getDb()
  let batch = writeBatch(db)
  let ops = 0
  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }
  for (const it of items) {
    validarFechaEgresoProgramadaCheckIn(it.fecha, it.fechaSalidaEstimada)
    const histRef = doc(collection(db, COL_HISTORIAL_PERNOCTES))
    const camaRef = doc(db, COL_CAMAS, it.camaId)
    const ts = Timestamp.fromDate(it.fecha)
    const fseTs = Timestamp.fromDate(it.fechaSalidaEstimada)
    batch.update(camaRef, {
      estado: 'OCUPADA' as EstadoCama,
      personaId: it.personaId,
      fechaCheckIn: ts,
      historialAbiertoId: histRef.id,
      ocupanteNombre: it.ocupanteNombre.trim() || null,
      ocupanteEmpresa: it.empresa.trim() || null,
      fechaSalidaEstimada: fseTs,
    })
    batch.set(histRef, {
      personaId: it.personaId,
      camaId: it.camaId,
      empresa: it.empresa.trim(),
      fechaCheckIn: ts,
      fechaCheckOut: null,
      fechaSalidaEstimada: fseTs,
    })
    ops += 2
    if (ops >= 450) await flush()
  }
  await flush()
}

export type ItemCheckOutMasivo = {
  camaId: string
  historialAbiertoId: string
  fechaCheckOut: Date
}

export async function checkOutCamasMasivoBatch(items: ItemCheckOutMasivo[]): Promise<void> {
  if (!items.length) return
  for (const it of items) {
    assertFechaCheckOutRealNoEsFutura(it.fechaCheckOut)
  }
  const db = getDb()
  let batch = writeBatch(db)
  let ops = 0
  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }
  for (const it of items) {
    const outTs = Timestamp.fromDate(it.fechaCheckOut)
    batch.update(doc(db, COL_HISTORIAL_PERNOCTES, it.historialAbiertoId), { fechaCheckOut: outTs })
    batch.update(doc(db, COL_CAMAS, it.camaId), {
      estado: 'SUCIA' as EstadoCama,
      personaId: null,
      fechaCheckIn: null,
      historialAbiertoId: null,
      ocupanteNombre: null,
      ocupanteEmpresa: null,
      fechaSalidaEstimada: null,
    })
    ops += 2
    if (ops >= 450) await flush()
  }
  await flush()
}

export type ItemTrasladoMasivo = {
  camaOrigenId: string
  camaDestinoId: string
  personaId: string
  empresa: string
  ocupanteNombre: string
  historialAbiertoIdOrigen: string
  fecha: Date
  fechaSalidaEstimada?: Date | null
}

export async function trasladarCamasMasivoBatch(items: ItemTrasladoMasivo[]): Promise<void> {
  if (!items.length) return
  const destinos = new Set<string>()
  for (const it of items) {
    if (it.camaOrigenId === it.camaDestinoId) {
      throw new Error('Origen y destino no pueden ser la misma cama.')
    }
    if (destinos.has(it.camaDestinoId)) {
      throw new Error('Cada cama destino debe ser única en el traslado masivo.')
    }
    destinos.add(it.camaDestinoId)
  }
  const db = getDb()
  let batch = writeBatch(db)
  let ops = 0
  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }
  for (const it of items) {
    const nuevoHist = doc(collection(db, COL_HISTORIAL_PERNOCTES))
    const ts = Timestamp.fromDate(it.fecha)
    const fseTs =
      it.fechaSalidaEstimada != null ? Timestamp.fromDate(it.fechaSalidaEstimada) : null
    const hRefO = doc(db, COL_HISTORIAL_PERNOCTES, it.historialAbiertoIdOrigen)
    batch.update(hRefO, { fechaCheckOut: ts })
    batch.update(doc(db, COL_CAMAS, it.camaOrigenId), {
      estado: 'SUCIA' as EstadoCama,
      personaId: null,
      fechaCheckIn: null,
      historialAbiertoId: null,
      ocupanteNombre: null,
      ocupanteEmpresa: null,
      fechaSalidaEstimada: null,
    })
    batch.update(doc(db, COL_CAMAS, it.camaDestinoId), {
      estado: 'OCUPADA' as EstadoCama,
      personaId: it.personaId,
      fechaCheckIn: ts,
      historialAbiertoId: nuevoHist.id,
      ocupanteNombre: it.ocupanteNombre.trim() || null,
      ocupanteEmpresa: it.empresa.trim() || null,
      fechaSalidaEstimada: fseTs,
    })
    batch.set(nuevoHist, {
      personaId: it.personaId,
      camaId: it.camaDestinoId,
      empresa: it.empresa.trim(),
      fechaCheckIn: ts,
      fechaCheckOut: null,
      fechaSalidaEstimada: fseTs,
    })
    ops += 4
    if (ops >= 450) await flush()
  }
  await flush()
}

export interface ItemRegistroLimpieza {
  camaId: string
  sector: string
  habitacion: string
}

/**
 * Marca camas sucias como LIBRE, guarda responsable/fecha en la cama y crea un documento en
 * `historial_limpiezas` por cada una (misma operación en writeBatch).
 */
export async function registrarLimpiezaCamasBatch(
  items: ItemRegistroLimpieza[],
  responsableLimpieza: string,
): Promise<void> {
  const resp = responsableLimpieza.trim()
  if (!resp) throw new Error('Indicá quién realizó la limpieza.')

  const porId = new Map<string, ItemRegistroLimpieza>()
  for (const it of items) {
    const id = it.camaId.trim()
    if (!id) continue
    porId.set(id, { camaId: id, sector: it.sector, habitacion: it.habitacion })
  }
  const list = [...porId.values()]
  if (!list.length) return

  const db = getDb()
  try {
    const snaps = await Promise.all(list.map((it) => getDoc(doc(db, COL_CAMAS, it.camaId))))
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i]!
      if (!s.exists()) throw new Error('Una de las camas ya no existe. Actualizá el mapa e intentá de nuevo.')
      const c = mapCama(s.id, s.data() as Record<string, unknown>)
      if (c.estado !== 'SUCIA') {
        throw new Error(
          `La cama ${c.sector} · ${c.habitacion} · ${c.denominacion} no está en estado Sucia.`,
        )
      }
    }

    let batch = writeBatch(db)
    let ops = 0
    async function flush() {
      if (ops === 0) return
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }

    for (const it of list) {
      const camaRef = doc(db, COL_CAMAS, it.camaId)
      const historialRef = doc(collection(db, COL_HISTORIAL_LIMPIEZAS))
      batch.update(camaRef, {
        estado: 'LIBRE' as EstadoCama,
        personaId: null,
        fechaCheckIn: null,
        historialAbiertoId: null,
        ocupanteNombre: null,
        ocupanteEmpresa: null,
        fechaSalidaEstimada: null,
        ultimoResponsableLimpieza: resp,
        ultimaFechaLimpieza: serverTimestamp(),
      })
      batch.set(historialRef, {
        camaId: it.camaId,
        sector: it.sector.trim(),
        habitacion: it.habitacion.trim(),
        responsableLimpieza: resp,
        fechaLimpieza: serverTimestamp(),
      })
      ops += 2
      if (ops >= 450) await flush()
    }
    await flush()
  } catch (e) {
    if (esPermissionDeniedFirestore(e)) throw new Error(mensajePermisosLimpiezaFirestore())
    throw e
  }
}

export async function marcarCamaMantenimiento(camaId: string, activar: boolean): Promise<void> {
  const db = getDb()
  const ref = doc(db, COL_CAMAS, camaId)
  if (!activar) {
    await updateDoc(ref, { estado: 'LIBRE' as EstadoCama })
    return
  }
  await runTransaction(db, async (t) => {
    const s = await t.get(ref)
    if (!s.exists()) throw new Error('La cama no existe.')
    const c = mapCama(s.id, s.data() as Record<string, unknown>)
    if (c.estado === 'OCUPADA') {
      throw new Error('No se puede poner en mantenimiento una cama ocupada. Hacé check-out primero.')
    }
    t.update(ref, {
      estado: 'MANTENIMIENTO' as EstadoCama,
      personaId: null,
      fechaCheckIn: null,
      historialAbiertoId: null,
      ocupanteNombre: null,
      ocupanteEmpresa: null,
      fechaSalidaEstimada: null,
    })
  })
}

function validarFechasAjustePernocte(fechaCheckIn: Date, fechaCheckOut: Date | null | undefined): void {
  if (!fechaCheckOut) {
    throw new Error('Indicá la fecha de egreso.')
  }
  if (fechaCheckOut.getTime() <= fechaCheckIn.getTime()) {
    throw new Error('La fecha de egreso debe ser posterior al ingreso.')
  }
}

const patchCamaLibre = {
  estado: 'LIBRE' as EstadoCama,
  personaId: null,
  fechaCheckIn: null,
  historialAbiertoId: null,
  ocupanteNombre: null,
  ocupanteEmpresa: null,
  fechaSalidaEstimada: null,
}

/** Alta manual de pernocte (sin transacción de cama; corrección histórica). */
export async function crearAjusteManualPernocte(input: {
  personaId: string
  camaId: string
  fechaCheckIn: Date
  fechaCheckOut: Date
}): Promise<string> {
  const personaId = input.personaId.trim()
  const camaId = input.camaId.trim()
  if (!personaId) throw new Error('Seleccioná una persona del padrón.')
  if (!camaId) throw new Error('Indicá la habitación / cama.')
  validarFechasAjustePernocte(input.fechaCheckIn, input.fechaCheckOut)

  const db = getDb()
  const pSnap = await getDoc(doc(db, COL_PADRON, personaId))
  if (!pSnap.exists()) throw new Error('La persona no está en el padrón.')
  const p = mapPadron(pSnap.id, pSnap.data() as Record<string, unknown>)

  const ref = doc(collection(db, COL_HISTORIAL_PERNOCTES))
  await setDoc(ref, {
    personaId,
    camaId,
    empresa: p.empresa.trim(),
    fechaCheckIn: Timestamp.fromDate(input.fechaCheckIn),
    fechaCheckOut: Timestamp.fromDate(input.fechaCheckOut),
    fechaSalidaEstimada: null,
    ajusteManual: true,
  })
  return ref.id
}

/** Actualiza fechas y cama de un pernocte existente. */
export async function actualizarAjusteManualPernocte(input: {
  historialId: string
  personaId: string
  camaId: string
  fechaCheckIn: Date
  fechaCheckOut: Date
}): Promise<void> {
  const historialId = input.historialId.trim()
  const personaId = input.personaId.trim()
  const camaId = input.camaId.trim()
  if (!historialId) throw new Error('Registro inválido.')
  if (!personaId) throw new Error('Seleccioná una persona del padrón.')
  if (!camaId) throw new Error('Indicá la habitación / cama.')
  validarFechasAjustePernocte(input.fechaCheckIn, input.fechaCheckOut)

  const db = getDb()
  const pSnap = await getDoc(doc(db, COL_PADRON, personaId))
  if (!pSnap.exists()) throw new Error('La persona no está en el padrón.')
  const p = mapPadron(pSnap.id, pSnap.data() as Record<string, unknown>)

  await updateDoc(doc(db, COL_HISTORIAL_PERNOCTES, historialId), {
    personaId,
    camaId,
    empresa: p.empresa.trim(),
    fechaCheckIn: Timestamp.fromDate(input.fechaCheckIn),
    fechaCheckOut: Timestamp.fromDate(input.fechaCheckOut),
  })
}

/** Elimina un pernocte y desocupa la cama si estaba vinculada. */
export async function eliminarAjusteManualPernocte(historialId: string): Promise<void> {
  const id = historialId.trim()
  if (!id) throw new Error('Registro inválido.')
  const db = getDb()
  const hRef = doc(db, COL_HISTORIAL_PERNOCTES, id)
  const hSnap = await getDoc(hRef)
  if (!hSnap.exists()) throw new Error('El registro ya no existe.')

  const camasQ = query(
    collection(db, COL_CAMAS),
    where('historialAbiertoId', '==', id),
    limit(10),
  )
  const camasSnap = await getDocs(camasQ)

  await runTransaction(db, async (t) => {
    for (const d of camasSnap.docs) {
      t.update(doc(db, COL_CAMAS, d.id), patchCamaLibre)
    }
    t.delete(hRef)
  })
}

/** Resuelve id de cama por etiqueta visible o fragmento de texto. */
export function resolverCamaIdPorTexto(texto: string, camas: Cama[]): string {
  const t = texto.trim().toLowerCase()
  if (!t) return ''
  for (const c of camas) {
    const label = `${c.sector} · ${c.habitacion} · ${c.denominacion}`.trim().toLowerCase()
    if (label === t) return c.id
  }
  for (const c of camas) {
    const label = `${c.sector} · ${c.habitacion} · ${c.denominacion}`.trim().toLowerCase()
    if (label.includes(t) || t.includes(c.denominacion.trim().toLowerCase())) return c.id
  }
  return ''
}

export function etiquetaCamaDesdeId(camaId: string, camas: Cama[]): string {
  const c = camas.find((x) => x.id === camaId)
  if (!c) return camaId
  return `${c.sector} · ${c.habitacion} · ${c.denominacion}`
}
