import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'

export const COLLECTION_RECETARIO = 'recetario'

export type CategoriaReceta = 'Principal' | 'Guarnición'
export type DietaReceta =
  | 'Sin TACC'
  | 'Vegetariano'
  | 'Vegano'
  | 'Bajo en Sodio'

export const CATEGORIAS_RECETA: CategoriaReceta[] = [
  'Principal',
  'Guarnición',
]

export const DIETAS_RECETA: DietaReceta[] = [
  'Sin TACC',
  'Vegetariano',
  'Vegano',
  'Bajo en Sodio',
]

export const UNIDADES_RECETA = ['Kg', 'Lt', 'Un', 'Gr'] as const
export type UnidadReceta = (typeof UNIDADES_RECETA)[number]

export interface IngredienteReceta {
  ingrediente: string
  cantidadBruta: number
  unidad: UnidadReceta
  porcentajeMerma: number
  costoEstimado: number
}

export interface RecetaTecnica {
  id: string
  nombre: string
  categoria: CategoriaReceta
  aceptaGuarnicion: boolean
  dietas: DietaReceta[]
  rendimientoPorciones: number
  procedimiento: string
  ingredientes: IngredienteReceta[]
  fechaCreacion: Date | null
  ultimaActualizacion: Date | null
}

export interface CrearRecetaInput {
  nombre: string
  categoria: CategoriaReceta
  aceptaGuarnicion: boolean
  dietas: DietaReceta[]
  rendimientoPorciones: number
  procedimiento: string
  ingredientes: IngredienteReceta[]
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function mapIngrediente(raw: unknown): IngredienteReceta | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const ingrediente =
    typeof obj.ingrediente === 'string' ? obj.ingrediente.trim() : ''
  const cantidadBruta = clampNonNegative(Number(obj.cantidadBruta))
  const porcentajeMerma = clampNonNegative(Number(obj.porcentajeMerma))
  const costoEstimado = clampNonNegative(Number(obj.costoEstimado))
  const unidadRaw = typeof obj.unidad === 'string' ? obj.unidad : ''
  const unidad = UNIDADES_RECETA.includes(unidadRaw as UnidadReceta)
    ? (unidadRaw as UnidadReceta)
    : 'Un'

  if (!ingrediente || cantidadBruta <= 0) return null

  return {
    ingrediente,
    cantidadBruta,
    unidad,
    porcentajeMerma,
    costoEstimado,
  }
}

function mapRecetaDoc(id: string, data: Record<string, unknown>): RecetaTecnica {
  const fechaCreacionRaw = data.fechaCreacion
  const ultimaActualizacionRaw = data.ultimaActualizacion

  const fechaCreacion =
    fechaCreacionRaw instanceof Timestamp ? fechaCreacionRaw.toDate() : null
  const ultimaActualizacion =
    ultimaActualizacionRaw instanceof Timestamp
      ? ultimaActualizacionRaw.toDate()
      : null

  const categoriaRaw = data.categoria
  const categoria: CategoriaReceta =
    categoriaRaw === 'Guarnición' ? 'Guarnición' : 'Principal'

  const dietasRaw = Array.isArray(data.dietas) ? data.dietas : []
  const dietas = dietasRaw.filter((d): d is DietaReceta =>
    DIETAS_RECETA.includes(d as DietaReceta),
  )

  const ingredientesRaw = Array.isArray(data.ingredientes) ? data.ingredientes : []
  const ingredientes: IngredienteReceta[] = []
  for (const item of ingredientesRaw) {
    const mapped = mapIngrediente(item)
    if (mapped) ingredientes.push(mapped)
  }

  return {
    id,
    nombre: typeof data.nombre === 'string' ? data.nombre.trim() : 'Sin nombre',
    categoria,
    aceptaGuarnicion: data.aceptaGuarnicion !== false,
    dietas,
    rendimientoPorciones: clampNonNegative(Number(data.rendimientoPorciones)),
    procedimiento:
      typeof data.procedimiento === 'string' ? data.procedimiento.trim() : '',
    ingredientes,
    fechaCreacion,
    ultimaActualizacion,
  }
}

export function subscribeRecetario(
  onChange: (rows: RecetaTecnica[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COLLECTION_RECETARIO),
    orderBy('ultimaActualizacion', 'desc'),
  )

  return onSnapshot(
    q,
    (snap) => {
      const rows: RecetaTecnica[] = []
      snap.forEach((docSnap) => {
        rows.push(mapRecetaDoc(docSnap.id, docSnap.data() as Record<string, unknown>))
      })
      onChange(rows)
    },
    (err) => {
      console.error('subscribeRecetario', err)
      onChange([])
    },
  )
}

export async function crearReceta(input: CrearRecetaInput): Promise<void> {
  const nombre = input.nombre.trim()
  const procedimiento = input.procedimiento.trim()
  const rendimientoPorciones = Math.max(
    1,
    Math.floor(Number(input.rendimientoPorciones) || 0),
  )

  const ingredientes = input.ingredientes
    .map((item) => ({
      ingrediente: item.ingrediente.trim(),
      cantidadBruta: clampNonNegative(Number(item.cantidadBruta)),
      unidad: item.unidad,
      porcentajeMerma: clampNonNegative(Number(item.porcentajeMerma)),
      costoEstimado: clampNonNegative(Number(item.costoEstimado)),
    }))
    .filter((item) => item.ingrediente.length > 0 && item.cantidadBruta > 0)

  if (!nombre) {
    throw new Error('Ingresá el nombre de la receta.')
  }
  if (!procedimiento) {
    throw new Error('Ingresá el procedimiento de elaboración.')
  }
  if (ingredientes.length === 0) {
    throw new Error('Agregá al menos un ingrediente válido.')
  }
  if (!CATEGORIAS_RECETA.includes(input.categoria)) {
    throw new Error('Seleccioná una categoría válida.')
  }

  const dietas = input.dietas.filter((dieta): dieta is DietaReceta =>
    DIETAS_RECETA.includes(dieta),
  )

  const db = getDb()
  await addDoc(collection(db, COLLECTION_RECETARIO), {
    nombre,
    categoria: input.categoria,
    aceptaGuarnicion:
      input.categoria === 'Principal' ? input.aceptaGuarnicion : false,
    dietas,
    rendimientoPorciones,
    procedimiento,
    ingredientes,
    fechaCreacion: serverTimestamp(),
    ultimaActualizacion: serverTimestamp(),
  })
}
