import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode'
import { Clock, LogOut, Search, UserCheck, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { PadronPersona } from '../../types/hoteleria'
import type { RegistroComedor } from '../../types/comedor'
import {
  buscarPersonaPadronPorDni,
  encolarRegistroComedor,
  subscribeContadorComedorHoy,
  subscribeRegistrosComedorHoyEnDispositivo,
} from '../../lib/comedor'
import { reproducirBeepExito } from '../../lib/beepExito'
import { extraerDniDesdeQr } from '../../lib/qrComensal'
import {
  etiquetaServicioComedor,
  puedeRegistrarComedor,
  resolverServicioParaRegistro,
} from '../../lib/servicioComedor'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useServicioComedor } from '../../hooks/useServicioComedor'

const QR_READER_ID = 'terminal-comedor-qr-reader'
/** Evita doble lectura del mismo DNI en ráfaga; no bloquea el siguiente comensal distinto. */
const DNI_DUPLICADO_COOLDOWN_MS = 1200

type ModoVista = 'qr' | 'manual' | 'historial'

function formatHora(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function horaDeRegistro(
  r: RegistroComedor,
  horasLocales: ReadonlyMap<string, Date>,
): string {
  const d = r.fechaHora ?? horasLocales.get(r.id)
  return d ? formatHora(d) : '—'
}

/** Evita el error "Cannot stop, scanner is not running" al desmontar antes de `start()`. */
async function detenerScannerQr(
  inst: Html5QrcodeType | null,
  running: { current: boolean },
): Promise<void> {
  if (!inst) return
  if (running.current) {
    try {
      await inst.stop()
    } catch {
      /* ya detenido o start() aún no terminó */
    }
    running.current = false
  }
  try {
    inst.clear()
  } catch {
    /* DOM ya limpiado */
  }
}

export function TerminalComensalesPage() {
  const { user, logout } = useAuth()
  const { showToast } = useToast()
  const servicioHorario = useServicioComedor()
  const online = useOnlineStatus()
  const [modoNochero, setModoNochero] = useState(false)

  const servicioMostrado = modoNochero ? 'CENA_NOCHERO' : servicioHorario
  const puedeRegistrar = puedeRegistrarComedor(servicioHorario, modoNochero)

  const [modo, setModo] = useState<ModoVista>('qr')
  const [dniInput, setDniInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [persona, setPersona] = useState<PadronPersona | null>(null)
  const [contadorHoy, setContadorHoy] = useState(0)
  const [historialHoy, setHistorialHoy] = useState<RegistroComedor[]>([])
  const [flashOk, setFlashOk] = useState(false)
  const [ultimoNombre, setUltimoNombre] = useState<string | null>(null)

  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const scannerRunningRef = useRef(false)
  const procesandoQrRef = useRef(false)
  const ultimoDniQrRef = useRef<string | null>(null)
  const ultimoQrTsRef = useRef(0)
  /** Hora local al encolar (mientras `fechaHora` del servidor aún es null offline). */
  const horasLocalesRef = useRef<Map<string, Date>>(new Map())

  const horasLocales = horasLocalesRef.current

  useEffect(() => {
    const unsub = subscribeContadorComedorHoy(setContadorHoy)
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setHistorialHoy([])
      return
    }
    const unsub = subscribeRegistrosComedorHoyEnDispositivo(user.uid, setHistorialHoy)
    return () => unsub()
  }, [user?.uid])

  const confirmarExitoUi = useCallback(
    (p: PadronPersona, opts?: { silencioso?: boolean }) => {
      reproducirBeepExito()
      setFlashOk(true)
      window.setTimeout(() => setFlashOk(false), 400)
      const lineaExito = modoNochero
        ? `${p.apellido}, ${p.nombre} - CENA NOCHERO + REFRIG. Registrado`
        : `${p.apellido}, ${p.nombre}`
      setUltimoNombre(lineaExito)
      if (!opts?.silencioso) {
        showToast(
          modoNochero ? lineaExito : `Registrado: ${p.apellido}, ${p.nombre}`,
          'success',
        )
      }
    },
    [modoNochero, showToast],
  )

  /** Registro optimista: feedback inmediato; Firestore en segundo plano. */
  const registrarPersona = useCallback(
    (p: PadronPersona, opts?: { silencioso?: boolean }): boolean => {
      if (!user?.uid) {
        showToast('Sesión no válida. Volvé a iniciar sesión.', 'error')
        return false
      }
      if (!puedeRegistrarComedor(servicioHorario, modoNochero)) {
        showToast('Fuera de horario de servicio. No se puede registrar.', 'error')
        return false
      }
      const servicio = resolverServicioParaRegistro(modoNochero)
      const { id, promise } = encolarRegistroComedor({
        persona: p,
        servicio,
        usuarioRegistro: user.uid,
      })
      horasLocalesRef.current.set(id, new Date())
      confirmarExitoUi(p, opts)
      void promise.catch((e) => {
        horasLocalesRef.current.delete(id)
        const msg = e instanceof Error ? e.message : 'No se pudo guardar el registro. Reintentá.'
        showToast(msg, 'error')
      })
      return true
    },
    [user?.uid, servicioHorario, modoNochero, showToast, confirmarExitoUi],
  )

  const limpiarManual = useCallback(() => {
    setPersona(null)
    setDniInput('')
  }, [])

  const procesarDniEscaneado = useCallback(
    async (raw: string) => {
      if (procesandoQrRef.current) return
      const dni = extraerDniDesdeQr(raw)
      if (!dni) return

      const ahora = Date.now()
      if (
        ultimoDniQrRef.current === dni &&
        ahora - ultimoQrTsRef.current < DNI_DUPLICADO_COOLDOWN_MS
      ) {
        return
      }

      procesandoQrRef.current = true
      ultimoDniQrRef.current = dni
      ultimoQrTsRef.current = ahora

      try {
        const p = await buscarPersonaPadronPorDni(dni)
        if (!p) {
          showToast(`DNI ${dni} no está en el padrón.`, 'error')
          return
        }
        registrarPersona(p, { silencioso: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al consultar el padrón.'
        showToast(msg, 'error')
      } finally {
        procesandoQrRef.current = false
      }
    },
    [registrarPersona, showToast],
  )

  useEffect(() => {
    if (modo !== 'qr') {
      const inst = scannerRef.current
      scannerRef.current = null
      void detenerScannerQr(inst, scannerRunningRef)
      return
    }

    let cancelled = false

    void import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelled) return
        const sc = new Html5Qrcode(QR_READER_ID)
        scannerRef.current = sc
        return sc
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 260, height: 260 } },
            (decoded) => {
              if (!cancelled) void procesarDniEscaneado(decoded)
            },
            () => {
              /* frames sin QR */
            },
          )
          .then(() => {
            if (cancelled) {
              return detenerScannerQr(sc, scannerRunningRef)
            }
            scannerRunningRef.current = true
          })
          .catch(() => {
            if (scannerRef.current === sc) scannerRef.current = null
            return detenerScannerQr(sc, scannerRunningRef)
          })
      })
      .catch(() => {
        if (!cancelled) {
          showToast('No se pudo acceder a la cámara. Usá carga manual.', 'error')
          setModo('manual')
        }
      })

    return () => {
      cancelled = true
      const inst = scannerRef.current
      scannerRef.current = null
      void detenerScannerQr(inst, scannerRunningRef)
    }
  }, [modo, procesarDniEscaneado, showToast])

  async function handleBuscarDni() {
    const dni = dniInput.trim().toUpperCase()
    if (!dni) {
      showToast('Ingresá un DNI.', 'error')
      return
    }
    setBuscando(true)
    setPersona(null)
    try {
      const p = await buscarPersonaPadronPorDni(dni)
      if (!p) {
        showToast('No se encontró en el padrón.', 'error')
        return
      }
      setPersona(p)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al consultar el padrón.'
      showToast(msg, 'error')
    } finally {
      setBuscando(false)
    }
  }

  function handleRegistrarManual() {
    if (!persona) return
    if (registrarPersona(persona)) {
      limpiarManual()
    }
  }

  async function handleCerrarSesion() {
    const inst = scannerRef.current
    scannerRef.current = null
    await detenerScannerQr(inst, scannerRunningRef)
    await logout()
    window.location.href = '/login'
  }

  const historialOrdenado = useMemo(
    () =>
      [...historialHoy].sort((a, b) => {
        const ta = a.fechaHora?.getTime() ?? horasLocales.get(a.id)?.getTime() ?? 0
        const tb = b.fechaHora?.getTime() ?? horasLocales.get(b.id)?.getTime() ?? 0
        if (tb !== ta) return tb - ta
        return b.id.localeCompare(a.id)
      }),
    [historialHoy, horasLocales],
  )

  const tabClass = (activo: boolean) =>
    `min-h-12 flex-1 rounded-xl px-2 text-sm font-bold transition sm:min-h-14 sm:rounded-2xl sm:text-base ${
      activo
        ? 'bg-[#CD1818] text-white shadow-sm'
        : 'border border-neutral-200 bg-neutral-50 text-neutral-600'
    }`

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col bg-neutral-50 ${
        flashOk ? 'ring-4 ring-inset ring-[#CD1818]/35' : ''
      }`}
    >
      <header
        className={`shrink-0 border-b bg-white px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] transition-colors ${
          modoNochero ? 'border-[#CD1818]/30 bg-[#CD1818]/5' : 'border-neutral-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Terminal comensales
            </p>
            <p
              className={`mt-1 text-2xl font-bold leading-tight sm:text-3xl ${
                modoNochero
                  ? 'text-[#CD1818]'
                  : puedeRegistrar
                    ? 'text-[#171717]'
                    : 'text-red-600'
              }`}
            >
              {modoNochero
                ? 'CENA NOCHERO'
                : etiquetaServicioComedor(servicioMostrado).toUpperCase()}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                online
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
              }`}
            >
              {online ? (
                <Wifi className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <WifiOff className="h-3.5 w-3.5" aria-hidden />
              )}
              {online ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={() => void handleCerrarSesion()}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-600 transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Salir
            </button>
          </div>
        </div>

        <label
          className={`mt-4 flex min-h-[3.25rem] cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition ${
            modoNochero
              ? 'border-[#CD1818]/40 bg-white ring-1 ring-[#CD1818]/15'
              : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <span
            className={`text-sm font-bold tracking-wide ${
              modoNochero ? 'text-[#CD1818]' : 'text-neutral-700'
            }`}
          >
            {modoNochero ? 'Modo nochero' : 'Modo normal (automático)'}
          </span>
          <span className="relative inline-flex h-8 w-14 shrink-0 items-center">
            <input
              type="checkbox"
              checked={modoNochero}
              onChange={(e) => setModoNochero(e.target.checked)}
              className="peer sr-only"
              aria-label="Activar modo nochero"
            />
            <span className="absolute inset-0 rounded-full bg-neutral-300 transition peer-checked:bg-[#CD1818]" />
            <span className="absolute left-1 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-6" />
          </span>
        </label>

        {!puedeRegistrar ? (
          <p className="mt-2 text-sm text-red-600">
            Fuera de horario: activá modo nochero o esperá la próxima franja.
          </p>
        ) : null}
        {ultimoNombre ? (
          <p className="mt-2 truncate text-sm text-neutral-600">Último: {ultimoNombre}</p>
        ) : null}
      </header>

      <nav
        className="flex shrink-0 gap-1.5 border-b border-neutral-200 bg-white p-2 sm:gap-2 sm:p-3"
        aria-label="Modo de ingreso"
      >
        <button type="button" onClick={() => setModo('qr')} className={tabClass(modo === 'qr')}>
          QR
        </button>
        <button
          type="button"
          onClick={() => setModo('manual')}
          className={tabClass(modo === 'manual')}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setModo('historial')}
          className={tabClass(modo === 'historial')}
        >
          Historial
        </button>
      </nav>

      <main className="relative min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-4">
        {modo === 'qr' ? (
          <div className="flex flex-col items-center">
            <div
              id={QR_READER_ID}
              className="w-full max-w-sm overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white shadow-sm [&_video]:rounded-xl"
            />
            <p className="mt-4 text-center text-sm text-neutral-500">
              Apuntá la cámara al código QR. El registro es inmediato al validar el DNI.
            </p>
          </div>
        ) : modo === 'manual' ? (
          <div className="mx-auto flex w-full max-w-md flex-col gap-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                DNI
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoCapitalize="characters"
                value={dniInput}
                onChange={(e) => {
                  setDniInput(e.target.value)
                  setPersona(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleBuscarDni()
                }}
                placeholder="Ej. 30123456"
                className="mt-2 block w-full min-h-[4.5rem] rounded-2xl border-2 border-neutral-200 bg-white px-4 text-center text-3xl font-bold tabular-nums text-[#171717] outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              disabled={buscando || !dniInput.trim()}
              onClick={() => void handleBuscarDni()}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-lg font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50 disabled:opacity-45"
            >
              <Search className="h-5 w-5 text-[#CD1818]" aria-hidden />
              {buscando ? 'Buscando…' : 'Buscar en padrón'}
            </button>

            {persona ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <UserCheck className="h-8 w-8 shrink-0 text-[#CD1818]" aria-hidden />
                  <div>
                    <p className="text-lg font-bold text-[#171717]">
                      {persona.apellido}, {persona.nombre}
                    </p>
                    <p className="mt-1 font-mono text-sm text-neutral-500">DNI {persona.dni}</p>
                    <p className="mt-1 text-sm text-neutral-600">{persona.empresa || '—'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!puedeRegistrar}
                  onClick={handleRegistrarManual}
                  className="mt-5 min-h-16 w-full rounded-2xl bg-[#CD1818] text-xl font-bold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {modoNochero ? 'Registrar cena nochera' : 'Registrar'}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-lg">
            <div className="mb-3 flex items-center gap-2 text-sm text-neutral-600">
              <Clock className="h-4 w-4 shrink-0 text-[#CD1818]" aria-hidden />
              <span>
                Registros de <strong className="font-semibold text-[#171717]">hoy</strong> en este
                dispositivo ({historialOrdenado.length})
              </span>
            </div>
            {historialOrdenado.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-500">
                Todavía no hay registros hoy desde esta terminal.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {historialOrdenado.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <span className="w-12 shrink-0 font-mono text-sm font-bold tabular-nums text-[#CD1818]">
                      {horaDeRegistro(r, horasLocales)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#171717]">
                        {r.apellido}, {r.nombre}
                      </p>
                      <p className="font-mono text-xs text-neutral-500">{r.dni}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-neutral-200 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-sm text-neutral-500">Comensales registrados hoy</p>
        <p className="text-4xl font-bold tabular-nums text-[#CD1818]">{contadorHoy}</p>
      </footer>
    </div>
  )
}
