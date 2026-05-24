import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { FilaImportPadronEmpresa, PadronEmpresa } from '../types/padronEmpresa'

export const COL_PADRON_EMPRESAS = 'padron_empresas'

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
          console.error('[Firestore] padron_empresas', e)
        }),
    )
  })
  return () => {
    cancelAnimationFrame(raf)
    inner?.()
  }
}

export function normalizarNombreEmpresa(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ')
}

export function claveNombreEmpresa(nombre: string): string {
  return normalizarNombreEmpresa(nombre).toLowerCase()
}

export function normalizarCuit(cuit: string): string {
  return cuit.trim()
}

export function mapPadronEmpresa(id: string, data: Record<string, unknown>): PadronEmpresa {
  return {
    id,
    nombre: typeof data.nombre === 'string' ? normalizarNombreEmpresa(data.nombre) : '',
    cuit: typeof data.cuit === 'string' ? normalizarCuit(data.cuit) : '',
    creadoEn: tsToDate(data.creadoEn),
  }
}

function sortEmpresas(rows: PadronEmpresa[]): PadronEmpresa[] {
  return [...rows].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  )
}

export function subscribePadronEmpresas(
  onChange: (rows: PadronEmpresa[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_PADRON_EMPRESAS))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: PadronEmpresa[] = []
      snap.forEach((d) =>
        rows.push(mapPadronEmpresa(d.id, d.data() as Record<string, unknown>)),
      )
      onChange(sortEmpresas(rows))
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error(
          '[Firestore] padron_empresas: permiso denegado. Publicá reglas: `firebase deploy --only firestore:rules`.',
        )
      }
      onChange([])
    },
  )
}

export async function buscarEmpresaPadronPorNombre(
  nombre: string,
): Promise<PadronEmpresa | null> {
  const clave = claveNombreEmpresa(nombre)
  if (!clave) return null
  const snap = await getDocs(collection(getDb(), COL_PADRON_EMPRESAS))
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    if (claveNombreEmpresa(String(data.nombre ?? '')) === clave) {
      return mapPadronEmpresa(d.id, data)
    }
  }
  return null
}

export interface ResultadoImportPadronEmpresas {
  creados: number
  actualizados: number
  omitidos: number
}

export async function importarPadronEmpresasDesdeFilas(
  filas: FilaImportPadronEmpresa[],
): Promise<ResultadoImportPadronEmpresas> {
  const db = getDb()
  const snap = await getDocs(collection(db, COL_PADRON_EMPRESAS))
  const porClave = new Map<string, { id: string }>()
  snap.forEach((d) => {
    const raw = d.data() as Record<string, unknown>
    const k = claveNombreEmpresa(String(raw.nombre ?? ''))
    if (k) porClave.set(k, { id: d.id })
  })

  let creados = 0
  let actualizados = 0
  let omitidos = 0
  let batch = writeBatch(db)
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = writeBatch(db)
    ops = 0
  }

  const vistosEnArchivo = new Set<string>()

  for (const f of filas) {
    const nombre = normalizarNombreEmpresa(f.nombre)
    if (!nombre) {
      omitidos++
      continue
    }
    const clave = claveNombreEmpresa(nombre)
    if (vistosEnArchivo.has(clave)) {
      omitidos++
      continue
    }
    vistosEnArchivo.add(clave)

    const cuit = normalizarCuit(f.cuit ?? '')
    const exist = porClave.get(clave)
    if (exist) {
      batch.update(doc(db, COL_PADRON_EMPRESAS, exist.id), { nombre, cuit })
      actualizados++
    } else {
      const ref = doc(collection(db, COL_PADRON_EMPRESAS))
      batch.set(ref, { nombre, cuit, creadoEn: serverTimestamp() })
      porClave.set(clave, { id: ref.id })
      creados++
    }
    ops++
    if (ops >= 450) await flush()
  }
  await flush()
  return { creados, actualizados, omitidos }
}

/** Alta manual; falla si el nombre ya existe (sin distinguir mayúsculas). */
export async function crearEmpresaPadron(input: {
  nombre: string
  cuit?: string
}): Promise<string> {
  const nombre = normalizarNombreEmpresa(input.nombre)
  if (!nombre) throw new Error('El nombre de empresa es obligatorio.')
  const exist = await buscarEmpresaPadronPorNombre(nombre)
  if (exist) throw new Error('Ya existe una empresa con ese nombre.')
  const cuit = normalizarCuit(input.cuit ?? '')
  const db = getDb()
  const ref = doc(collection(db, COL_PADRON_EMPRESAS))
  await setDoc(ref, { nombre, cuit, creadoEn: serverTimestamp() })
  return ref.id
}

/** Actualiza nombre y CUIT; el CUIT puede quedar vacío. */
export async function actualizarEmpresaPadron(
  id: string,
  input: { nombre: string; cuit?: string },
): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new Error('Registro inválido.')
  const nombre = normalizarNombreEmpresa(input.nombre)
  if (!nombre) throw new Error('El nombre de empresa es obligatorio.')
  const cuit = normalizarCuit(input.cuit ?? '')
  const otro = await buscarEmpresaPadronPorNombre(nombre)
  if (otro && otro.id !== docId) throw new Error('Ya existe otra empresa con ese nombre.')
  const db = getDb()
  await updateDoc(doc(db, COL_PADRON_EMPRESAS, docId), { nombre, cuit })
}

/** Elimina una empresa del padrón corporativo. */
export async function eliminarEmpresaPadron(id: string): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new Error('Registro inválido.')
  const db = getDb()
  await deleteDoc(doc(db, COL_PADRON_EMPRESAS, docId))
}
