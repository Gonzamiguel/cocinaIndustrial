import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode'
import {
  ArrowLeft,
  Camera,
  CloudOff,
  Keyboard,
  LogOut,
  User,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import type { PadronPersona } from '../../types/hoteleria'
import type { RegistroComedor, ServicioComedor } from '../../types/comedor'
import {
  buscarPersonaPadronPorDni,
  claveRegistroComedorDia,
  diaOperativoYmdLocal,
  encolarRegistroComedor,
  mensajeRegistroDuplicadoComedor,
  subscribeContadorComedorHoy,
  subscribeRegistrosComedorHoyEnDispositivo,
  validarRegistroComedorUnico,
} from '../../lib/comedor'
import { subscribePadronPersonas } from '../../lib/hoteleria'
import { reproducirBeepExito } from '../../lib/beepExito'
import { extraerDniDesdeQr } from '../../lib/qrComensal'
import {
  contieneRefrigerioPorServicio,
  etiquetaServicioComedor,
} from '../../lib/servicioComedor'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

const QR_READER_ID = 'terminal-comedor-qr-reader'
const DNI_DUPLICADO_COOLDOWN_MS = 1200

/** Clave de grilla (Pantalla 1) → servicio Firestore + etiqueta UI. */
const SERVICIOS_TERMINAL = [
  { id: 'DESAYUNO', titulo: 'Desayuno', servicio: 'DESAYUNO' as const },
  { id: 'ALMUERZO_REFRIGERIO', titulo: 'Almuerzo + Refrigerio', servicio: 'ALMUERZO' as const },
  { id: 'MERIENDA', titulo: 'Merienda', servicio: 'MERIENDA' as const },
  { id: 'CENA', titulo: 'Cena', servicio: 'CENA' as const },
  { id: 'CENA_REFRIGERIO', titulo: 'Cena + Refrigerio', servicio: 'CENA_NOCHERO' as const },
  { id: 'VIANDAS', titulo: 'Viandas', servicio: 'MERIENDA' as const, observaciones: 'Vianda' },
] as const

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

function resolverConfigServicio(activo: string | null) {
  if (!activo) return null
  return SERVICIOS_TERMINAL.find((s) => s.id === activo) ?? null
}

/** Búsqueda unificada DNI / nombre / apellido sobre el padrón en memoria. */
function buscarPersonaPorConsulta(
  consulta: string,
  padron: PadronPersona[],
): { persona: PadronPersona | null; ambiguo: boolean } {
  const q = consulta.trim()
  if (!q) return { persona: null, ambiguo: false }

  const qLower = q.toLowerCase()
  const soloDigitos = q.replace(/\D/g, '')
  if (soloDigitos.length >= 6) {
    const dniNorm = soloDigitos.toUpperCase()
    const porDni = padron.find((p) => p.dni === dniNorm)
    if (porDni) return { persona: porDni, ambiguo: false }
  }

  const matches = padron.filter((p) => {
    const blob = `${p.dni} ${p.nombre} ${p.apellido} ${p.empresa}`.toLowerCase()
    return blob.includes(qLower)
  })

  if (matches.length === 1) return { persona: matches[0]!, ambiguo: false }
  if (matches.length > 1) return { persona: null, ambiguo: true }
  return { persona: null, ambiguo: false }
}

async function detenerScannerQr(
  inst: Html5QrcodeType | null,
  running: { current: boolean },
): Promise<void> {
  if (!inst) return
  if (running.current) {
    try {
      await inst.stop()
    } catch {
      /* ya detenido */
    }
    running.current = false
  }
  try {
    inst.clear()
  } catch {
    /* DOM limpiado */
  }
}

function IndicadorRed({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <Wifi className="h-3 w-3" aria-hidden />
        Online
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
      <CloudOff className="h-3 w-3 text-amber-700" aria-hidden />
      Guardando localmente…
    </span>
  )
}

export function TerminalComensalesPage() {
  const { user, logout } = useAuth()
  const { showToast } = useToast()
  const online = useOnlineStatus()

  const [servicioActivo, setServicioActivo] = useState<string | null>(null)
  /** inicio = 2 botones + historial; manual = buscador; qr = solo cámara */
  const [vistaRegistro, setVistaRegistro] = useState<'inicio' | 'manual' | 'qr'>('inicio')
  const [busquedaInput, setBusquedaInput] = useState('')
  const [padron, setPadron] = useState<PadronPersona[]>([])
  const [registrando, setRegistrando] = useState(false)
  const [contadorHoy, setContadorHoy] = useState(0)
  const [historialHoy, setHistorialHoy] = useState<RegistroComedor[]>([])
  const [flashOk, setFlashOk] = useState(false)

  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const scannerRunningRef = useRef(false)
  const procesandoQrRef = useRef(false)
  const ultimoDniQrRef = useRef<string | null>(null)
  const ultimoQrTsRef = useRef(0)
  const horasLocalesRef = useRef<Map<string, Date>>(new Map())
  /** Evita doble alta optimista antes de que Firestore confirme el snapshot. */
  const pendientesHoyRef = useRef<Set<string>>(new Set())
  const horasLocales = horasLocalesRef.current

  const configServicio = resolverConfigServicio(servicioActivo)
  const tituloServicio = configServicio?.titulo ?? ''

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

  useEffect(() => {
    if (!servicioActivo) {
      setPadron([])
      return
    }
    return subscribePadronPersonas(setPadron)
  }, [servicioActivo])

  const confirmarExitoUi = useCallback(
    (p: PadronPersona, servicioRegistrado: ServicioComedor) => {
      reproducirBeepExito()
      setFlashOk(true)
      window.setTimeout(() => setFlashOk(false), 400)
      const svc = servicioRegistrado
      const linea =
        contieneRefrigerioPorServicio(svc)
          ? `${p.apellido}, ${p.nombre} — ${etiquetaServicioComedor(svc)} + refrigerio`
          : `${p.apellido}, ${p.nombre} — ${etiquetaServicioComedor(svc)}`
      showToast(`Registrado: ${linea}`, 'success')
    },
    [showToast],
  )

  const registrarPersona = useCallback(
    async (p: PadronPersona, opts?: { silencioso?: boolean }): Promise<boolean> => {
      if (!user?.uid) {
        showToast('Sesión no válida. Volvé a iniciar sesión.', 'error')
        return false
      }
      const cfg = resolverConfigServicio(servicioActivo)
      if (!cfg) {
        showToast('Elegí un servicio en la pantalla anterior.', 'error')
        return false
      }
      const ymd = diaOperativoYmdLocal()
      const clave = claveRegistroComedorDia(p.dni, cfg.servicio, ymd)

      if (pendientesHoyRef.current.has(clave)) {
        showToast(mensajeRegistroDuplicadoComedor(cfg.servicio, ymd), 'error')
        return false
      }

      try {
        await validarRegistroComedorUnico({
          persona: p,
          servicio: cfg.servicio,
          diaOperativo: ymd,
          registrosLocales: historialHoy,
        })
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'No se puede registrar dos veces el mismo servicio.'
        showToast(msg, 'error')
        return false
      }

      const observaciones =
        'observaciones' in cfg && cfg.observaciones ? cfg.observaciones : undefined

      pendientesHoyRef.current.add(clave)
      const { id, promise } = encolarRegistroComedor({
        persona: p,
        servicio: cfg.servicio,
        usuarioRegistro: user.uid,
        observaciones,
      })
      horasLocalesRef.current.set(id, new Date())
      if (!opts?.silencioso) {
        confirmarExitoUi(p, cfg.servicio)
      } else {
        reproducirBeepExito()
        setFlashOk(true)
        window.setTimeout(() => setFlashOk(false), 400)
      }
      void promise.catch((e) => {
        pendientesHoyRef.current.delete(clave)
        horasLocalesRef.current.delete(id)
        const msg = e instanceof Error ? e.message : 'No se pudo guardar el registro. Reintentá.'
        showToast(msg, 'error')
      })
      return true
    },
    [user?.uid, servicioActivo, historialHoy, showToast, confirmarExitoUi],
  )

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
        await registrarPersona(p, { silencioso: true })
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
    if (!servicioActivo || vistaRegistro !== 'qr') {
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
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decoded) => {
              if (!cancelled) void procesarDniEscaneado(decoded)
            },
            () => {
              /* sin QR en frame */
            },
          )
          .then(() => {
            if (cancelled) return detenerScannerQr(sc, scannerRunningRef)
            scannerRunningRef.current = true
          })
          .catch(() => {
            if (scannerRef.current === sc) scannerRef.current = null
            void detenerScannerQr(sc, scannerRunningRef)
            if (!cancelled) {
              showToast('No se pudo acceder a la cámara. Revisá permisos.', 'error')
            }
          })
      })
      .catch(() => {
        if (!cancelled) {
          showToast('No se pudo iniciar el lector QR.', 'error')
        }
      })

    return () => {
      cancelled = true
      const inst = scannerRef.current
      scannerRef.current = null
      void detenerScannerQr(inst, scannerRunningRef)
    }
  }, [vistaRegistro, servicioActivo, procesarDniEscaneado, showToast])

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

  async function detenerScannerActivo() {
    const inst = scannerRef.current
    scannerRef.current = null
    await detenerScannerQr(inst, scannerRunningRef)
  }

  async function handleRegistroManual() {
    const consulta = busquedaInput.trim()
    if (!consulta) {
      showToast('Ingresá DNI, nombre o apellido.', 'error')
      return
    }
    setRegistrando(true)
    try {
      let { persona, ambiguo } = buscarPersonaPorConsulta(consulta, padron)

      if (!persona && !ambiguo) {
        const soloDigitos = consulta.replace(/\D/g, '')
        if (soloDigitos.length >= 6) {
          persona = await buscarPersonaPadronPorDni(soloDigitos)
        }
      }

      if (ambiguo) {
        showToast('Varios resultados. Sé más específico o usá el DNI completo.', 'error')
        return
      }
      if (!persona) {
        showToast('No se encontró en el padrón.', 'error')
        return
      }
      if (await registrarPersona(persona)) {
        setBusquedaInput('')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al consultar el padrón.'
      showToast(msg, 'error')
    } finally {
      setRegistrando(false)
    }
  }

  function volverAInicioRegistro() {
    void detenerScannerActivo()
    setVistaRegistro('inicio')
    setBusquedaInput('')
  }

  function volverAServicios() {
    void detenerScannerActivo()
    setServicioActivo(null)
    setVistaRegistro('inicio')
    setBusquedaInput('')
  }

  function handleAtrasHeader() {
    if (vistaRegistro === 'inicio') void volverAServicios()
    else volverAInicioRegistro()
  }

  async function handleCerrarSesion() {
    await detenerScannerActivo()
    await logout()
    window.location.href = '/login'
  }

  if (servicioActivo === null) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-50">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Terminal comensales
            </p>
            <h1 className="mt-1 text-xl font-bold text-gray-800">Seleccionar Servicio</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <IndicadorRed online={online} />
            <button
              type="button"
              onClick={() => void handleCerrarSesion()}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#CD1818]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Salir
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-2 gap-4 p-4 content-start">
          {SERVICIOS_TERMINAL.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setServicioActivo(item.id)}
              className="flex aspect-square min-h-[7.5rem] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm transition active:bg-gray-100"
            >
              <span className="text-base font-bold leading-snug text-gray-800">{item.titulo}</span>
            </button>
          ))}
        </div>

        <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
          <p className="text-xs text-gray-500">Registros hoy (campamento)</p>
          <p className="text-2xl font-bold tabular-nums text-[#CD1818]">{contadorHoy}</p>
        </footer>
      </div>
    )
  }

  return (
    <div
      className={`relative flex min-h-dvh flex-col bg-gray-50 ${
        flashOk ? 'ring-4 ring-inset ring-[#CD1818]/30' : ''
      }`}
    >
      <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAtrasHeader}
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 active:bg-gray-100"
            aria-label={
              vistaRegistro === 'inicio'
                ? 'Volver a selección de servicio'
                : 'Volver al menú de registro'
            }
          >
            <ArrowLeft className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 text-center text-lg font-bold text-[#CD1818]">
            {tituloServicio}
          </h1>
          <div className="flex w-12 shrink-0 justify-end">
            <IndicadorRed online={online} />
          </div>
        </div>
        <p className="mt-1 text-center text-[11px] text-gray-500">
          <span className="font-medium text-gray-700">
            ← {vistaRegistro === 'inicio' ? 'Servicios' : 'Inicio'}
          </span>
          {vistaRegistro === 'inicio' ? (
            <>
              <span className="mx-1">·</span>
              {historialOrdenado.length} en esta sesión
            </>
          ) : null}
        </p>
      </header>

      {vistaRegistro === 'inicio' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-2 gap-4 p-4">
            <button
              type="button"
              onClick={() => setVistaRegistro('manual')}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition active:bg-gray-100"
            >
              <Keyboard className="h-8 w-8 text-[#CD1818]" aria-hidden />
              <span className="text-center text-sm font-bold text-gray-800">Carga Manual</span>
            </button>
            <button
              type="button"
              onClick={() => setVistaRegistro('qr')}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition active:bg-gray-100"
            >
              <Camera className="h-8 w-8 text-[#CD1818]" aria-hidden />
              <span className="text-center text-sm font-bold text-gray-800">Escáner QR</span>
            </button>
          </div>

          <section className="flex min-h-0 flex-1 flex-col border-t border-gray-200 p-4">
            <p className="mb-2 text-xs font-medium text-gray-500">Últimos registros</p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white">
              {historialOrdenado.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500">
                  Sin registros hoy en este dispositivo.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {historialOrdenado.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-11 shrink-0 font-mono text-sm font-bold tabular-nums text-[#CD1818]">
                        {horaDeRegistro(r, horasLocales)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {r.apellido}, {r.nombre}
                        </p>
                        <p className="font-mono text-xs text-gray-500">DNI {r.dni}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : vistaRegistro === 'manual' ? (
        <main className="flex flex-1 flex-col bg-white p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void handleRegistroManual()
            }}
          >
            <input
              type="search"
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              placeholder="Buscar por DNI, Nombre o Apellido"
              autoComplete="off"
              autoFocus
              className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-gray-200 bg-white px-3 text-base font-medium text-gray-800 outline-none placeholder:text-[#8997A6] focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/10"
            />
            <button
              type="submit"
              disabled={registrando || !busquedaInput.trim()}
              className="inline-flex min-h-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-800 transition active:bg-gray-100 disabled:opacity-40 sm:min-w-[5.5rem] sm:px-4"
            >
              <User className="h-5 w-5 text-[#CD1818]" aria-hidden />
              <span>{registrando ? '…' : 'Registrar'}</span>
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-[#8997A6]">
            Tras registrar, volvé al inicio para ver el historial actualizado.
          </p>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-900 p-4">
          <div
            id={QR_READER_ID}
            className="aspect-square w-full max-w-md overflow-hidden rounded-2xl border-2 border-gray-600 bg-black shadow-lg [&_video]:rounded-xl"
          />
          <p className="mt-4 max-w-sm text-center text-sm text-gray-300">
            Apuntá al QR del comensal. El registro es automático.
          </p>
        </main>
      )}
    </div>
  )
}
