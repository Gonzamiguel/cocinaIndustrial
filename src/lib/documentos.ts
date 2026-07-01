import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from 'firebase/storage'
import { getDb, getStorageApp } from './firebase'
import type {
  DocumentoAdjunto,
  DocumentoAdjuntoDoc,
  EntidadTipoDocumento,
  TipoComprobanteDocumento,
} from '../types/documentos'

export const COL_DOCUMENTOS_ADJUNTOS = 'documentos_adjuntos'
export const STORAGE_PREFIX_FINANZAS = 'documentos_finanzas'
export const MAX_TAMANO_DOCUMENTO_BYTES = 10 * 1024 * 1024

const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ENTIDADES_VALIDAS = new Set<EntidadTipoDocumento>([
  'ORDEN_COMPRA',
  'FACTURA_PROVEEDOR',
  'ORDEN_PAGO',
  'PROVEEDOR',
])

const COMPROBANTES_VALIDOS = new Set<TipoComprobanteDocumento>([
  'FACTURA',
  'REMITO',
  'COMPROBANTE_PAGO',
  'LISTA_PRECIOS',
  'OTRO',
])

const MIME_LISTA_PRECIOS = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export class DocumentoAdjuntoError extends Error {
  readonly code:
    | 'ARCHIVO_INVALIDO'
    | 'ARCHIVO_MUY_PESADO'
    | 'SUBIDA_FALLIDA'
    | 'NOT_FOUND'
    | 'DATOS_INVALIDOS'
    | 'CONEXION'

  constructor(
    message: string,
    code:
      | 'ARCHIVO_INVALIDO'
      | 'ARCHIVO_MUY_PESADO'
      | 'SUBIDA_FALLIDA'
      | 'NOT_FOUND'
      | 'DATOS_INVALIDOS'
      | 'CONEXION',
  ) {
    super(message)
    this.name = 'DocumentoAdjuntoError'
    this.code = code
  }
}

export interface UsuarioDocumentoInput {
  uid: string
  nombre: string
}

export interface SubirDocumentoAdjuntoInput {
  file: File
  entidadId: string
  entidadTipo: EntidadTipoDocumento
  tipoComprobante: TipoComprobanteDocumento
  usuario: UsuarioDocumentoInput
  ordenCompraId?: string
  proveedorId?: string
  onProgress?: (porcentaje: number) => void
}

function sanitizarNombreArchivo(name: string): string {
  const base = name.trim() || 'archivo'
  return base
    .replace(/[/\\?%*:|"<>#]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

function inferirMimePermitido(file: File): string {
  const mime = (file.type || '').toLowerCase()
  if (MIME_PERMITIDOS.has(mime)) return mime
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  return mime
}

function validarArchivo(file: File, tipoComprobante?: TipoComprobanteDocumento): string {
  if (!file || file.size <= 0) {
    throw new DocumentoAdjuntoError('El archivo está vacío.', 'ARCHIVO_INVALIDO')
  }
  if (file.size > MAX_TAMANO_DOCUMENTO_BYTES) {
    throw new DocumentoAdjuntoError(
      `El archivo supera el límite de ${Math.round(MAX_TAMANO_DOCUMENTO_BYTES / (1024 * 1024))} MB.`,
      'ARCHIVO_MUY_PESADO',
    )
  }
  const mime = inferirMimePermitido(file)
  const permitidos =
    tipoComprobante === 'LISTA_PRECIOS' ? MIME_LISTA_PRECIOS : MIME_PERMITIDOS
  if (!permitidos.has(mime)) {
    const msg =
      tipoComprobante === 'LISTA_PRECIOS'
        ? 'Formato no permitido. Usá PDF, Excel (XLS/XLSX) o imagen.'
        : 'Formato no permitido. Usá PDF o imagen (JPG, PNG, WEBP, GIF).'
    throw new DocumentoAdjuntoError(msg, 'ARCHIVO_INVALIDO')
  }
  return mime
}

function mapErrorSubida(err: unknown): DocumentoAdjuntoError {
  if (err instanceof DocumentoAdjuntoError) return err
  const code = (err as { code?: string })?.code
  if (
    code === 'storage/unauthorized' ||
    code === 'storage/unauthenticated' ||
    code === 'permission-denied'
  ) {
    return new DocumentoAdjuntoError(
      'No tenés permiso para subir este archivo.',
      'SUBIDA_FALLIDA',
    )
  }
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
    return new DocumentoAdjuntoError(
      'La subida se interrumpió. Verificá tu conexión e intentá de nuevo.',
      'CONEXION',
    )
  }
  if (err instanceof Error) {
    if (/network|offline|failed to fetch/i.test(err.message)) {
      return new DocumentoAdjuntoError(
        'Sin conexión o red inestable. Intentá nuevamente.',
        'CONEXION',
      )
    }
    return new DocumentoAdjuntoError(err.message, 'SUBIDA_FALLIDA')
  }
  return new DocumentoAdjuntoError('No se pudo subir el archivo.', 'SUBIDA_FALLIDA')
}

function subirArchivoConProgreso(
  storagePath: string,
  file: File,
  mimeType: string,
  onProgress?: (porcentaje: number) => void,
): Promise<string> {
  const storage = getStorageApp()
  const storageRef = ref(storage, storagePath)

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: mimeType })

    task.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress || snapshot.totalBytes <= 0) return
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        onProgress(Math.min(100, pct))
      },
      (error) => reject(mapErrorSubida(error)),
      () => {
        void getDownloadURL(task.snapshot.ref)
          .then(resolve)
          .catch((err) => reject(mapErrorSubida(err)))
      },
    )
  })
}

/**
 * Sube un comprobante a Storage y registra el metadato en `documentos_adjuntos`.
 */
export async function subirDocumentoAdjunto(
  input: SubirDocumentoAdjuntoInput,
): Promise<DocumentoAdjunto> {
  const entidadId = input.entidadId.trim()
  const entidadTipo = input.entidadTipo
  const tipoComprobante = input.tipoComprobante
  const usuarioUid = input.usuario.uid.trim()
  const usuarioNombre = input.usuario.nombre.trim()

  if (!entidadId) {
    throw new DocumentoAdjuntoError('Entidad inválida.', 'DATOS_INVALIDOS')
  }
  if (!ENTIDADES_VALIDAS.has(entidadTipo)) {
    throw new DocumentoAdjuntoError('Tipo de entidad inválido.', 'DATOS_INVALIDOS')
  }
  if (!COMPROBANTES_VALIDOS.has(tipoComprobante)) {
    throw new DocumentoAdjuntoError('Tipo de comprobante inválido.', 'DATOS_INVALIDOS')
  }
  if (!usuarioUid) {
    throw new DocumentoAdjuntoError('Usuario no autenticado.', 'DATOS_INVALIDOS')
  }

  const mimeType = validarArchivo(input.file, tipoComprobante)
  const nombreArchivo = input.file.name.trim() || 'documento'
  const timestamp = Date.now()
  const storagePath = `${STORAGE_PREFIX_FINANZAS}/${entidadId}/${timestamp}_${sanitizarNombreArchivo(nombreArchivo)}`

  let url: string
  try {
    url = await subirArchivoConProgreso(
      storagePath,
      input.file,
      mimeType,
      input.onProgress,
    )
  } catch (err) {
    throw mapErrorSubida(err)
  }

  const db = getDb()
  const docRef = doc(collection(db, COL_DOCUMENTOS_ADJUNTOS))

  const payload: Record<string, unknown> = {
    entidadId,
    entidadTipo,
    tipoComprobante,
    url,
    storagePath,
    nombreArchivo,
    mimeType,
    tamanoBytes: input.file.size,
    subidoPorUid: usuarioUid,
    fechaSubida: serverTimestamp(),
  }
  if (usuarioNombre) payload.subidoPorNombre = usuarioNombre
  const ordenCompraId = input.ordenCompraId?.trim()
  const proveedorId = input.proveedorId?.trim()
  if (ordenCompraId) payload.ordenCompraId = ordenCompraId
  if (proveedorId) payload.proveedorId = proveedorId

  try {
    await setDoc(docRef, payload)
  } catch (err) {
    try {
      await deleteObject(ref(getStorageApp(), storagePath))
    } catch {
      // best-effort rollback
    }
    throw mapErrorSubida(err)
  }

  return {
    id: docRef.id,
    entidadId,
    entidadTipo,
    tipoComprobante,
    url,
    storagePath,
    nombreArchivo,
    mimeType,
    tamanoBytes: input.file.size,
    subidoPorUid: usuarioUid,
    ...(usuarioNombre ? { subidoPorNombre: usuarioNombre } : {}),
    ...(ordenCompraId ? { ordenCompraId } : {}),
    ...(proveedorId ? { proveedorId } : {}),
    fechaSubida: Timestamp.now(),
  }
}

async function borrarArchivoStorage(storageUrl: string, storagePath?: string): Promise<void> {
  const storage = getStorageApp()
  try {
    if (storagePath?.trim()) {
      await deleteObject(ref(storage, storagePath.trim()))
      return
    }
    await deleteObject(storageRefDesdeUrl(storage, storageUrl))
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'storage/object-not-found') return
    throw mapErrorSubida(err)
  }
}

function storageRefDesdeUrl(storage: FirebaseStorage, url: string) {
  try {
    const u = new URL(url.trim())
    const segmento = u.pathname.split('/o/')[1]
    if (!segmento) {
      throw new DocumentoAdjuntoError('URL de almacenamiento inválida.', 'NOT_FOUND')
    }
    const path = decodeURIComponent(segmento.split('?')[0] ?? segmento)
    return ref(storage, path)
  } catch (err) {
    if (err instanceof DocumentoAdjuntoError) throw err
    throw new DocumentoAdjuntoError('URL de almacenamiento inválida.', 'NOT_FOUND')
  }
}

/** Elimina el archivo en Storage y el registro en Firestore. */
export async function eliminarDocumentoAdjunto(
  documentoId: string,
  storageUrl: string,
  storagePath?: string,
): Promise<void> {
  const id = documentoId.trim()
  if (!id) {
    throw new DocumentoAdjuntoError('Documento inválido.', 'DATOS_INVALIDOS')
  }
  if (!storageUrl.trim()) {
    throw new DocumentoAdjuntoError('URL de almacenamiento inválida.', 'DATOS_INVALIDOS')
  }

  await borrarArchivoStorage(storageUrl, storagePath)

  try {
    await deleteDoc(doc(getDb(), COL_DOCUMENTOS_ADJUNTOS, id))
  } catch (err) {
    throw mapErrorSubida(err)
  }
}

export function mensajeErrorDocumento(err: unknown): string {
  if (err instanceof DocumentoAdjuntoError) return err.message
  if (err instanceof Error) return err.message
  return 'Ocurrió un error con el documento.'
}

export function formatearTamanoArchivo(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function esDocumentoImagen(doc: DocumentoAdjunto): boolean {
  const mime = doc.mimeType?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp)$/i.test(doc.nombreArchivo)
}

export function esDocumentoPdf(doc: DocumentoAdjunto): boolean {
  const mime = doc.mimeType?.toLowerCase() ?? ''
  if (mime === 'application/pdf') return true
  return doc.nombreArchivo.toLowerCase().endsWith('.pdf')
}

export function etiquetaTipoComprobante(tipo: TipoComprobanteDocumento): string {
  switch (tipo) {
    case 'FACTURA':
      return 'Factura'
    case 'REMITO':
      return 'Remito'
    case 'COMPROBANTE_PAGO':
      return 'Comprobante de pago'
    case 'LISTA_PRECIOS':
      return 'Lista de precios'
    default:
      return 'Otro'
  }
}

/** Suscripción a adjuntos filtrados por tipo de entidad (ej. todas las OP). */
export function subscribeDocumentosPorEntidadTipo(
  entidadTipo: EntidadTipoDocumento,
  onChange: (rows: DocumentoAdjunto[]) => void,
): Unsubscribe {
  const db = getDb()
  const q = query(
    collection(db, COL_DOCUMENTOS_ADJUNTOS),
    where('entidadTipo', '==', entidadTipo),
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows: DocumentoAdjunto[] = []
      snap.forEach((d) => {
        const data = d.data()
        rows.push({ ...(data as DocumentoAdjuntoDoc), id: d.id })
      })
      rows.sort(
        (a, b) =>
          (b.fechaSubida instanceof Timestamp ? b.fechaSubida.toMillis() : 0) -
          (a.fechaSubida instanceof Timestamp ? a.fechaSubida.toMillis() : 0),
      )
      onChange(rows)
    },
    (err) => {
      console.error(`[Firestore] documentos_adjuntos (${entidadTipo}):`, err.message)
      onChange([])
    },
  )
}
