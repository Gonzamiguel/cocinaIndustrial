import { Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { buildInventarioQrPayload } from '../../lib/qrInventario'

export type EtiquetaIngresoFila = {
  insumoId: string
  nombreInsumo: string
  lote: string
  fechaVencimiento: string
}

export type ModalEtiquetasQRProps = {
  open: boolean
  onClose: () => void
  movimientoId: string
  numeroDocumento: string
  filas: EtiquetaIngresoFila[]
  copiasPorFila: number[]
  onChangeCopias: (index: number, copias: number) => void
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

/**
 * Modal para generar e imprimir etiquetas QR por lote tras un ingreso al depósito.
 * En impresión se oculta solo `#root` vía `body.is-printing` y reglas `@media print`.
 */
export function ModalEtiquetasQR({
  open,
  onClose,
  movimientoId,
  numeroDocumento,
  filas,
  copiasPorFila,
  onChangeCopias,
}: ModalEtiquetasQRProps) {
  if (!open || typeof document === 'undefined') return null

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
    /* Dar tiempo a que el navegador pinte los SVG del QR antes del diálogo de impresión. */
    window.setTimeout(() => {
      window.print()
      window.setTimeout(limpiar, 2000)
    }, 400)
  }

  const etiquetas = filas.flatMap((fila, rowIndex) => {
    const n = Math.max(
      1,
      Math.min(99, Math.floor(Number(copiasPorFila[rowIndex]) || 1)),
    )
    return Array.from({ length: n }, (_, k) => ({
      key: `${fila.insumoId}-${rowIndex}-${k}`,
      fila,
    }))
  })

  const modal = (
    <div
      id="qr-etiquetas-portal-root"
      className="qr-etiquetas-portal-layer fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 print:static print:inset-auto print:block print:h-auto print:min-h-0 print:max-h-none print:w-full print:bg-transparent print:p-0 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-qr-titulo"
        className="qr-etiquetas-dialog flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl print:max-h-none print:w-full print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="modal-qr-titulo"
              className="text-lg font-semibold tracking-tight text-[#CD1818]"
            >
              ¿Desea imprimir las etiquetas QR para este ingreso?
            </h2>
            <p className="mt-1 text-xs text-[#8997A6]">
              Movimiento{' '}
              <span className="font-mono text-[11px] text-[#171717]">{movimientoId}</span>
              {' · '}
              {numeroDocumento}
            </p>
            <p className="mt-2 text-sm text-[#171717]">
              Cada etiqueta incluye un código escaneable con formato{' '}
              <code className="rounded bg-neutral-100 px-1 text-xs">QR-INV|insumoId|lote</code> para
              acelerar egresos en el depósito.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 rounded-xl border border-neutral-200 p-2 text-[#8997A6] transition hover:bg-neutral-50 hover:text-[#171717]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="no-print min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
            Copias por ítem / lote
          </p>
          <ul className="mt-2 space-y-2">
            {filas.map((fila, i) => (
              <li
                key={`${fila.insumoId}-${i}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 bg-neutral-50/80 px-3 py-2"
              >
                <span className="min-w-0 text-sm font-medium text-[#171717]">
                  {fila.nombreInsumo}
                  <span className="mt-0.5 block text-xs font-normal text-[#8997A6]">
                    Lote: {fila.lote.trim() || '(sin número)'} · Vto:{' '}
                    {formatVtoEtiqueta(fila.fechaVencimiento)}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-sm text-[#171717]">
                  <span className="text-xs text-[#8997A6]">Copias</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={copiasPorFila[i] ?? 1}
                    onChange={(e) =>
                      onChangeCopias(i, Number(e.target.value.replace(',', '.')))
                    }
                    className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-[#CD1818]/20"
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="no-print flex shrink-0 flex-wrap justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:bg-neutral-50"
          >
            Omitir
          </button>
          <button
            type="button"
            onClick={handleImprimir}
            className="inline-flex items-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Imprimir etiquetas
          </button>
        </div>

        <div
          className="qr-etiquetas-print-root max-h-[40vh] overflow-auto border-t border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 print:max-h-none print:border-0 print:bg-white"
          aria-hidden
        >
          <p className="no-print mb-3 text-center text-xs text-[#8997A6]">
            Vista previa (también se imprime lo que sigue abajo)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-6">
            {etiquetas.map(({ key, fila }) => {
              const payload = buildInventarioQrPayload(fila.insumoId, fila.lote)
              const loteTxt = fila.lote.trim() || 'Sin lote'
              return (
                <div
                  key={key}
                  className="qr-etiqueta-tile break-inside-avoid rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm print:border print:p-3"
                >
                  <div className="mx-auto inline-block rounded-lg bg-white p-1">
                    <QRCodeSVG
                      value={payload}
                      size={112}
                      level="M"
                      marginSize={2}
                      title=""
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-snug text-[#171717]">
                    {fila.nombreInsumo}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8997A6]">
                    Lote: <span className="font-mono text-[#171717]">{loteTxt}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8997A6]">
                    Venc.:{' '}
                    <span className="text-[#171717]">{formatVtoEtiqueta(fila.fechaVencimiento)}</span>
                  </p>
                  <p className="mt-2 truncate font-mono text-[9px] text-neutral-400">{payload}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
