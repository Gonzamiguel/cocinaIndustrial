import { Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { buildProduccionQrPayload } from '../../lib/qrProduccion'
import type { ProduccionCocinaRegistro } from '../../lib/movimientosInventario'

export type EtiquetaProduccionData = {
  nombrePlato: string
  recetaNombre: string
  lote: string
  fechaVencimiento: string
  codigoTrazabilidad: string
  recetaId: string
  menuItemId?: string | null
  cantidadPorciones: number
}

export function etiquetaDataDesdeProduccion(
  reg: ProduccionCocinaRegistro,
): EtiquetaProduccionData {
  return {
    nombrePlato: reg.nombreProducto,
    recetaNombre: reg.recetaNombre,
    lote: reg.loteProducto,
    fechaVencimiento: reg.fechaVencimiento,
    codigoTrazabilidad: reg.codigoTrazabilidad,
    recetaId: reg.recetaId,
    menuItemId: reg.menuItemId,
    cantidadPorciones: reg.cantidadPorciones,
  }
}

function formatVtoEtiqueta(s: string): string {
  if (!s?.trim()) return '—'
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-AR')
  }
  return t
}

type ModalEtiquetaProduccionCocinaProps = {
  open: boolean
  onClose: () => void
  data: EtiquetaProduccionData | null
  copias?: number
}

export function ModalEtiquetaProduccionCocina({
  open,
  onClose,
  data,
  copias = 1,
}: ModalEtiquetaProduccionCocinaProps) {
  if (!open || !data || typeof document === 'undefined') return null

  const qrPayload = buildProduccionQrPayload({
    codigoTrazabilidad: data.codigoTrazabilidad,
    recetaId: data.recetaId,
    recetaNombre: data.recetaNombre,
    lote: data.lote,
    fechaVencimiento: data.fechaVencimiento,
    menuItemId: data.menuItemId ?? undefined,
  })

  const nCopias = Math.max(1, Math.min(99, Math.floor(copias) || 1))

  function handleImprimir() {
    document.body.classList.add('is-printing')
    let cleaned = false
    const limpiar = () => {
      if (cleaned) return
      cleaned = true
      document.body.classList.remove('is-printing')
      window.removeEventListener('afterprint', limpiar)
    }
    window.addEventListener('afterprint', limpiar)
    window.setTimeout(() => {
      window.print()
      window.setTimeout(limpiar, 2000)
    }, 400)
  }

  const modal = (
    <div
      id="qr-etiquetas-produccion-portal"
      className="qr-etiquetas-portal-layer fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 print:static print:inset-auto print:block print:h-auto print:min-h-0 print:max-h-none print:w-full print:bg-transparent print:p-0 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-etiqueta-produccion-titulo"
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3 print:hidden">
          <div>
            <h2
              id="modal-etiqueta-produccion-titulo"
              className="text-base font-semibold text-[#171717]"
            >
              Etiqueta de producción
            </h2>
            <p className="text-xs text-[#8997A6]">
              Formato térmico · {nCopias} copia{nCopias === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible print:p-0">
          <div className="qr-etiquetas-grid flex flex-wrap justify-center gap-3 print:gap-0">
            {Array.from({ length: nCopias }, (_, i) => (
              <article
                key={`etq-${i}`}
                className="qr-etiqueta-item flex w-[58mm] min-w-[58mm] max-w-[58mm] flex-col items-center border border-dashed border-neutral-300 bg-white p-2 text-center print:m-0 print:break-inside-avoid print:border-neutral-400 print:p-[2mm]"
              >
                <p className="text-[10px] font-bold uppercase leading-tight text-[#171717]">
                  {data.nombrePlato}
                </p>
                <p className="mt-0.5 text-[8px] leading-tight text-neutral-600">
                  Vto: {formatVtoEtiqueta(data.fechaVencimiento)}
                </p>
                <p className="text-[8px] font-semibold leading-tight text-neutral-800">
                  Lote: {data.lote}
                </p>
                <div className="my-1.5 flex justify-center print:my-1">
                  <QRCodeSVG value={qrPayload} size={88} level="M" includeMargin={false} />
                </div>
                <p className="max-w-full truncate text-[7px] font-mono text-neutral-500">
                  {data.codigoTrazabilidad}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-neutral-100 p-4 print:hidden">
          <button
            type="button"
            onClick={handleImprimir}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
