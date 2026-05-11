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
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { COLLECTION_INSUMOS } from './insumos'

export const COLLECTION_CATEGORIAS = 'categorias'

export interface Categoria {
  id: string
  nombre: string
  subrubros: string[]
}

export interface CrearCategoriaInput {
  nombre: string
  subrubros?: string[]
}

function normalizarNombre(value: string): string {
  return value.trim()
}

function uniqStrings(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = normalizarNombre(raw)
    if (!value) continue
    const key = value.toLocaleLowerCase('es')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function mapCategoriaDoc(id: string, data: Record<string, unknown>): Categoria {
  const nombre = typeof data.nombre === 'string' ? normalizarNombre(data.nombre) : ''
  const subrubrosRaw = Array.isArray(data.subrubros) ? data.subrubros : []
  const subrubros = uniqStrings(
    subrubrosRaw.filter((item): item is string => typeof item === 'string'),
  )

  return {
    id,
    nombre,
    subrubros,
  }
}

function buildCategoriaPayload(input: CrearCategoriaInput): {
  nombre: string
  subrubros: string[]
} {
  const nombre = normalizarNombre(input.nombre)
  const subrubros = uniqStrings(input.subrubros ?? [])

  if (!nombre) {
    throw new Error('Ingresá el nombre del rubro.')
  }

  return { nombre, subrubros }
}

export function subscribeCategorias(
  onChange: (rows: Categoria[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_CATEGORIAS),
    orderBy('nombre', 'asc'),
  )

  return onSnapshot(
    q,
    (snap) => {
      const rows: Categoria[] = []
      snap.forEach((d) => {
        rows.push(mapCategoriaDoc(d.id, d.data() as Record<string, unknown>))
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeCategorias', err)
      onChange([])
    },
  )
}

export async function crearCategoria(
  input: CrearCategoriaInput,
): Promise<string> {
  const payload = buildCategoriaPayload(input)
  const db = getDb()
  const ref = await addDoc(collection(db, COLLECTION_CATEGORIAS), {
    ...payload,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function actualizarCategoria(
  id: string,
  input: CrearCategoriaInput,
): Promise<void> {
  const payload = buildCategoriaPayload(input)
  const db = getDb()
  await updateDoc(doc(db, COLLECTION_CATEGORIAS, id), {
    ...payload,
    actualizadoEn: serverTimestamp(),
  })
}

export async function eliminarCategoria(id: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, COLLECTION_CATEGORIAS, id))
}

export async function existeInsumoUsandoRubro(nombreRubro: string): Promise<boolean> {
  const rubro = normalizarNombre(nombreRubro)
  if (!rubro) return false

  const db = getDb()
  const snap = await getDocs(
    query(
      collection(db, COLLECTION_INSUMOS),
      where('rubro', '==', rubro),
      limit(1),
    ),
  )
  return !snap.empty
}

export async function existeInsumoUsandoSubrubro(
  nombreRubro: string,
  nombreSubrubro: string,
): Promise<boolean> {
  const rubro = normalizarNombre(nombreRubro)
  const subrubro = normalizarNombre(nombreSubrubro)
  if (!rubro || !subrubro) return false

  const db = getDb()
  const snap = await getDocs(
    query(
      collection(db, COLLECTION_INSUMOS),
      where('rubro', '==', rubro),
      where('subrubro', '==', subrubro),
      limit(1),
    ),
  )
  return !snap.empty
}
