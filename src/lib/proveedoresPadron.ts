import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import {
  buscarEmpresaPadronPorNombre,
  COL_PADRON_EMPRESAS,
  normalizarCuit,
  normalizarNombreEmpresa,
} from './padronEmpresas'
import { leerSaldoProveedor } from './padronSaldos'
import type {
  CondicionIva,
  PadronEmpresaExtendido,
  RolEmpresaPadron,
  TipoPersonaEmpresa,
} from '../types/compras'

type FirestoreErrorish = { code?: string; message?: string }

export class ProveedorPadronError extends Error {
  readonly code: 'DATOS_INVALIDOS' | 'DUPLICADO' | 'NOT_FOUND'

  constructor(message: string, code: 'DATOS_INVALIDOS' | 'DUPLICADO' | 'NOT_FOUND') {
    super(message)
    this.name = 'ProveedorPadronError'
    this.code = code
  }
}

export interface ProveedorPadron {
  id: string
  nombre: string
  razonSocial: string
  cuit: string
  tipoPersona: TipoPersonaEmpresa
  condicionIva: CondicionIva
  direccionFiscal: string
  localidad: string
  provincia: string
  codigoPostal: string
  email: string
  telefono: string
  plazoPagoDias: number
  monedaDefault: 'ARS' | 'USD'
  proveedorActivo: boolean
  codigoInterno: string
}

export interface ProveedorPadronInput {
  razonSocial: string
  cuit: string
  tipoPersona?: TipoPersonaEmpresa
  condicionIva?: CondicionIva
  direccionFiscal?: string
  localidad?: string
  provincia?: string
  codigoPostal?: string
  email?: string
  telefono?: string
  plazoPagoDias?: number
  monedaDefault?: 'ARS' | 'USD'
  proveedorActivo?: boolean
  codigoInterno?: string
  usuarioUid: string
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
          console.error('[Firestore] proveedores padron', e)
        }),
    )
  })
  return () => {
    cancelAnimationFrame(raf)
    inner?.()
  }
}

function parseRoles(data: Record<string, unknown>): RolEmpresaPadron[] {
  const ext = data as PadronEmpresaExtendido
  if (!Array.isArray(ext.roles)) return []
  return ext.roles.filter(
    (r): r is RolEmpresaPadron =>
      r === 'CONTRATISTA' || r === 'PROVEEDOR' || r === 'CLIENTE',
  )
}

export function mapProveedorPadron(id: string, data: Record<string, unknown>): ProveedorPadron | null {
  const roles = parseRoles(data)
  if (!roles.includes('PROVEEDOR')) return null

  const ext = data as PadronEmpresaExtendido
  const nombre =
    typeof data.nombre === 'string' ? normalizarNombreEmpresa(data.nombre) : ''
  const razonSocial =
    typeof ext.razonSocial === 'string' && ext.razonSocial.trim()
      ? normalizarNombreEmpresa(ext.razonSocial)
      : nombre

  return {
    id,
    nombre,
    razonSocial,
    cuit: typeof data.cuit === 'string' ? normalizarCuit(data.cuit) : '',
    tipoPersona: ext.tipoPersona === 'FISICA' ? 'FISICA' : 'JURIDICA',
    condicionIva: ext.condicionIva ?? 'RESPONSABLE_INSCRIPTO',
    direccionFiscal: ext.contacto?.direccionFiscal?.trim() ?? '',
    localidad: ext.contacto?.localidad?.trim() ?? '',
    provincia: ext.contacto?.provincia?.trim() ?? '',
    codigoPostal: ext.contacto?.codigoPostal?.trim() ?? '',
    email: ext.contacto?.email?.trim() ?? '',
    telefono: ext.contacto?.telefono?.trim() ?? '',
    plazoPagoDias: ext.condicionesComerciales?.plazoPagoDias ?? 30,
    monedaDefault: ext.condicionesComerciales?.monedaDefault === 'USD' ? 'USD' : 'ARS',
    proveedorActivo: ext.proveedorActivo === true,
    codigoInterno: ext.codigoInterno?.trim() ?? '',
  }
}

function validarInput(input: ProveedorPadronInput): {
  nombre: string
  razonSocial: string
  cuit: string
  plazoPagoDias: number
} {
  const razonSocial = normalizarNombreEmpresa(input.razonSocial)
  const cuit = normalizarCuit(input.cuit)
  if (!razonSocial) {
    throw new ProveedorPadronError('Indicá la razón social.', 'DATOS_INVALIDOS')
  }
  if (!cuit) {
    throw new ProveedorPadronError('Indicá el CUIT/CUIL del proveedor.', 'DATOS_INVALIDOS')
  }
  const plazoPagoDias = Math.max(0, Math.round(Number(input.plazoPagoDias ?? 30)))
  return { nombre: razonSocial, razonSocial, cuit, plazoPagoDias }
}

function payloadProveedor(
  input: ProveedorPadronInput,
  rolesExistentes: RolEmpresaPadron[] = [],
  saldoProveedorExistente = 0,
): Record<string, unknown> {
  const { nombre, razonSocial, cuit, plazoPagoDias } = validarInput(input)
  const roles = [...new Set([...rolesExistentes, 'PROVEEDOR' as const])]
  const monedaDefault = input.monedaDefault === 'USD' ? 'USD' : 'ARS'

  return {
    nombre,
    razonSocial,
    cuit,
    roles,
    tipoPersona: input.tipoPersona === 'FISICA' ? 'FISICA' : 'JURIDICA',
    condicionIva: input.condicionIva ?? 'RESPONSABLE_INSCRIPTO',
    proveedorActivo: input.proveedorActivo !== false,
    ...(input.codigoInterno?.trim() ? { codigoInterno: input.codigoInterno.trim() } : {}),
    contacto: {
      ...(input.direccionFiscal?.trim()
        ? { direccionFiscal: input.direccionFiscal.trim() }
        : {}),
      ...(input.localidad?.trim() ? { localidad: input.localidad.trim() } : {}),
      ...(input.provincia?.trim() ? { provincia: input.provincia.trim() } : {}),
      ...(input.codigoPostal?.trim() ? { codigoPostal: input.codigoPostal.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.telefono?.trim() ? { telefono: input.telefono.trim() } : {}),
    },
    condicionesComerciales: {
      plazoPagoDias,
      monedaDefault,
      saldoProveedor: saldoProveedorExistente,
    },
    actualizadoEn: serverTimestamp(),
    actualizadoPorUid: input.usuarioUid,
  }
}

export function subscribeProveedoresPadron(
  onChange: (rows: ProveedorPadron[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(collection(db, COL_PADRON_EMPRESAS))
  return onSnapshotDeferred(
    q,
    (snap) => {
      const rows: ProveedorPadron[] = []
      snap.forEach((d) => {
        const mapped = mapProveedorPadron(d.id, d.data() as Record<string, unknown>)
        if (mapped) rows.push(mapped)
      })
      rows.sort((a, b) =>
        a.razonSocial.localeCompare(b.razonSocial, 'es', { sensitivity: 'base' }),
      )
      onChange(rows)
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        console.error('[Firestore] proveedores: permiso denegado en padron_empresas.')
      }
      onChange([])
    },
  )
}

/** Alta de proveedor activo listo para emitir OC. */
export async function crearProveedorPadron(input: ProveedorPadronInput): Promise<string> {
  const { nombre } = validarInput(input)
  const exist = await buscarEmpresaPadronPorNombre(nombre)
  if (exist) {
    throw new ProveedorPadronError(
      'Ya existe una empresa con esa razón social. Editá el registro existente o usá otro nombre.',
      'DUPLICADO',
    )
  }

  const db = getDb()
  const ref = doc(collection(db, COL_PADRON_EMPRESAS))
  const data = payloadProveedor(input)
  await setDoc(ref, {
    ...data,
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

/** Actualiza datos fiscales/comerciales del proveedor. */
export async function actualizarProveedorPadron(
  id: string,
  input: ProveedorPadronInput,
): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new ProveedorPadronError('Proveedor inválido.', 'NOT_FOUND')

  const { nombre } = validarInput(input)
  const otro = await buscarEmpresaPadronPorNombre(nombre)
  if (otro && otro.id !== docId) {
    throw new ProveedorPadronError('Ya existe otra empresa con esa razón social.', 'DUPLICADO')
  }

  const db = getDb()
  const ref = doc(db, COL_PADRON_EMPRESAS, docId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new ProveedorPadronError('Proveedor no encontrado.', 'NOT_FOUND')
  }
  const raw = snap.data() as Record<string, unknown>
  const roles = parseRoles(raw)
  const saldo = leerSaldoProveedor(raw)
  const data = payloadProveedor(input, roles, saldo)
  await updateDoc(ref, data)
}

/** Activa o desactiva un proveedor sin borrar el registro. */
export async function setProveedorActivo(
  id: string,
  activo: boolean,
  usuarioUid: string,
): Promise<void> {
  const docId = id.trim()
  if (!docId) throw new ProveedorPadronError('Proveedor inválido.', 'NOT_FOUND')
  const db = getDb()
  await updateDoc(doc(db, COL_PADRON_EMPRESAS, docId), {
    proveedorActivo: activo,
    actualizadoEn: serverTimestamp(),
    actualizadoPorUid: usuarioUid,
  })
}

export function mensajeErrorProveedorPadron(err: unknown): string {
  if (err instanceof ProveedorPadronError) return err.message
  if (err instanceof Error) return err.message
  return 'No se pudo guardar el proveedor.'
}
