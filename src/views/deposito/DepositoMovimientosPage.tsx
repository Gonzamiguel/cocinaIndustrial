import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ModoPistolaBarra } from '../../components/deposito/ModoPistolaBarra'
import { InsumoSearchSelect } from '../../components/insumos/InsumoSearchSelect'
import { PresentacionCantidadFields } from '../../components/insumos/PresentacionCantidadFields'
import { DepositoSolicitudesMercaderiaPanel } from '../../components/deposito/DepositoSolicitudesMercaderiaPanel'
import { useToast } from '../../context/ToastContext'
import { buscarInsumoPorCodigoEscaneado } from '../../lib/codigoBarrasInsumo'
import type { EgresoPrefillDesdeSolicitud } from '../../lib/depositoEgresoPrefill'
import {
  useInventarioScanner,
  type EscaneoInventario,
} from '../../hooks/useInventarioScanner'
import {
  exportarMovimientoInventarioPdf,
  exportarMovimientosInventarioExcel,
  exportarRemitoTransportePdf,
  type TipoVersionPdfMovimiento,
} from '../../lib/movimientosInventarioExport'
import {
  crearMovimiento,
  DESTINOS_EGRESO,
  lotesDisponiblesParaEgreso,
  movimientosEnUbicacion,
  normalizarLoteKey,
  requiereDatosTransporte,
  subscribeMovimientosInventario,
  UBICACION_DEPOSITO_CENTRAL,
  type ItemMovimientoInventario,
  type LoteDisponibleEgreso,
  type MovimientoInventario,
  type TipoMovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import {
  PRESENTACION_BASE_ID,
  convertirCantidadAUnidadBase,
  etiquetaPresentacionSeleccionada,
  factorPresentacionSeleccionada,
  parseCantidadUsuario,
} from '../../lib/presentacionesInsumo'

type TabFiltro = 'todos' | 'ingresos' | 'egresos' | 'otros'

type FilaDraft = {
  key: string
  insumoId: string | null
  nombreSnapshot: string
  cantidad: string
  /** `PRESENTACION_BASE_ID` o id de presentación del catálogo. */
  presentacionEmpaqueId: string
  lote: string
  fechaVencimiento: string
  temperatura: string
  controlCalidadOk: boolean
  precioUnitarioFacturado: string
  /** Solo EGRESO: evita confundir «sin elegir» con lote vacío (sin número). */
  egresoLoteDefinido: boolean
}

function nuevaFila(): FilaDraft {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: null,
    nombreSnapshot: '',
    cantidad: '',
    presentacionEmpaqueId: PRESENTACION_BASE_ID,
    lote: '',
    fechaVencimiento: '',
    temperatura: '',
    controlCalidadOk: false,
    precioUnitarioFacturado: '',
    egresoLoteDefinido: false,
  }
}

function hoyISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseFechaLocal(yyyyMmDd: string): Date {
  const [y, mo, da] = yyyyMmDd.split('-').map(Number)
  if (!y || !mo || !da) return new Date()
  return new Date(y, mo - 1, da, 12, 0, 0, 0)
}

function formatFechaHora(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatVto(s: string | null | undefined): string {
  if (!s?.trim()) return '—'
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-AR')
  }
  return t
}

function etiquetaTipo(t: TipoMovimientoInventario): string {
  switch (t) {
    case 'INGRESO':
      return 'Ingreso'
    case 'EGRESO':
      return 'Egreso'
    case 'AJUSTE':
      return 'Ajuste'
    case 'DECOMISO':
      return 'Decomiso'
    default:
      return t
  }
}

function resumenMovimiento(m: MovimientoInventario): string {
  switch (m.tipo) {
    case 'INGRESO':
      return m.proveedor || '—'
    case 'EGRESO':
      return m.destino || '—'
    case 'AJUSTE':
    case 'DECOMISO':
      return m.motivo.length > 48 ? `${m.motivo.slice(0, 48)}…` : m.motivo
    default:
      return '—'
  }
}

function formatoOpcionLote(l: LoteDisponibleEgreso): string {
  const lotTxt = l.lotePersistido.trim() ? l.lotePersistido : 'Sin lote'
  const v = l.fechaVencimiento ? formatVto(l.fechaVencimiento) : '—'
  return `Lote: ${lotTxt} - Vto: ${v} (Stock: ${l.stock})`
}

function cantidadBaseDesdeFila(f: FilaDraft, ins: Insumo | undefined): number | null {
  const cant = parseCantidadUsuario(f.cantidad)
  if (cant == null) return null
  const factor = factorPresentacionSeleccionada(ins, f.presentacionEmpaqueId)
  return convertirCantidadAUnidadBase(cant, factor)
}

function stockReservadoOtrasFilasEgreso(
  filas: FilaDraft[],
  exceptIndex: number,
  insumoId: string,
  loteKey: string,
  insumosById: Map<string, Insumo>,
): number {
  let s = 0
  for (let j = 0; j < filas.length; j++) {
    if (j === exceptIndex) continue
    const f = filas[j]
    if (f.insumoId !== insumoId) continue
    if (normalizarLoteKey(f.lote) !== loteKey) continue
    const c = cantidadBaseDesdeFila(f, insumosById.get(insumoId))
    if (c != null && c > 0) s += c
  }
  return s
}

function docResumen(m: MovimientoInventario): string {
  switch (m.tipo) {
    case 'INGRESO':
      return `${m.tipoDocumento} ${m.numeroDocumento}`.trim()
    case 'EGRESO':
      return m.numeroDocumento || '—'
    default:
      return '—'
  }
}

function normalizarTextoFiltro(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function fechaIsoLocal(date: Date | null): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function filaTieneContenido(fila: FilaDraft): boolean {
  return Boolean(
    fila.insumoId ||
      fila.nombreSnapshot.trim() ||
      fila.cantidad.trim() ||
      fila.lote.trim() ||
      fila.fechaVencimiento.trim() ||
      fila.temperatura.trim() ||
      fila.precioUnitarioFacturado.trim() ||
      fila.controlCalidadOk,
  )
}

const EGRESO_SELECT_PENDING = '__pending__'
const EGRESO_SELECT_SIN_LOTE = '__sin_lote__'

const inputCompact =
  'mt-1.5 w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

/** Misma rejilla cabecera/fila (md+): 12 columnas, gap-3 */
const itemGridClass =
  'flex flex-col gap-4 md:grid md:grid-cols-12 md:gap-3 md:items-center w-full'

function badgeOrigenIngreso(m: MovimientoInventario): { label: string; className: string } | null {
  if (m.tipo !== 'INGRESO') return null
  if (m.ordenCompraId) {
    return {
      label: m.ordenCompraNumero ? `OC ${m.ordenCompraNumero}` : 'Con OC',
      className: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    }
  }
  return {
    label: 'Libre',
    className: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  }
}


const TIPOS_MOV: { value: TipoMovimientoInventario; label: string }[] = [
  { value: 'EGRESO', label: 'Egreso' },
  { value: 'AJUSTE', label: 'Ajuste de stock' },
  { value: 'DECOMISO', label: 'Decomiso' },
]

function tabClass(active: boolean): string {
  return `min-h-11 shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
    active
      ? 'border-[#CD1818] text-[#CD1818]'
      : 'border-transparent text-[#8997A6] hover:text-[#171717]'
  }`
}

type MovimientoEgresoInventario = Extract<MovimientoInventario, { tipo: 'EGRESO' }>

function exportarPdfMovimiento(
  movimiento: MovimientoInventario,
  unidadesPorInsumoId: Map<string, string>,
  tipo: TipoVersionPdfMovimiento,
) {
  if (movimiento.tipo === 'EGRESO') {
    exportarRemitoTransportePdf(movimiento, unidadesPorInsumoId, tipo)
    return
  }
  exportarMovimientoInventarioPdf(movimiento, unidadesPorInsumoId, tipo)
}

function PdfActionsDropdown({
  movimiento,
  unidadesPorInsumoId,
  compact = false,
}: {
  movimiento: MovimientoInventario
  unidadesPorInsumoId: Map<string, string>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  const buttonClass = compact
    ? 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-[#171717] shadow-sm transition hover:border-[#CD1818]/30 hover:text-[#CD1818]'
    : 'inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-[#171717] shadow-sm transition hover:border-[#CD1818]/30 hover:text-[#CD1818]'

  const labelOperativa =
    movimiento.tipo === 'INGRESO'
      ? 'Versión Operativa / Recibo de carga'
      : movimiento.tipo === 'EGRESO'
        ? 'Versión Operativa / Chofer'
        : 'Versión Operativa'

  return (
    <div ref={wrapRef} className="relative inline-flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={buttonClass}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.25 2.5A2.75 2.75 0 002.5 5.25v6.5a2.75 2.75 0 002.75 2.75h.69l1.28 2.133a.75.75 0 001.286 0l1.28-2.133h4.964A2.75 2.75 0 0017.5 11.75v-6.5A2.75 2.75 0 0014.75 2.5h-9.5zm.5 3a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 3a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5z"
            clipRule="evenodd"
          />
        </svg>
        <span>{compact ? 'PDF' : 'PDF'}</span>
        <span aria-hidden>▾</span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 min-w-[230px] rounded-md border border-gray-200 bg-white py-1 shadow-md"
          role="menu"
        >
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-sm text-[#171717] hover:bg-gray-50"
            role="menuitem"
            onClick={() => {
              exportarPdfMovimiento(movimiento, unidadesPorInsumoId, 'CHOFER')
              setOpen(false)
            }}
          >
            {labelOperativa}
          </button>
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-sm text-[#171717] hover:bg-gray-50"
            role="menuitem"
            onClick={() => {
              exportarPdfMovimiento(
                movimiento,
                unidadesPorInsumoId,
                'ADMINISTRATIVO',
              )
              setOpen(false)
            }}
          >
            Versión Administrativa
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function DepositoMovimientosPage() {
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [tabFiltro, setTabFiltro] = useState<TabFiltro>('todos')
  const [queryDocumento, setQueryDocumento] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const cantidadInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const registerCantidadRef = useCallback((key: string) => {
    return (el: HTMLInputElement | null) => {
      if (el) cantidadInputRefs.current[key] = el
      else delete cantidadInputRefs.current[key]
    }
  }, [])

  const [tipoMovimiento, setTipoMovimiento] =
    useState<TipoMovimientoInventario>('EGRESO')
  const [destino, setDestino] = useState<string>(DESTINOS_EGRESO[0])
  const [motivo, setMotivo] = useState('')
  const [fechaOperacion, setFechaOperacion] = useState(() => hoyISO())
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [chofer, setChofer] = useState('')
  const [patente, setPatente] = useState('')
  const [precinto, setPrecinto] = useState('')
  const [filas, setFilas] = useState<FilaDraft[]>(() => [nuevaFila()])
  const [modoPistola, setModoPistola] = useState(false)
  const [remitoReciente, setRemitoReciente] =
    useState<MovimientoEgresoInventario | null>(null)

  const [detalleModalId, setDetalleModalId] = useState<string | null>(null)

  const location = useLocation()
  const navigate = useNavigate()
  const prefillConsumidoRef = useRef(false)
  const [depositoVistaTab, setDepositoVistaTab] = useState<
    'historial' | 'solicitudes'
  >('historial')
  const [egresoSolicitudId, setEgresoSolicitudId] = useState<string | null>(null)
  const [egresoDestinoBloqueado, setEgresoDestinoBloqueado] = useState(false)
  const [egresoUbicacionDestinoExplicita, setEgresoUbicacionDestinoExplicita] =
    useState<string | undefined>(undefined)

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    return subscribeMovimientosInventario(setMovimientos)
  }, [])

  useEffect(() => {
    if (!detalleModalId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetalleModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detalleModalId])

  useEffect(() => {
    const st = location.state as {
      egresoDesdeSolicitud?: EgresoPrefillDesdeSolicitud
    } | null
    const pre = st?.egresoDesdeSolicitud
    if (!pre) {
      prefillConsumidoRef.current = false
      return
    }
    if (prefillConsumidoRef.current) return
    prefillConsumidoRef.current = true

    setDepositoVistaTab('historial')
    setIsCreating(true)
    setTipoMovimiento('EGRESO')
    setDestino(pre.destinoEgreso)
    setEgresoDestinoBloqueado(true)
    setEgresoUbicacionDestinoExplicita(pre.ubicacionDestino)
    setEgresoSolicitudId(pre.solicitudId)
    setFilas(
      pre.items.length > 0
        ? pre.items.map((it) => ({
            ...nuevaFila(),
            insumoId: it.insumoId,
            nombreSnapshot: it.nombreSnapshot,
            cantidad: String(it.cantidad),
            presentacionEmpaqueId: PRESENTACION_BASE_ID,
            lote: '',
            fechaVencimiento: '',
            temperatura: '',
            controlCalidadOk: false,
            precioUnitarioFacturado: '',
            egresoLoteDefinido: false,
          }))
        : [nuevaFila()],
    )

    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  const insumosById = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  const unidadesPorInsumoId = useMemo(() => {
    const m = new Map<string, string>()
    for (const insumo of insumos) m.set(insumo.id, insumo.unidadBase)
    return m
  }, [insumos])

  const movimientosCentrales = useMemo(
    () => movimientosEnUbicacion(movimientos, UBICACION_DEPOSITO_CENTRAL),
    [movimientos],
  )

  const movimientosFiltrados = useMemo(() => {
    const query = normalizarTextoFiltro(queryDocumento)
    return movimientosCentrales.filter((m) => {
      const cumpleTipo =
        tabFiltro === 'todos'
          ? true
          : tabFiltro === 'ingresos'
            ? m.tipo === 'INGRESO'
            : tabFiltro === 'egresos'
              ? m.tipo === 'EGRESO'
              : m.tipo === 'AJUSTE' || m.tipo === 'DECOMISO'
      if (!cumpleTipo) return false

      const documento = normalizarTextoFiltro(docResumen(m))
      if (query && !documento.includes(query)) return false

      const fechaMov = fechaIsoLocal(m.fecha)
      if (fechaDesde && (!fechaMov || fechaMov < fechaDesde)) return false
      if (fechaHasta && (!fechaMov || fechaMov > fechaHasta)) return false

      return true
    })
  }, [movimientosCentrales, tabFiltro, queryDocumento, fechaDesde, fechaHasta])

  const movimientoDetalle = useMemo(() => {
    if (!detalleModalId) return null
    return movimientosCentrales.find((x) => x.id === detalleModalId) ?? null
  }, [detalleModalId, movimientosCentrales])

  const prevTipoRef = useRef(tipoMovimiento)
  useEffect(() => {
    if (tipoMovimiento === 'EGRESO' && prevTipoRef.current !== 'EGRESO') {
      setFilas((prev) =>
        prev.map((row) => ({
          ...row,
          lote: '',
          fechaVencimiento: '',
          cantidad: '',
          egresoLoteDefinido: false,
        })),
      )
    }
    prevTipoRef.current = tipoMovimiento
  }, [tipoMovimiento])

  const lotesPorInsumoEgreso = useMemo(() => {
    const map = new Map<string, LoteDisponibleEgreso[]>()
    if (tipoMovimiento !== 'EGRESO') return map
    const ids = new Set<string>()
    for (const f of filas) {
      if (f.insumoId) ids.add(f.insumoId)
    }
    for (const id of ids) {
      map.set(id, lotesDisponiblesParaEgreso(movimientosCentrales, id))
    }
    return map
  }, [movimientosCentrales, filas, tipoMovimiento])

  const enfocarCantidadFila = useCallback((filaKey: string) => {
    queueMicrotask(() => {
      const el = cantidadInputRefs.current[filaKey]
      el?.focus()
      el?.select()
    })
  }, [])

  const aplicarEscaneoInsumo = useCallback(
    (ins: Insumo, loteQr?: string) => {
      let filaKeyUsada = ''

      setFilas((prev) => {
        let targetIdx = prev.findIndex(
          (f) => f.insumoId === ins.id && !f.cantidad.trim(),
        )
        if (targetIdx < 0) {
          targetIdx = prev.findIndex((f) => !f.insumoId?.trim())
        }

        const armarFila = (f: FilaDraft): FilaDraft => {
          const base: Partial<FilaDraft> = {
            insumoId: ins.id,
            nombreSnapshot: formatLabelInsumo(ins),
            presentacionEmpaqueId: PRESENTACION_BASE_ID,
          }

          if (tipoMovimiento === 'EGRESO') {
            const lotes = lotesDisponiblesParaEgreso(movimientosCentrales, ins.id)
            if (lotes.length === 0) {
              return {
                ...f,
                ...base,
                lote: '',
                fechaVencimiento: '',
                egresoLoteDefinido: false,
              }
            }

            let bucket = lotes[0]
            if (loteQr?.trim()) {
              const key = normalizarLoteKey(loteQr)
              bucket = lotes.find((l) => l.loteKey === key) ?? bucket
            }

            return {
              ...f,
              ...base,
              lote: bucket.lotePersistido,
              fechaVencimiento: bucket.fechaVencimiento ?? '',
              egresoLoteDefinido: true,
            }
          }

          return { ...f, ...base }
        }

        if (targetIdx >= 0) {
          filaKeyUsada = prev[targetIdx].key
          return prev.map((f, i) => (i === targetIdx ? armarFila(f) : f))
        }

        const nueva = armarFila(nuevaFila())
        filaKeyUsada = nueva.key
        return [...prev, nueva]
      })

      if (tipoMovimiento === 'EGRESO') {
        const lotes = lotesDisponiblesParaEgreso(movimientosCentrales, ins.id)
        if (lotes.length === 0) {
          showToast(`Sin stock en central para «${formatLabelInsumo(ins)}».`, 'error')
          return
        }
      }

      if (filaKeyUsada) enfocarCantidadFila(filaKeyUsada)
      showToast(`${formatLabelInsumo(ins)} — listo para cargar cantidad`, 'success')
    },
    [tipoMovimiento, movimientosCentrales, showToast, enfocarCantidadFila],
  )

  const handleEscaneoInventario = useCallback(
    (result: EscaneoInventario) => {
      if (result.tipo === 'qr_insumo') {
        const ins = insumosById.get(result.insumoId)
        if (!ins) {
          showToast('El QR apunta a un insumo que ya no está en el catálogo.', 'error')
          return
        }
        aplicarEscaneoInsumo(ins, result.lote)
        return
      }

      if (result.tipo === 'codigo_barras_insumo') {
        const ins = buscarInsumoPorCodigoEscaneado(insumos, result.codigo)
        if (!ins) {
          showToast(
            `Código ${result.codigo} no registrado. Cargalo en Catálogo de insumos.`,
            'error',
          )
          return
        }
        aplicarEscaneoInsumo(ins)
      }
    },
    [insumos, insumosById, aplicarEscaneoInsumo, showToast],
  )

  useInventarioScanner({
    enabled: isCreating && modoPistola && !isSubmitting,
    aceptarViandas: false,
    onScan: handleEscaneoInventario,
  })

  const requiereTransporte = useMemo(
    () =>
      tipoMovimiento === 'EGRESO' && requiereDatosTransporte(destino),
    [tipoMovimiento, destino],
  )

  const formularioListoParaEnviar = useMemo(() => {
    if (!fechaOperacion.trim()) return false

    const encabezadoCompleto =
      tipoMovimiento === 'EGRESO'
        ? Boolean(
            destino.trim() &&
              numeroDocumento.trim() &&
              (!requiereTransporte ||
                (chofer.trim() && patente.trim() && precinto.trim())),
          )
        : Boolean(motivo.trim())

    if (!encabezadoCompleto) return false

    let hayItemValido = false

    for (const fila of filas) {
      const tieneContenido = filaTieneContenido(fila)
      const ins = fila.insumoId
        ? insumosById.get(fila.insumoId.trim())
        : undefined
      const cantidadBase = cantidadBaseDesdeFila(fila, ins)
      const insumoSeleccionado = Boolean(fila.insumoId?.trim())
      const cantidadValida =
        tipoMovimiento === 'AJUSTE'
          ? cantidadBase != null && cantidadBase !== 0
          : cantidadBase != null && cantidadBase > 0

      if (!tieneContenido) continue
      if (!insumoSeleccionado || !cantidadValida) return false
      if (tipoMovimiento === 'EGRESO' && !fila.egresoLoteDefinido) return false

      hayItemValido = true
    }

    return hayItemValido
  }, [
    chofer,
    destino,
    fechaOperacion,
    filas,
    insumosById,
    motivo,
    numeroDocumento,
    patente,
    precinto,
    requiereTransporte,
    tipoMovimiento,
  ])

  function actualizarFila(i: number, parcial: Partial<FilaDraft>) {
    setFilas((prev) =>
      prev.map((f, j) => (j === i ? { ...f, ...parcial } : f)),
    )
  }

  function agregarFila() {
    setFilas((prev) => [...prev, nuevaFila()])
  }

  function quitarFila(i: number) {
    setFilas((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  function resetFormulario() {
    setTipoMovimiento('EGRESO')
    setDestino(DESTINOS_EGRESO[0])
    setMotivo('')
    setFechaOperacion(hoyISO())
    setNumeroDocumento('')
    setChofer('')
    setPatente('')
    setPrecinto('')
    setFilas([nuevaFila()])
    setModoPistola(false)
    setEgresoSolicitudId(null)
    setEgresoDestinoBloqueado(false)
    setEgresoUbicacionDestinoExplicita(undefined)
    prefillConsumidoRef.current = false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const payloadItems: ItemMovimientoInventario[] = []

    for (let idx = 0; idx < filas.length; idx++) {
      const f = filas[idx]
      const idInsumo = f.insumoId?.trim()
      if (!idInsumo) continue

      const ins = insumosById.get(idInsumo)
      if (!ins) {
        showToast(
          'Un insumo del catálogo ya no está disponible. Revisá las filas.',
          'error',
        )
        return
      }

      const cantRaw = f.cantidad.trim().replace(',', '.')
      const cantIngresada = Number(cantRaw)
      const factor = factorPresentacionSeleccionada(ins, f.presentacionEmpaqueId)
      const cant = convertirCantidadAUnidadBase(cantIngresada, factor)
      if (tipoMovimiento === 'AJUSTE') {
        if (!Number.isFinite(cant) || cant === 0) continue
      } else if (!Number.isFinite(cant) || cant <= 0) {
        continue
      }

      if (tipoMovimiento === 'EGRESO') {
        if (!f.egresoLoteDefinido) {
          showToast(
            'Seleccioná el lote en cada fila de egreso con cantidad indicada.',
            'error',
          )
          return
        }
        const lotes = lotesDisponiblesParaEgreso(movimientosCentrales, idInsumo)
        const keySel = normalizarLoteKey(f.lote)
        const bucket = lotes.find((x) => x.loteKey === keySel)
        if (!bucket) {
          showToast(
            `Seleccioná un lote con stock para «${formatLabelInsumo(ins)}».`,
            'error',
          )
          return
        }
        const neto =
          bucket.stock -
          stockReservadoOtrasFilasEgreso(
            filas,
            idx,
            idInsumo,
            keySel,
            insumosById,
          )
        if (cant > neto + 1e-9) {
          showToast(
            `La cantidad en unidad base no puede superar el disponible del lote (${neto.toLocaleString('es-AR', { maximumFractionDigits: 4 })} ${ins.unidadBase}).`,
            'error',
          )
          return
        }
      }

      const nombreSnapshot = formatLabelInsumo(ins)
      const row: ItemMovimientoInventario = {
        insumoId: idInsumo,
        nombreSnapshot,
        cantidad: cant,
        controlCalidadOk: f.controlCalidadOk === true,
        costoPorUnidadBaseSnapshot: ins.costoPorUnidadBase,
      }
      if (factor !== 1 && Number.isFinite(cantIngresada)) {
        row.presentacionUsada = etiquetaPresentacionSeleccionada(
          ins,
          f.presentacionEmpaqueId,
        )
        row.cantidadOriginal = cantIngresada
        row.factorPresentacion = factor
      }

      const lote = f.lote.trim()
      if (lote) row.lote = lote

      const fv = f.fechaVencimiento.trim()
      if (fv) row.fechaVencimiento = fv

      const temp = f.temperatura.trim()
      if (temp) row.temperatura = temp

      payloadItems.push(row)
    }

    if (payloadItems.length === 0) {
      showToast(
        'Agregá al menos una fila con insumo del catálogo y cantidad válida.',
        'error',
      )
      return
    }

    setIsSubmitting(true)
    try {
      const fecha = parseFechaLocal(fechaOperacion)

      if (tipoMovimiento === 'EGRESO') {
        const transporte = requiereTransporte
          ? {
              chofer: chofer.trim(),
              patente: patente.trim().toUpperCase(),
              precinto: precinto.trim(),
            }
          : undefined

        const id = await crearMovimiento({
          tipo: 'EGRESO',
          fecha,
          destino: destino.trim(),
          numeroDocumento: numeroDocumento.trim(),
          ...(transporte ? { transporte } : {}),
          ...(egresoUbicacionDestinoExplicita
            ? { ubicacionDestino: egresoUbicacionDestinoExplicita }
            : {}),
          ...(egresoSolicitudId ? { solicitudId: egresoSolicitudId } : {}),
          items: payloadItems,
        })
        setRemitoReciente({
          id,
          tipo: 'EGRESO',
          fecha,
          destino: destino.trim(),
          numeroDocumento: numeroDocumento.trim(),
          ...(transporte ? { transporte } : {}),
          items: payloadItems,
        })
      } else if (tipoMovimiento === 'AJUSTE') {
        await crearMovimiento({
          tipo: 'AJUSTE',
          fecha,
          motivo: motivo.trim(),
          items: payloadItems,
        })
        setRemitoReciente(null)
      } else {
        await crearMovimiento({
          tipo: 'DECOMISO',
          fecha,
          motivo: motivo.trim(),
          items: payloadItems,
        })
        setRemitoReciente(null)
      }

      if (tipoMovimiento === 'EGRESO' && egresoSolicitudId) {
        showToast(
          `Egreso generado y solicitud ${egresoSolicitudId} marcada como enviada.`,
        )
      } else {
        showToast('Movimiento registrado correctamente.', 'success')
      }
      resetFormulario()
      setIsCreating(false)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo registrar el movimiento.',
        'error',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isCreating) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-gray-50">
        <header className="shrink-0 border-b border-neutral-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
                Movimientos de inventario
              </h1>
              <nav
                className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4"
                aria-label="Secciones movimientos"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={depositoVistaTab === 'historial'}
                  onClick={() => setDepositoVistaTab('historial')}
                  className={tabClass(depositoVistaTab === 'historial')}
                >
                  Historial de movimientos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={depositoVistaTab === 'solicitudes'}
                  onClick={() => setDepositoVistaTab('solicitudes')}
                  className={tabClass(depositoVistaTab === 'solicitudes')}
                >
                  Solicitudes pendientes
                </button>
              </nav>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/deposito/ingreso')}
                disabled={depositoVistaTab !== 'historial'}
                title={
                  depositoVistaTab !== 'historial'
                    ? 'Volvé al historial para registrar un ingreso'
                    : undefined
                }
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-xl leading-none">+</span>
                Nuevo ingreso
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                disabled={depositoVistaTab !== 'historial'}
                title={
                  depositoVistaTab !== 'historial'
                    ? 'Volvé al historial para registrar un movimiento nuevo'
                    : undefined
                }
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#CD1818]/30 bg-white px-6 text-base font-semibold text-[#CD1818] shadow-sm transition hover:bg-[#CD1818]/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Egreso / ajuste
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
          {depositoVistaTab === 'solicitudes' ? (
            <DepositoSolicitudesMercaderiaPanel />
          ) : (
            <>
              {remitoReciente ? (
            <div className="mb-5 rounded-xl border border-[#CD1818]/15 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CD1818]">
                    Remito listo
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[#171717]">
                    Egreso registrado correctamente
                  </h2>
                  <p className="mt-1 text-sm text-[#8997A6]">
                    Remito {remitoReciente.numeroDocumento || '—'} para{' '}
                    {remitoReciente.destino || '—'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <PdfActionsDropdown
                    movimiento={remitoReciente}
                    unidadesPorInsumoId={unidadesPorInsumoId}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-neutral-100 px-5 pt-4 sm:px-6">
              <div
                className="-mb-px flex gap-1 overflow-x-auto pb-0"
                role="tablist"
                aria-label="Filtrar por tipo"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFiltro === 'todos'}
                  onClick={() => setTabFiltro('todos')}
                  className={tabClass(tabFiltro === 'todos')}
                >
                  Todos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFiltro === 'ingresos'}
                  onClick={() => setTabFiltro('ingresos')}
                  className={tabClass(tabFiltro === 'ingresos')}
                >
                  Ingresos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFiltro === 'egresos'}
                  onClick={() => setTabFiltro('egresos')}
                  className={tabClass(tabFiltro === 'egresos')}
                >
                  Egresos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabFiltro === 'otros'}
                  onClick={() => setTabFiltro('otros')}
                  className={tabClass(tabFiltro === 'otros')}
                >
                  Otros
                </button>
              </div>
              <div className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.8fr))_auto] lg:items-end">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                    Buscar por documento / remito
                  </span>
                  <input
                    type="text"
                    value={queryDocumento}
                    onChange={(e) => setQueryDocumento(e.target.value)}
                    placeholder="Ej. 0001-00004567"
                    className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="mt-2 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => exportarMovimientosInventarioExcel(movimientosFiltrados)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-[#171717] shadow-sm transition hover:border-[#CD1818]/30 hover:text-[#CD1818]"
                >
                  Exportar Excel
                </button>
              </div>
              <p className="pb-3 text-xs text-[#8997A6]">
                {movimientosFiltrados.length}{' '}
                {movimientosFiltrados.length === 1
                  ? 'movimiento'
                  : 'movimientos'}{' '}
                en esta vista.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Detalle</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Ítems</th>
                    <th className="min-w-[120px] px-4 py-3 text-right">
                      Trazabilidad
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {movimientosFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-16 text-center text-[#8997A6]"
                      >
                        No hay movimientos en este filtro.
                      </td>
                    </tr>
                  ) : (
                    movimientosFiltrados.map((m) => (
                      <tr key={m.id} className="hover:bg-neutral-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                          {formatFechaHora(m.fecha)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#171717]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{etiquetaTipo(m.tipo)}</span>
                            {(() => {
                              const badge = badgeOrigenIngreso(m)
                              return badge ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ) : null
                            })()}
                          </div>
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-3 text-[#171717]">
                          {resumenMovimiento(m)}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-[#171717]">
                          {docResumen(m)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#171717]">
                          {m.items.length}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <PdfActionsDropdown
                              movimiento={m}
                              unidadesPorInsumoId={unidadesPorInsumoId}
                              compact
                            />
                            <button
                              type="button"
                              onClick={() => setDetalleModalId(m.id)}
                              className="text-sm font-medium text-[#CD1818] underline-offset-4 transition hover:underline"
                            >
                              Ver ítems
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}

        {movimientoDetalle ? (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mov-detalle-title"
          >
            <div className="flex max-h-[min(90vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="shrink-0 border-b border-neutral-100 px-5 py-4 sm:px-6">
                <h2
                  id="mov-detalle-title"
                  className="text-lg font-semibold text-[#CD1818]"
                >
                  Detalle del movimiento
                </h2>
                <p className="mt-1 text-sm text-[#8997A6]">
                  {formatFechaHora(movimientoDetalle.fecha)} ·{' '}
                  {etiquetaTipo(movimientoDetalle.tipo)}
                  {movimientoDetalle.tipo === 'INGRESO'
                    ? ` · ${movimientoDetalle.proveedor} · ${movimientoDetalle.tipoDocumento} ${movimientoDetalle.numeroDocumento}`
                    : null}
                  {(() => {
                    const badge = badgeOrigenIngreso(movimientoDetalle)
                    return badge ? ` · ${badge.label}` : null
                  })()}
                  {movimientoDetalle.tipo === 'EGRESO'
                    ? ` · ${movimientoDetalle.destino} · Doc. ${movimientoDetalle.numeroDocumento}${
                        movimientoDetalle.solicitudId
                          ? ` · Solicitud ${movimientoDetalle.solicitudId}`
                          : ''
                      }`
                    : null}
                  {(movimientoDetalle.tipo === 'AJUSTE' ||
                    movimientoDetalle.tipo === 'DECOMISO') &&
                  movimientoDetalle.motivo
                    ? ` · ${movimientoDetalle.motivo}`
                    : null}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
                {movimientoDetalle.tipo === 'EGRESO' ? (
                  <div className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Chofer
                      </p>
                      <p className="mt-1 font-semibold text-[#171717]">
                        {movimientoDetalle.transporte?.chofer || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Patente
                      </p>
                      <p className="mt-1 font-semibold text-[#171717]">
                        {movimientoDetalle.transporte?.patente || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Precinto
                      </p>
                      <p className="mt-1 font-semibold text-[#171717]">
                        {movimientoDetalle.transporte?.precinto || '—'}
                      </p>
                    </div>
                  </div>
                ) : null}

                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-[#8997A6]">
                      <th className="py-2 pr-3">Insumo (snapshot)</th>
                      <th className="py-2 pr-3">Cant.</th>
                      <th className="py-2 pr-3">Lote</th>
                      <th className="py-2 pr-3">Vto.</th>
                      <th className="py-2 pr-3">Temp.</th>
                      <th className="py-2 pr-3">Calidad</th>
                      {movimientoDetalle.tipo === 'INGRESO' ? (
                        <th className="py-2">Precio u.</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {movimientoDetalle.items.map((it, idx) => (
                      <tr key={`${it.insumoId}-${idx}`}>
                        <td className="py-2.5 pr-3 text-[#171717]">
                          {it.nombreSnapshot}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-[#171717]">
                          {it.cantidad}
                        </td>
                        <td className="py-2.5 pr-3 text-[#171717]">
                          {it.lote?.trim() || '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-[#171717]">
                          {formatVto(
                            typeof it.fechaVencimiento === 'string'
                              ? it.fechaVencimiento
                              : undefined,
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-[#171717]">
                          {it.temperatura?.trim() || '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-[#171717]">
                          {it.controlCalidadOk ? 'OK' : '—'}
                        </td>
                        {movimientoDetalle.tipo === 'INGRESO' ? (
                          <td className="py-2.5 tabular-nums text-[#171717]">
                            {it.precioUnitarioFacturado != null &&
                            it.precioUnitarioFacturado > 0
                              ? it.precioUnitarioFacturado.toLocaleString(
                                  'es-AR',
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 4,
                                  },
                                )
                              : '—'}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        exportarMovimientoInventarioPdf(
                          movimientoDetalle,
                          unidadesPorInsumoId,
                          'ADMINISTRATIVO',
                        )
                      }
                      className="min-h-10 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                    >
                      Descargar PDF
                    </button>
                    <PdfActionsDropdown
                      movimiento={movimientoDetalle}
                      unidadesPorInsumoId={unidadesPorInsumoId}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetalleModalId(null)}
                    className="min-h-10 rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-neutral-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-6 lg:px-8 xl:px-10">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            resetFormulario()
            setIsCreating(false)
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#CD1818] transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span aria-hidden>←</span>
          Volver al historial
        </button>
        <nav
          className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3"
          aria-label="Secciones movimientos"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className={tabClass(true)}
          >
            Historial de movimientos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            disabled={Boolean(egresoSolicitudId) || isSubmitting}
            title={
              egresoSolicitudId
                ? 'Completá o cancelá el egreso vinculado a la solicitud antes de cambiar de sección'
                : undefined
            }
            onClick={() => {
              if (!egresoSolicitudId && !isSubmitting) {
                resetFormulario()
                setIsCreating(false)
                setDepositoVistaTab('solicitudes')
              }
            }}
            className={`${tabClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Solicitudes pendientes
          </button>
        </nav>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-[#CD1818]">
          Nuevo movimiento
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#8997A6]">
          Egresos, ajustes y decomisos. Para ingresar mercadería usá{' '}
          <button
            type="button"
            onClick={() => navigate('/deposito/ingreso')}
            className="font-semibold text-[#CD1818] underline-offset-2 hover:underline"
          >
            Nuevo ingreso
          </button>
          .
        </p>
        {egresoSolicitudId ? (
          <p className="mt-3 rounded-lg border border-[#CD1818]/20 bg-[#CD1818]/5 px-3 py-2 text-sm text-[#171717]">
            Completando egreso desde solicitud{' '}
            <span className="font-mono text-xs">{egresoSolicitudId}</span>: el destino
            queda fijado; elegí los lotes en cada fila antes de guardar.
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <fieldset
          disabled={isSubmitting}
          className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0 disabled:opacity-[0.92]"
        >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-6 sm:px-6 sm:pb-36 lg:px-8 xl:px-10">
          <div className="w-full space-y-8">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <p className="mb-5 text-sm font-semibold text-[#CD1818]">
                Tipo y encabezado
              </p>
              <label className="mb-5 block max-w-md text-left">
                <span className="text-xs font-medium text-[#8997A6]">
                  Tipo de movimiento
                </span>
                <select
                  value={tipoMovimiento}
                  disabled={Boolean(egresoSolicitudId)}
                  onChange={(e) =>
                    setTipoMovimiento(e.target.value as TipoMovimientoInventario)
                  }
                  className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:bg-neutral-100"
                >
                  {TIPOS_MOV.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-left sm:col-span-2 lg:col-span-2">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Fecha del movimiento
                  </span>
                  <input
                    type="date"
                    required
                    value={fechaOperacion}
                    onChange={(e) => setFechaOperacion(e.target.value)}
                    className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                  />
                </label>

                {tipoMovimiento === 'EGRESO' ? (
                  <>
                    <label className="block text-left sm:col-span-2">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Destino
                      </span>
                      <select
                        value={destino}
                        disabled={egresoDestinoBloqueado}
                        onChange={(e) => setDestino(e.target.value)}
                        required
                        className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      >
                        {DESTINOS_EGRESO.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-left sm:col-span-2">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Número de documento
                      </span>
                      <input
                        type="text"
                        value={numeroDocumento}
                        onChange={(e) => setNumeroDocumento(e.target.value)}
                        required
                        className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                      />
                    </label>
                    {requiereTransporte ? (
                      <div className="sm:col-span-2 lg:col-span-4">
                        <div className="rounded-xl border border-[#CD1818]/15 bg-gray-50 p-5">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold text-[#CD1818]">
                              Datos de transporte obligatorios
                            </p>
                            <p className="text-sm text-[#8997A6]">
                              Este destino requiere remito de transporte con
                              chofer, patente y precinto.
                            </p>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-3">
                            <label className="block text-left">
                              <span className="text-xs font-medium text-[#8997A6]">
                                Nombre del chofer
                              </span>
                              <input
                                type="text"
                                value={chofer}
                                onChange={(e) => setChofer(e.target.value)}
                                required={requiereTransporte}
                                className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                                placeholder="Ej. Juan Perez"
                              />
                            </label>
                            <label className="block text-left">
                              <span className="text-xs font-medium text-[#8997A6]">
                                Patente del vehículo
                              </span>
                              <input
                                type="text"
                                value={patente}
                                onChange={(e) => setPatente(e.target.value.toUpperCase())}
                                required={requiereTransporte}
                                className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                                placeholder="AA123BB"
                              />
                            </label>
                            <label className="block text-left">
                              <span className="text-xs font-medium text-[#8997A6]">
                                Número de precinto
                              </span>
                              <input
                                type="text"
                                value={precinto}
                                onChange={(e) => setPrecinto(e.target.value)}
                                required={requiereTransporte}
                                className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                                placeholder="Ej. P-001245"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {(tipoMovimiento === 'AJUSTE' ||
                  tipoMovimiento === 'DECOMISO') && (
                  <label className="block text-left sm:col-span-2 lg:col-span-4">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Motivo
                    </span>
                    <input
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      required
                      className="mt-2 w-full min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                      placeholder={
                        tipoMovimiento === 'AJUSTE'
                          ? 'Ej. Corrección inventario físico'
                          : 'Ej. Producto vencido — acta Nº…'
                      }
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
              <p className="mb-1 text-sm font-semibold text-[#CD1818]">
                Ítems y trazabilidad
              </p>
              <p className="mb-5 text-sm text-[#8997A6]">
                {tipoMovimiento === 'EGRESO' ? (
                  <>
                    Insumo, cantidad, lote y temperatura; la fecha de
                    vencimiento queda registrada al elegir el lote (FEFO).
                  </>
                ) : (
                  <>
                    Insumo, cantidad, lote, vencimiento y temperatura.{' '}
                    {tipoMovimiento === 'AJUSTE'
                      ? 'En ajustes usá cantidad negativa para restar stock.'
                      : null}
                  </>
                )}
              </p>

              <div className="mb-5">
                <ModoPistolaBarra
                  activo={modoPistola}
                  onToggle={() => setModoPistola((v) => !v)}
                  disabled={isSubmitting}
                  hint={
                    tipoMovimiento === 'EGRESO'
                      ? 'Escaneá el EAN del envase: carga el insumo y el lote FEFO. Completá la cantidad.'
                      : 'Escaneá el EAN del envase para cargar el insumo en una fila.'
                  }
                />
              </div>

              <div
                className={`mb-3 hidden rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 md:grid md:text-[11px] md:font-semibold md:uppercase md:tracking-[0.16em] md:text-[#8997A6] ${itemGridClass}`}
              >
                {tipoMovimiento === 'EGRESO' ? (
                  <>
                    <span className="col-span-12 text-left md:col-span-4">
                      Insumo
                    </span>
                    <span className="col-span-12 text-center md:col-span-2">
                      Cant.
                    </span>
                    <span className="col-span-12 text-left md:col-span-4">
                      Lote
                    </span>
                    <span className="col-span-12 text-center md:col-span-1">
                      Temp.
                    </span>
                    <span className="col-span-12 text-center md:col-span-1">
                      CC
                    </span>
                  </>
                ) : (
                  <>
                    <span className="col-span-12 text-left md:col-span-4">
                      Insumo
                    </span>
                    <span className="col-span-12 text-center md:col-span-2">
                      Cant.
                    </span>
                    <span className="col-span-12 text-left md:col-span-2">
                      Lote
                    </span>
                    <span className="col-span-12 text-left md:col-span-2">
                      Vto.
                    </span>
                    <span className="col-span-12 text-center md:col-span-1">
                      Temp.
                    </span>
                    <span className="col-span-12 text-center md:col-span-1">
                      CC
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-5">
                {filas.map((fila, i) => {
                  const idInsumo = fila.insumoId
                  const ins = idInsumo ? insumosById.get(idInsumo) : undefined
                  const lotesRow =
                    tipoMovimiento === 'EGRESO' && idInsumo
                      ? (lotesPorInsumoEgreso.get(idInsumo) ?? [])
                      : []
                  const keySel = normalizarLoteKey(fila.lote)
                  const bucketSel =
                    tipoMovimiento === 'EGRESO' && fila.egresoLoteDefinido
                      ? lotesRow.find((x) => x.loteKey === keySel)
                      : undefined
                  const stockNetoEgreso =
                    tipoMovimiento === 'EGRESO' &&
                    idInsumo &&
                    bucketSel != null
                      ? bucketSel.stock -
                        stockReservadoOtrasFilasEgreso(
                          filas,
                          i,
                          idInsumo,
                          keySel,
                          insumosById,
                        )
                      : null

                  return (
                    <div
                      key={fila.key}
                      className={`rounded-xl border border-gray-200 bg-gray-50 p-5 shadow-sm md:p-4 ${itemGridClass}`}
                    >
                      <p className="col-span-12 mb-1 text-xs font-semibold uppercase tracking-wide text-[#8997A6] md:hidden">
                        Fila {i + 1}
                      </p>

                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <InsumoSearchSelect
                          compact
                          hideLabelOnDesktop
                          insumos={insumos}
                          selectedId={idInsumo}
                          selectedLabel={
                            fila.nombreSnapshot ||
                            (ins ? formatLabelInsumo(ins) : '')
                          }
                          onSelect={(sel) =>
                            actualizarFila(i, {
                              insumoId: sel.id,
                              nombreSnapshot: formatLabelInsumo(sel),
                              presentacionEmpaqueId: PRESENTACION_BASE_ID,
                              ...(tipoMovimiento === 'EGRESO'
                                ? {
                                    lote: '',
                                    fechaVencimiento: '',
                                    cantidad: '',
                                    egresoLoteDefinido: false,
                                  }
                                : {}),
                            })
                          }
                          onAfterSelect={() =>
                            queueMicrotask(() =>
                              cantidadInputRefs.current[fila.key]?.focus(),
                            )
                          }
                          onClear={() =>
                            actualizarFila(i, {
                              insumoId: null,
                              nombreSnapshot: '',
                              presentacionEmpaqueId: PRESENTACION_BASE_ID,
                              ...(tipoMovimiento === 'EGRESO'
                                ? {
                                    lote: '',
                                    fechaVencimiento: '',
                                    cantidad: '',
                                    egresoLoteDefinido: false,
                                  }
                                : {}),
                            })
                          }
                        />
                        {idInsumo && !ins ? (
                          <p className="mt-2 text-xs text-[#CD1818]">
                            Insumo no encontrado en el catálogo.
                          </p>
                        ) : null}
                        {tipoMovimiento === 'EGRESO' &&
                        idInsumo &&
                        ins &&
                        lotesRow.length === 0 ? (
                          <p className="mt-2 text-xs text-[#CD1818]">
                            No hay stock por lote para este insumo en el depósito central
                            (solo cuentan movimientos con ubicación CENTRAL). Incluyen ingresos,
                            ajustes y egresos previos por el mismo lote. Si el stock está en otra
                            sucursal o el ingreso no tiene lote, revisá inventario o los movimientos.
                          </p>
                        ) : null}
                      </div>

                      <PresentacionCantidadFields
                        insumo={ins}
                        cantidad={fila.cantidad}
                        presentacionEmpaqueId={fila.presentacionEmpaqueId}
                        onCantidadChange={(v) =>
                          actualizarFila(i, { cantidad: v })
                        }
                        onPresentacionChange={(id) =>
                          actualizarFila(i, { presentacionEmpaqueId: id })
                        }
                        cantidadInputRef={registerCantidadRef(fila.key)}
                        min={tipoMovimiento === 'AJUSTE' ? undefined : 0}
                        max={
                          tipoMovimiento === 'EGRESO' &&
                          stockNetoEgreso != null
                            ? stockNetoEgreso /
                              factorPresentacionSeleccionada(
                                ins,
                                fila.presentacionEmpaqueId,
                              )
                            : undefined
                        }
                        placeholder={
                          tipoMovimiento === 'AJUSTE' ? '+ / −' : '0'
                        }
                        required={Boolean(idInsumo)}
                        layout="inline"
                        maxHint={
                          tipoMovimiento === 'EGRESO' &&
                          stockNetoEgreso != null &&
                          ins
                            ? `Máx. en ${ins.unidadBase}: ${stockNetoEgreso.toLocaleString('es-AR', { maximumFractionDigits: 4 })}`
                            : null
                        }
                      />

                      {tipoMovimiento === 'EGRESO' ? (
                        <label className="col-span-12 block w-full min-w-0 text-left md:col-span-4">
                          <span className="text-xs font-medium text-[#8997A6] md:sr-only">
                            Lote
                          </span>
                          <select
                            value={
                              !fila.egresoLoteDefinido
                                ? EGRESO_SELECT_PENDING
                                : keySel === ''
                                  ? EGRESO_SELECT_SIN_LOTE
                                  : fila.lote.trim()
                            }
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === EGRESO_SELECT_PENDING) return
                              const persist =
                                v === EGRESO_SELECT_SIN_LOTE ? '' : v
                              const opt = lotesRow.find((o) =>
                                v === EGRESO_SELECT_SIN_LOTE
                                  ? o.loteKey === ''
                                  : o.loteKey === v,
                              )
                              actualizarFila(i, {
                                egresoLoteDefinido: true,
                                lote: persist,
                                fechaVencimiento:
                                  opt?.fechaVencimiento?.trim() ?? '',
                              })
                            }}
                            className={`${inputCompact} w-full`}
                            required={Boolean(idInsumo)}
                          >
                            <option value={EGRESO_SELECT_PENDING}>
                              Seleccioná lote (FEFO)…
                            </option>
                            {lotesRow.map((opt) => (
                              <option
                                key={opt.loteKey || '__sin_lote__'}
                                value={
                                  opt.loteKey === ''
                                    ? EGRESO_SELECT_SIN_LOTE
                                    : opt.loteKey
                                }
                              >
                                {formatoOpcionLote(opt)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label className="col-span-12 block w-full min-w-0 text-left md:col-span-2">
                          <span className="text-xs font-medium text-[#8997A6] md:sr-only">
                            Lote
                          </span>
                          <input
                            type="text"
                            value={fila.lote}
                            onChange={(e) =>
                              actualizarFila(i, { lote: e.target.value })
                            }
                            className={`${inputCompact} w-full`}
                            placeholder="—"
                          />
                        </label>
                      )}

                      {tipoMovimiento !== 'EGRESO' ? (
                        <label className="col-span-12 block w-full min-w-0 text-left md:col-span-2">
                          <span className="text-xs font-medium text-[#8997A6] md:sr-only">
                            Vto.
                          </span>
                          <input
                            type="date"
                            value={fila.fechaVencimiento}
                            onChange={(e) =>
                              actualizarFila(i, {
                                fechaVencimiento: e.target.value,
                              })
                            }
                            className={`${inputCompact} w-full`}
                          />
                        </label>
                      ) : null}

                      <label className="col-span-12 block w-full min-w-0 text-left md:col-span-1">
                        <span className="text-xs font-medium text-[#8997A6] md:sr-only">
                          Temp.
                        </span>
                        <input
                          type="text"
                          value={fila.temperatura}
                          onChange={(e) =>
                            actualizarFila(i, { temperatura: e.target.value })
                          }
                          className={`${inputCompact} w-full max-w-[5rem]`}
                          placeholder="°C"
                        />
                      </label>

                      <div className="col-span-12 flex items-center pb-1 md:col-span-1 md:justify-center md:pb-0">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#171717]">
                          <input
                            type="checkbox"
                            checked={fila.controlCalidadOk}
                            onChange={(e) =>
                              actualizarFila(i, {
                                controlCalidadOk: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-gray-300 text-[#CD1818] focus:ring-[#CD1818]/30"
                            title="Control de calidad OK"
                          />
                          <span className="md:hidden">Calidad OK</span>
                        </label>
                      </div>

                      <div className="col-span-12 flex justify-end border-t border-gray-100 pt-3 md:col-span-12 md:border-t-0 md:pt-0">
                        <button
                          type="button"
                          onClick={() => quitarFila(i)}
                          disabled={filas.length <= 1}
                          className="min-h-10 rounded-xl px-3 text-sm font-medium text-[#8997A6] underline-offset-2 transition hover:bg-white hover:text-[#CD1818] hover:underline disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <button
                  type="button"
                  onClick={agregarFila}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/10"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Agregar ítem
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 xl:px-10">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#8997A6]">
              {requiereTransporte
                ? 'Completá los datos del transporte y al menos un ítem válido para habilitar el remito.'
                : 'Completá el encabezado y al menos un ítem válido para confirmar el movimiento.'}
            </p>
            <button
              type="submit"
              disabled={isSubmitting || !formularioListoParaEnviar}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                'Confirmar movimiento'
              )}
            </button>
          </div>
        </div>
        </fieldset>
      </form>

    </div>
  )
}
