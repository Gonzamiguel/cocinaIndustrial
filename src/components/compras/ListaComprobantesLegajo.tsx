import { Link } from 'react-router-dom'
import { ExternalLink, FileImage, FileText } from 'lucide-react'
import {
  esDocumentoImagen,
  esDocumentoPdf,
  formatearTamanoArchivo,
} from '../../lib/documentos'
import { formatFechaTimestamp } from '../../lib/tesoreriaUi'
import type { DocumentoAdjunto } from '../../types/documentos'

function etiquetaTipo(tipo: DocumentoAdjunto['tipoComprobante']): string {
  switch (tipo) {
    case 'REMITO':
      return 'Remito'
    case 'FACTURA':
      return 'Factura'
    case 'COMPROBANTE_PAGO':
      return 'Comprobante de pago'
    case 'LISTA_PRECIOS':
      return 'Lista de precios'
    default:
      return 'Otro'
  }
}

function badgeClass(tipo: DocumentoAdjunto['tipoComprobante']): string {
  switch (tipo) {
    case 'REMITO':
      return 'bg-blue-100 text-blue-800'
    case 'FACTURA':
      return 'bg-emerald-100 text-emerald-800'
    case 'COMPROBANTE_PAGO':
      return 'bg-violet-100 text-violet-800'
    case 'LISTA_PRECIOS':
      return 'bg-amber-100 text-amber-900'
    default:
      return 'bg-neutral-100 text-neutral-700'
  }
}

function IconoArchivo({ doc }: { doc: DocumentoAdjunto }) {
  if (esDocumentoPdf(doc)) {
    return <FileText className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
  }
  if (esDocumentoImagen(doc)) {
    return <FileImage className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
  }
  return <FileText className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
}

export type ListaComprobantesLegajoProps = {
  documentos: DocumentoAdjunto[]
  /** Mapa ocId → número legible para mostrar en cada fila. */
  numerosOc?: Record<string, string>
  vacio?: string
}

export function ListaComprobantesLegajo({
  documentos,
  numerosOc = {},
  vacio = 'Todavía no hay comprobantes archivados.',
}: ListaComprobantesLegajoProps) {
  if (documentos.length === 0) {
    return <p className="text-sm text-neutral-500">{vacio}</p>
  }

  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {documentos.map((docu) => {
        const ocId = docu.ordenCompraId?.trim()
        const ocNumero = ocId ? numerosOc[ocId] : undefined
        return (
          <li
            key={docu.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:flex-nowrap sm:justify-between"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <IconoArchivo doc={docu} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-neutral-900">{docu.nombreArchivo}</p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass(docu.tipoComprobante)}`}
                  >
                    {etiquetaTipo(docu.tipoComprobante)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatFechaTimestamp(docu.fechaSubida)}
                  {docu.subidoPorNombre ? ` · ${docu.subidoPorNombre}` : ''}
                  {' · '}
                  {formatearTamanoArchivo(docu.tamanoBytes)}
                </p>
                {ocId ? (
                  <Link
                    to={`/control/compras/${ocId}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#CD1818] hover:underline"
                  >
                    OC {ocNumero ?? ocId.slice(0, 8)}
                    <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </div>
            <a
              href={docu.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/5"
            >
              Ver / descargar
            </a>
          </li>
        )
      })}
    </ul>
  )
}
