import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { costoFilaRecetaFromInsumo, type Insumo } from './insumos'
import { upsertMenuItemLinkedToReceta, type CategoriaMenu } from './menu'
import {
  normalizarCodigoCorto,
  siguienteCodigoCortoDisponible,
} from './produccionLotes'

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
  /** Si viene del catálogo de depósito; las filas viejas solo tienen texto en `ingrediente`. */
  insumoId?: string | null
  ingrediente: string
  cantidadBruta: number
  unidad: UnidadReceta
  porcentajeMerma: number
  costoEstimado: number
}

export interface RecetaTecnica {
  id: string
  nombre: string
  /** Código corto numérico de 2 dígitos (ej. `01`) para lotes V-/G-. */
  codigoCorto: string
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
  /** Opcional: si falta, se autogenera el próximo `01`…`99`. */
  codigoCorto?: string
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
  const insumoIdRaw = obj.insumoId
  const insumoId =
    typeof insumoIdRaw === 'string' && insumoIdRaw.trim().length > 0
      ? insumoIdRaw.trim()
      : null

  const cantidadBruta = clampNonNegative(Number(obj.cantidadBruta))
  const porcentajeMerma = clampNonNegative(Number(obj.porcentajeMerma))
  const costoEstimado = clampNonNegative(Number(obj.costoEstimado))
  const unidadRaw = typeof obj.unidad === 'string' ? obj.unidad : ''
  const unidad = UNIDADES_RECETA.includes(unidadRaw as UnidadReceta)
    ? (unidadRaw as UnidadReceta)
    : 'Un'

  if (!ingrediente || cantidadBruta <= 0) return null

  return {
    ...(insumoId ? { insumoId } : {}),
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
    codigoCorto: normalizarCodigoCorto(
      typeof data.codigoCorto === 'string' ? data.codigoCorto : '',
    ),
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

/** Normaliza y valida el alta/edición de una receta; lanza si falta algo obligatorio. */
function buildRecetaFirestorePayload(
  input: CrearRecetaInput,
  codigoCortoResuelto: string,
): {
  nombre: string
  codigoCorto: string
  categoria: CategoriaReceta
  aceptaGuarnicion: boolean
  dietas: DietaReceta[]
  rendimientoPorciones: number
  procedimiento: string
  ingredientes: IngredienteReceta[]
} {
  const nombre = input.nombre.trim()
  const procedimiento = input.procedimiento.trim()
  const rendimientoPorciones = Math.max(
    1,
    Math.floor(Number(input.rendimientoPorciones) || 0),
  )
  const codigoCorto = normalizarCodigoCorto(codigoCortoResuelto)
  if (!codigoCorto) {
    throw new Error('Indicá un código corto numérico (01–99).')
  }

  const ingredientes = input.ingredientes
    .map((item) => {
      const base = {
        ingrediente: item.ingrediente.trim(),
        cantidadBruta: clampNonNegative(Number(item.cantidadBruta)),
        unidad: item.unidad,
        porcentajeMerma: clampNonNegative(Number(item.porcentajeMerma)),
        costoEstimado: clampNonNegative(Number(item.costoEstimado)),
      }
      const id = item.insumoId?.trim()
      return id ? { ...base, insumoId: id } : base
    })
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

  return {
    nombre,
    codigoCorto,
    categoria: input.categoria,
    aceptaGuarnicion:
      input.categoria === 'Principal' ? input.aceptaGuarnicion : false,
    dietas,
    rendimientoPorciones,
    procedimiento,
    ingredientes,
  }
}

function categoriaMenuDesdeReceta(categoria: CategoriaReceta): CategoriaMenu {
  return categoria === 'Guarnición' ? 'guarnicion' : 'principal'
}

async function listarCodigosCortosRecetario(
  excludeId?: string,
): Promise<string[]> {
  const db = getDb()
  const snap = await getDocs(collection(db, COLLECTION_RECETARIO))
  const out: string[] = []
  snap.forEach((d) => {
    if (excludeId && d.id === excludeId) return
    const raw = d.data().codigoCorto
    const c = normalizarCodigoCorto(typeof raw === 'string' ? raw : '')
    if (c) out.push(c)
  })
  return out
}

export async function crearReceta(input: CrearRecetaInput): Promise<void> {
  const usados = await listarCodigosCortosRecetario()
  const codigo =
    normalizarCodigoCorto(input.codigoCorto) ||
    siguienteCodigoCortoDisponible(usados)
  const payload = buildRecetaFirestorePayload(input, codigo)
  const db = getDb()
  const ref = await addDoc(collection(db, COLLECTION_RECETARIO), {
    ...payload,
    fechaCreacion: serverTimestamp(),
    ultimaActualizacion: serverTimestamp(),
  })
  await upsertMenuItemLinkedToReceta(ref.id, {
    nombre: payload.nombre,
    categoria: categoriaMenuDesdeReceta(payload.categoria),
    aceptaGuarnicion: payload.aceptaGuarnicion,
    codigoCorto: payload.codigoCorto,
  })
}

export async function actualizarReceta(
  id: string,
  input: CrearRecetaInput,
): Promise<void> {
  const usados = await listarCodigosCortosRecetario(id)
  const codigo =
    normalizarCodigoCorto(input.codigoCorto) ||
    siguienteCodigoCortoDisponible(usados)
  const payload = buildRecetaFirestorePayload(input, codigo)
  const db = getDb()
  await updateDoc(doc(db, COLLECTION_RECETARIO, id), {
    ...payload,
    ultimaActualizacion: serverTimestamp(),
  })
  await upsertMenuItemLinkedToReceta(id, {
    nombre: payload.nombre,
    categoria: categoriaMenuDesdeReceta(payload.categoria),
    aceptaGuarnicion: payload.aceptaGuarnicion,
    codigoCorto: payload.codigoCorto,
  })
}

export type FilaAuditoriaCostoReceta = {
  recetaId: string
  nombre: string
  costoTeorico: number
  ultimaActualizacionPrecio: Date | null
}

/** Costo teórico por receta según precios actuales de insumos (misma lógica que la vista de analista). */
export function buildFilasAuditoriaCostoRecetas(
  insumos: Insumo[],
  recetas: RecetaTecnica[],
): FilaAuditoriaCostoReceta[] {
  const insumosById = new Map(insumos.map((insumo) => [insumo.id, insumo]))

  return [...recetas]
    .map((receta) => {
      let costoTeorico = 0
      let ultimaActualizacionPrecio: Date | null = null

      for (const ingrediente of receta.ingredientes) {
        const insumo = ingrediente.insumoId
          ? insumosById.get(ingrediente.insumoId)
          : undefined

        if (insumo) {
          costoTeorico += costoFilaRecetaFromInsumo(
            ingrediente.cantidadBruta,
            ingrediente.porcentajeMerma,
            insumo.costoPorUnidadBase,
          )

          const referenciaFecha = insumo.actualizadoEn ?? insumo.creadoEn
          if (
            referenciaFecha &&
            (!ultimaActualizacionPrecio ||
              referenciaFecha.getTime() > ultimaActualizacionPrecio.getTime())
          ) {
            ultimaActualizacionPrecio = referenciaFecha
          }
        } else {
          costoTeorico += ingrediente.costoEstimado
        }
      }

      return {
        recetaId: receta.id,
        nombre: receta.nombre,
        costoTeorico,
        ultimaActualizacionPrecio,
      }
    })
    .sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    )
}

/**
 * Costo teórico de elaborar `cantidadPorciones` según la receta y precios actuales de insumos.
 * Escala el costo del lote estándar (rendimiento declarado) proporcionalmente.
 */
export function costoTeoricoProduccionPorciones(
  insumos: Insumo[],
  receta: RecetaTecnica,
  cantidadPorciones: number,
): number {
  const n = Number(cantidadPorciones)
  if (!Number.isFinite(n) || n <= 0) return 0
  const rend = Math.max(1, Math.floor(receta.rendimientoPorciones) || 1)
  const filas = buildFilasAuditoriaCostoRecetas(insumos, [receta])
  const costoLote = filas[0]?.costoTeorico ?? 0
  return costoLote * (n / rend)
}
