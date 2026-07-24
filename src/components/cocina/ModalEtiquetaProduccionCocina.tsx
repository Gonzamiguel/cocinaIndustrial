import { Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { buildProduccionQrPayload } from '../../lib/qrProduccion'
import type { ProduccionCocinaRegistro } from '../../lib/movimientosInventario'
import type { MenuItem, MenuStockLote } from '../../lib/menu'
import { sumarDiasFechaInput } from '../../lib/produccionLotes'

export type EtiquetaProduccionData = {
  nombrePlato: string
  /** Nombre de guarnición (vianda); se muestra junto al plato principal. */
  nombreGuarnicion?: string
  recetaNombre: string
  lote: string
  fechaElaboracion?: string
  fechaVencimiento: string
  codigoTrazabilidad: string
  recetaId: string
  menuItemId?: string | null
  cantidadPorciones: number
}

export function tituloEtiquetaProduccion(data: EtiquetaProduccionData): string {
  const plato = data.nombrePlato.trim()
  const guarnicion = data.nombreGuarnicion?.trim() ?? ''
  if (plato && guarnicion) return `${plato} + ${guarnicion}`
  return plato || guarnicion || data.recetaNombre.trim() || '—'
}

export function etiquetaDataDesdeProduccion(
  reg: ProduccionCocinaRegistro,
): EtiquetaProduccionData {
  return {
    nombrePlato: reg.nombreProducto,
    nombreGuarnicion: reg.nombreGuarnicion ?? '',
    recetaNombre: reg.recetaNombre,
    lote: reg.loteProducto,
    fechaElaboracion: reg.fecha
      ? `${reg.fecha.getFullYear()}-${String(reg.fecha.getMonth() + 1).padStart(2, '0')}-${String(reg.fecha.getDate()).padStart(2, '0')}`
      : undefined,
    fechaVencimiento: reg.fechaVencimiento,
    codigoTrazabilidad: reg.codigoTrazabilidad,
    recetaId: reg.recetaId,
    menuItemId: reg.menuItemId,
    cantidadPorciones: reg.cantidadPorciones,
  }
}

export function etiquetaDataDesdeMenuLote(
  menuItem: Pick<MenuItem, 'id' | 'nombre' | 'recetaId' | 'categoria'>,
  lote: MenuStockLote,
): EtiquetaProduccionData {
  const vto = lote.fechaVencimiento.trim()
  const elaboracion =
    /^\d{4}-\d{2}-\d{2}$/.test(vto) ? sumarDiasFechaInput(vto, -60) : undefined

  const esGuarnicion = menuItem.categoria === 'guarnicion'
  const nombrePlato = esGuarnicion
    ? (lote.nombrePrincipalAsociado?.trim() || menuItem.nombre)
    : menuItem.nombre
  const nombreGuarnicion = esGuarnicion
    ? lote.nombrePrincipalAsociado?.trim()
      ? menuItem.nombre
      : ''
    : (lote.nombreGuarnicion?.trim() ?? '')

  return {
    nombrePlato,
    nombreGuarnicion,
    recetaNombre: menuItem.nombre,
    lote: lote.lote,
    fechaElaboracion: elaboracion || undefined,
    fechaVencimiento: vto,
    codigoTrazabilidad: lote.codigoTrazabilidad.trim(),
    recetaId: menuItem.recetaId?.trim() ?? '',
    menuItemId: menuItem.id,
    cantidadPorciones: lote.cantidad,
  }
}

type ModalEtiquetaProduccionCocinaProps = {
  open: boolean
  onClose: () => void
  data: EtiquetaProduccionData | null
  /** Cantidad de etiquetas a imprimir (misma etiqueta; no usar porciones de producción). */
  copias?: number
}

/** Escape mínimo para HTML inyectado en la ventana de impresión. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Imprime en una ventana limpia (sin modal/portal/Tailwind).
 * Evita el bug típico: preview OK pero Chrome/Zebra estiran flex o ignoran @page
 * y el contenido queda pegado a un borde con hueco enorme.
 */
function imprimirEtiquetaZebra(opts: {
  titulo: string
  codigo: string
  qrSvgHtml: string
  copias: number
}) {
  const { titulo, codigo, qrSvgHtml, copias } = opts
  const n = Math.max(1, Math.min(20, copias))

  const etiquetaHtml = `
    <div class="label">
      <table class="frame" cellspacing="0" cellpadding="0">
        <tr>
          <td class="pad">
            <table class="grupo" cellspacing="0" cellpadding="0">
              <tr>
                <td class="texto">
                  <div class="titulo">${escapeHtml(titulo)}</div>
                  <div class="codigo">${escapeHtml(codigo)}</div>
                </td>
                <td class="qr">${qrSvgHtml}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiqueta Zebra</title>
  <style>
    @page { size: 100mm 20mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100mm;
      height: 20mm;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 100mm;
      height: 20mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .frame {
      width: 100mm;
      height: 20mm;
      border-collapse: collapse;
      table-layout: fixed;
    }
    /* Padding simétrico: 2.5mm vertical, 4mm horizontal → grupo centrado en la etiqueta */
    .pad {
      width: 100mm;
      height: 20mm;
      padding: 2.5mm 4mm;
      vertical-align: middle;
      text-align: center;
    }
    .grupo {
      border-collapse: collapse;
      margin: 0 auto;
      height: 15mm;
    }
    .texto {
      vertical-align: middle;
      text-align: left;
      padding-right: 3.5mm;
      max-width: 66mm;
    }
    .titulo {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 7.5pt;
      font-weight: 700;
      line-height: 1.15;
      text-transform: uppercase;
      color: #171717;
      margin: 0 0 2mm 0;
      max-height: 8.5mm;
      overflow: hidden;
    }
    .codigo {
      font-family: Consolas, "Courier New", monospace;
      font-size: 9.5pt;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      color: #171717;
      word-break: break-all;
    }
    .qr {
      vertical-align: middle;
      width: 14.5mm;
      height: 14.5mm;
    }
    .qr svg {
      display: block;
      width: 14.5mm !important;
      height: 14.5mm !important;
    }
  </style>
</head>
<body>
  ${Array.from({ length: n }, () => etiquetaHtml).join('')}
</body>
</html>`

  const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=200')
  if (!win) {
    window.alert(
      'El navegador bloqueó la ventana de impresión. Permití pop-ups para este sitio e intentá de nuevo.',
    )
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()

  const triggerPrint = () => {
    try {
      win.focus()
      win.print()
    } finally {
      // Cerrar después de afterprint; fallback por si el evento no dispara.
      const closeWin = () => {
        try {
          win.close()
        } catch {
          /* ignore */
        }
      }
      win.addEventListener('afterprint', closeWin)
      window.setTimeout(closeWin, 1500)
    }
  }

  // Esperar a que el SVG del QR se pinte antes de print.
  if (win.document.readyState === 'complete') {
    window.setTimeout(triggerPrint, 250)
  } else {
    win.addEventListener('load', () => window.setTimeout(triggerPrint, 250))
  }
}

export function ModalEtiquetaProduccionCocina({
  open,
  onClose,
  data,
  copias = 1,
}: ModalEtiquetaProduccionCocinaProps) {
  if (!open || !data || typeof document === 'undefined') return null

  const titulo = tituloEtiquetaProduccion(data)
  const codigo = data.codigoTrazabilidad.trim() || '—'

  const qrPayload = data.codigoTrazabilidad
    ? buildProduccionQrPayload({
        codigoTrazabilidad: data.codigoTrazabilidad,
        recetaId: data.recetaId,
        recetaNombre: data.recetaNombre,
        lote: data.lote,
        fechaVencimiento: data.fechaVencimiento,
        menuItemId: data.menuItemId ?? undefined,
      })
    : ''

  // Una etiqueta por impresión: la misma se pega en cada vianda del lote.
  const nCopias = Math.max(1, Math.min(20, Math.floor(copias) || 1))

  function handleImprimir() {
    const svgEl = document.getElementById('zebra-etiqueta-qr-svg')
    const qrSvgHtml = svgEl?.outerHTML?.replace(/\s(class|id)="[^"]*"/g, '') ?? ''
    if (!qrSvgHtml && qrPayload) {
      window.alert('No se pudo preparar el QR para imprimir. Cerrá y volvé a abrir la etiqueta.')
      return
    }
    imprimirEtiquetaZebra({
      titulo,
      codigo,
      qrSvgHtml,
      copias: nCopias,
    })
  }

  const modal = (
    <div
      id="qr-etiquetas-produccion-portal"
      className="qr-etiquetas-portal-layer fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-etiqueta-produccion-titulo"
        className="qr-etiquetas-dialog flex max-h-[min(92vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3">
          <div>
            <h2
              id="modal-etiqueta-produccion-titulo"
              className="text-base font-semibold text-[#171717]"
            >
              Etiqueta Zebra ZD321
            </h2>
            <p className="text-xs text-[#8997A6]">
              100 mm × 20 mm · {nCopias} copia{nCopias === 1 ? '' : 's'}. En el
              diálogo de impresión: papel 100×20 mm, márgenes ninguno, escala{' '}
              <strong>100%</strong> (no “ajustar a la página”).
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center gap-3">
            {/* Preview: misma geometría que la ventana de impresión (tabla + padding simétrico). */}
            <article
              id="zebra-etiqueta-preview"
              className="zebra-etiqueta-zd321 box-border h-[20mm] w-[100mm] overflow-hidden border border-dashed border-neutral-300 bg-white"
            >
              <table className="h-full w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="h-full px-[4mm] py-[2.5mm] text-center align-middle">
                      <table className="mx-auto h-[15mm] border-collapse">
                        <tbody>
                          <tr>
                            <td className="max-w-[66mm] pr-[3.5mm] text-left align-middle">
                              <p className="mb-[2mm] line-clamp-2 text-[7.5px] font-bold uppercase leading-[1.15] tracking-tight text-[#171717]">
                                {titulo}
                              </p>
                              <p className="break-all font-mono text-[10px] font-bold leading-none tracking-wide text-[#171717]">
                                {codigo}
                              </p>
                            </td>
                            {qrPayload ? (
                              <td className="align-middle">
                                <QRCodeSVG
                                  id="zebra-etiqueta-qr-svg"
                                  value={qrPayload}
                                  size={80}
                                  level="M"
                                  includeMargin={false}
                                  className="block h-[14.5mm] w-[14.5mm]"
                                />
                              </td>
                            ) : null}
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </article>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            onClick={handleImprimir}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Printer className="h-4 w-4" />
            Imprimir
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
