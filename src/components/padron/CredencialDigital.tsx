import { forwardRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import type { PadronPersona } from '../../types/hoteleria'

export type CredencialDigitalProps = {
  persona: Pick<PadronPersona, 'dni' | 'nombre' | 'apellido' | 'empresa'>
}

export const CredencialDigital = forwardRef<HTMLDivElement, CredencialDigitalProps>(
  function CredencialDigital({ persona }, ref) {
    const dni = String(persona.dni ?? '').trim()
    const nombre = persona.nombre.trim()
    const apellido = persona.apellido.trim()
    const empresa = persona.empresa.trim() || 'Sin empresa asignada'

    return (
      <div
        ref={ref}
        className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <header className="shrink-0 bg-[#CD1818] px-4 py-3.5 text-center">
          <p className="text-[10px] font-semibold uppercase leading-snug tracking-widest text-white">
            Mina Casposo - Pase Logístico
          </p>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-5 text-center">
          <div className="space-y-2">
            <p className="text-2xl font-black uppercase leading-tight tracking-tight text-gray-800">
              {nombre}
            </p>
            <p className="text-2xl font-black uppercase leading-tight tracking-tight text-gray-800">
              {apellido}
            </p>
          </div>

          <div className="mt-4 space-y-1">
            <p className="font-mono text-sm font-semibold uppercase tracking-wide text-gray-600">
              DNI {dni}
            </p>
            <p className="text-xs font-medium uppercase leading-snug text-gray-600">{empresa}</p>
          </div>

          <div className="mt-6 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm">
            <QRCodeCanvas value={dni} size={180} level="M" includeMargin={false} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-neutral-100 px-4 py-3 text-center">
          <p className="text-[9px] font-medium uppercase leading-relaxed tracking-wide text-neutral-400">
            Credencial personal · Uso exclusivo del titular · Mina Casposo
          </p>
        </footer>
      </div>
    )
  },
)
