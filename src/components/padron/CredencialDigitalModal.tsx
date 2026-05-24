import { Loader2, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import { useEffect, useRef, useState } from 'react'
import type { PadronPersona } from '../../types/hoteleria'
import { useToast } from '../../context/ToastContext'
import { CredencialDigital } from './CredencialDigital'

export type CredencialDigitalModalProps = {
  open: boolean
  persona: PadronPersona | null
  onClose: () => void
}

function sanitizarNombreArchivo(valor: string): string {
  const limpio = valor
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return limpio || 'Sin_Apellido'
}

export function CredencialDigitalModal({ open, persona, onClose }: CredencialDigitalModalProps) {
  const { showToast } = useToast()
  const credencialRef = useRef<HTMLDivElement>(null)
  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !descargando) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, descargando, onClose])

  async function handleDescargarCredencial() {
    if (!persona || !credencialRef.current) return
    setDescargando(true)
    try {
      const dataUrl = await toPng(credencialRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      })
      const enlace = document.createElement('a')
      enlace.href = dataUrl
      enlace.download = `Credencial_${persona.dni.trim()}_${sanitizarNombreArchivo(persona.apellido)}.png`
      enlace.click()
      showToast('Credencial descargada.', 'success')
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'No se pudo generar la imagen de la credencial.',
        'error',
      )
    } finally {
      setDescargando(false)
    }
  }

  if (!open || !persona) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[1px] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !descargando) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credencial-digital-title"
        className="flex w-full max-w-md flex-col items-center rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex w-full items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="credencial-digital-title"
              className="text-lg font-semibold tracking-tight text-neutral-900"
            >
              Credencial digital
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {persona.apellido}, {persona.nombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={descargando}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-200/80 hover:text-neutral-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <CredencialDigital ref={credencialRef} persona={persona} />

        <button
          type="button"
          onClick={() => void handleDescargarCredencial()}
          disabled={descargando}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {descargando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Generando imagen…
            </>
          ) : (
            <>⬇️ Descargar Imagen</>
          )}
        </button>
      </div>
    </div>
  )
}
