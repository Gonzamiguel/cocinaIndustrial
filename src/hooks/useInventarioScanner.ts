import { useCallback, useEffect, useRef } from 'react'
import {
  pareceCodigoBarrasProducto,
} from '../lib/codigoBarrasInsumo'
import { pareceCodigoTrazabilidadVianda } from '../lib/viandaEscaneo'
import { parseInventarioQrPayload } from '../lib/qrInventario'
import {
  parseProduccionQrPayload,
  type PayloadQrProduccion,
} from '../lib/qrProduccion'

const INTER_KEY_MAX_MS = 100
const TOTAL_SCAN_MAX_MS = 2500

export type EscaneoInventario =
  | { tipo: 'qr_insumo'; insumoId: string; lote: string }
  | { tipo: 'codigo_barras_insumo'; codigo: string }
  | { tipo: 'vianda_qr'; payload: PayloadQrProduccion }
  | { tipo: 'vianda_codigo'; codigoTrazabilidad: string }

export type UseInventarioScannerOptions = {
  enabled: boolean
  /** Si false, ignora códigos de vianda (solo insumos depósito). Default true. */
  aceptarViandas?: boolean
  /** Si false, ignora EAN/QR de insumos. Default true. */
  aceptarInsumos?: boolean
  onScan: (result: EscaneoInventario) => void
}

function debeCapturarBuffer(buf: string): boolean {
  const u = buf.toUpperCase()
  return (
    buf.startsWith('QR-INV') ||
    buf.startsWith('QR-PROD') ||
    u.startsWith('PT-') ||
    u.startsWith('V-') ||
    u.startsWith('G-') ||
    /^\d+$/.test(buf)
  )
}

/**
 * Escucha pistola USB (teclado + Enter): insumos EAN, QR depósito, QR/Code viandas.
 */
export function useInventarioScanner({
  enabled,
  aceptarViandas = true,
  aceptarInsumos = true,
  onScan,
}: UseInventarioScannerOptions): void {
  const bufferRef = useRef('')
  const firstKeyTsRef = useRef(0)
  const lastKeyTsRef = useRef(0)
  const onScanRef = useRef(onScan)

  onScanRef.current = onScan

  const listener = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const target = e.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      const t = Date.now()
      const key = e.key

      if (key === 'Enter') {
        const buf = bufferRef.current.trim()
        const first = firstKeyTsRef.current
        bufferRef.current = ''
        firstKeyTsRef.current = 0
        lastKeyTsRef.current = 0

        if (!buf.length || first <= 0 || t - first > TOTAL_SCAN_MAX_MS) return

        if (aceptarInsumos && buf.startsWith('QR-INV|')) {
          const parsed = parseInventarioQrPayload(buf)
          if (parsed) {
            e.preventDefault()
            e.stopPropagation()
            onScanRef.current({
              tipo: 'qr_insumo',
              insumoId: parsed.insumoId,
              lote: parsed.lote,
            })
          }
          return
        }

        if (aceptarViandas && buf.startsWith('QR-PROD|')) {
          const parsed = parseProduccionQrPayload(buf)
          if (parsed) {
            e.preventDefault()
            e.stopPropagation()
            onScanRef.current({ tipo: 'vianda_qr', payload: parsed })
          }
          return
        }

        if (aceptarViandas && pareceCodigoTrazabilidadVianda(buf)) {
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current({ tipo: 'vianda_codigo', codigoTrazabilidad: buf.trim() })
          return
        }

        if (aceptarInsumos && pareceCodigoBarrasProducto(buf)) {
          e.preventDefault()
          e.stopPropagation()
          onScanRef.current({ tipo: 'codigo_barras_insumo', codigo: buf.trim() })
        }
        return
      }

      if (key.length !== 1) return

      if (lastKeyTsRef.current > 0 && t - lastKeyTsRef.current > INTER_KEY_MAX_MS) {
        bufferRef.current = ''
        firstKeyTsRef.current = 0
      }

      if (!bufferRef.current) {
        firstKeyTsRef.current = t
      }

      bufferRef.current += key
      lastKeyTsRef.current = t

      if (debeCapturarBuffer(bufferRef.current)) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    [enabled, aceptarViandas, aceptarInsumos],
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [enabled, listener])
}
