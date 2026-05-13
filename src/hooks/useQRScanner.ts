import { useCallback, useEffect, useRef } from 'react'
import { parseInventarioQrPayload } from '../lib/qrInventario'

const INTER_KEY_MAX_MS = 100
/** Ventana máxima desde el primer carácter hasta Enter (lector USB envía ráfagas). */
const TOTAL_SCAN_MAX_MS = 2500

export type UseQRScannerOptions = {
  enabled: boolean
  onScan: (insumoId: string, lote: string) => void
}

/**
 * Escucha teclas a nivel documento (captura). Los lectores USB suelen enviar
 * caracteres en ráfaga (intervalos típicamente &lt; {@link INTER_KEY_MAX_MS} ms)
 * y terminan con Enter. Si el buffer comienza con `QR-INV|`, se parsea y se llama `onScan`.
 */
export function useQRScanner({ enabled, onScan }: UseQRScannerOptions): void {
  const bufferRef = useRef('')
  const firstKeyTsRef = useRef(0)
  const lastKeyTsRef = useRef(0)
  const onScanRef = useRef(onScan)

  onScanRef.current = onScan

  const listener = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const t = Date.now()
      const key = e.key

      if (key === 'Enter') {
        const buf = bufferRef.current.trim()
        const first = firstKeyTsRef.current
        bufferRef.current = ''
        firstKeyTsRef.current = 0
        lastKeyTsRef.current = 0

        if (
          buf.length > 0 &&
          first > 0 &&
          t - first <= TOTAL_SCAN_MAX_MS &&
          buf.startsWith('QR-INV|')
        ) {
          const parsed = parseInventarioQrPayload(buf)
          if (parsed) {
            e.preventDefault()
            e.stopPropagation()
            onScanRef.current(parsed.insumoId, parsed.lote)
          }
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

      if (bufferRef.current.startsWith('QR-INV')) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    [enabled],
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [enabled, listener])
}
