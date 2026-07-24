import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ClipboardList,
  Download,
  Factory,
  PackageCheck,
  Search,
  Truck,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import {
  filtrarDespachosPorProduccionId,
  subscribeDespachosViandas,
  type DespachoViandaRegistro,
} from '../../lib/despachosViandas'
import {
  fetchProduccionCocinaById,
  opcionesHistorialAmplio,
  subscribeMovimientosInventario,
  subscribeProduccionCocinaRegistros,
  type MovimientoInventario,
  type ProduccionCocinaRegistro,
} from '../../lib/movimientosInventario'
import {
  subscribeSolicitudesMercaderia,
  type SolicitudMercaderia,
} from '../../lib/solicitudesMercaderia'
import { exportarTrazabilidadViandaPdf } from '../../lib/trazabilidadViandaPdf'
import {
  construirTimelineVianda,
  ETIQUETA_TIPO_PASO,
  formatFechaHoraTrazabilidadVianda,
  type PasoTrazabilidadVianda,
  type TipoPasoTrazabilidadVianda,
} from '../../lib/trazabilidadVianda'

function buscarProduccion(
  producciones: ProduccionCocinaRegistro[],
  q: string,
): ProduccionCocinaRegistro | null {
  const term = q.trim().toLowerCase()
  if (!term) return null
  const byId = producciones.find((p) => p.id === q.trim())
  if (byId) return byId
  return (
    producciones.find(
      (p) =>
        p.loteProducto.toLowerCase() === term ||
        p.codigoTrazabilidad.toLowerCase() === term ||
        p.loteProducto.toLowerCase().includes(term) ||
        p.codigoTrazabilidad.toLowerCase().includes(term),
    ) ?? null
  )
}

function iconoPaso(tipo: TipoPasoTrazabilidadVianda) {
  const cls = 'h-4 w-4'
  switch (tipo) {
    case 'INGRESO_CENTRAL':
      return <ArrowDownToLine className={cls} aria-hidden />
    case 'SOLICITUD_COCINA':
      return <ClipboardList className={cls} aria-hidden />
    case 'TRASLADO_SALIDA':
    case 'DESPACHO_EMPRESA':
      return <Truck className={cls} aria-hidden />
    case 'RECEPCION_COCINA':
      return <PackageCheck className={cls} aria-hidden />
    case 'PRODUCCION_VIANDA':
      return <Factory className={cls} aria-hidden />
    default:
      return <AlertCircle className={cls} aria-hidden />
  }
}

function estiloPaso(tipo: TipoPasoTrazabilidadVianda): string {
  switch (tipo) {
    case 'INGRESO_CENTRAL':
      return 'bg-slate-100 text-slate-800 ring-slate-200'
    case 'SOLICITUD_COCINA':
      return 'bg-blue-50 text-blue-900 ring-blue-200'
    case 'TRASLADO_SALIDA':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    case 'RECEPCION_COCINA':
      return 'bg-emerald-50 text-emerald-900 ring-emerald-200'
    case 'PRODUCCION_VIANDA':
      return 'bg-[#CD1818]/10 text-[#CD1818] ring-[#CD1818]/20'
    case 'DESPACHO_EMPRESA':
      return 'bg-violet-50 text-violet-900 ring-violet-200'
    default:
      return 'bg-gray-100 text-gray-600 ring-gray-200'
  }
}

function PasoTimelineCard({ paso, indice }: { paso: PasoTrazabilidadVianda; indice: number }) {
  return (
    <article className="relative">
      <span
        className={`absolute -left-[1.85rem] flex h-8 w-8 items-center justify-center rounded-full ring-1 ${estiloPaso(paso.tipo)}`}
      >
        {iconoPaso(paso.tipo)}
      </span>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8997A6]">
              {indice}. {ETIQUETA_TIPO_PASO[paso.tipo]}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-[#171717]">{paso.titulo}</h3>
          </div>
          <time className="shrink-0 text-xs text-[#8997A6]">
            {formatFechaHoraTrazabilidadVianda(paso.fecha)}
          </time>
        </div>
        <p className="mt-2 text-sm text-[#8997A6]">{paso.detalle}</p>
        {paso.insumoNombre || paso.loteInsumo || paso.cantidadTexto ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {paso.insumoNombre ? (
              <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-[#171717] ring-1 ring-gray-200">
                {paso.insumoNombre}
              </span>
            ) : null}
            {paso.loteInsumo ? (
              <span className="rounded-full bg-gray-50 px-2.5 py-0.5 font-mono text-xs text-[#171717] ring-1 ring-gray-200">
                Lote {paso.loteInsumo}
              </span>
            ) : null}
            {paso.cantidadTexto ? (
              <span className="rounded-full bg-[#CD1818]/8 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#CD1818] ring-1 ring-[#CD1818]/15">
                {paso.cantidadTexto}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function AdminTrazabilidadViandaPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [producciones, setProducciones] = useState<ProduccionCocinaRegistro[]>([])
  const [despachos, setDespachos] = useState<DespachoViandaRegistro[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudMercaderia[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [seleccionada, setSeleccionada] = useState<ProduccionCocinaRegistro | null>(null)
  const [cargandoId, setCargandoId] = useState(false)

  const paramProduccionId = searchParams.get('produccionId')?.trim() ?? ''
  const paramLote = searchParams.get('lote')?.trim() ?? ''
  const paramCodigo = searchParams.get('codigo')?.trim() ?? ''

  useEffect(() => subscribeProduccionCocinaRegistros(setProducciones, 500), [])
  useEffect(() => subscribeDespachosViandas(setDespachos, 400), [])
  useEffect(
    () => subscribeMovimientosInventario(setMovimientos, opcionesHistorialAmplio(8000)),
    [],
  )
  useEffect(() => subscribeSolicitudesMercaderia(setSolicitudes), [])

  useEffect(() => {
    const q = paramProduccionId || paramLote || paramCodigo
    if (!q) return
    setBusqueda(q)
  }, [paramProduccionId, paramLote, paramCodigo])

  useEffect(() => {
    async function resolver() {
      const q = paramProduccionId || paramLote || paramCodigo || busqueda.trim()
      if (!q) {
        setSeleccionada(null)
        return
      }

      if (paramProduccionId) {
        setCargandoId(true)
        try {
          const directa = await fetchProduccionCocinaById(paramProduccionId)
          if (directa) {
            setSeleccionada(directa)
            return
          }
        } finally {
          setCargandoId(false)
        }
      }

      setSeleccionada(buscarProduccion(producciones, q))
    }
    void resolver()
  }, [paramProduccionId, paramLote, paramCodigo, busqueda, producciones])

  const timeline = useMemo(() => {
    if (!seleccionada) return []
    return construirTimelineVianda({
      produccion: seleccionada,
      movimientos,
      solicitudes,
      despachos,
    })
  }, [seleccionada, movimientos, solicitudes, despachos])

  const despachosCount = useMemo(
    () =>
      seleccionada ? filtrarDespachosPorProduccionId(despachos, seleccionada.id).length : 0,
    [despachos, seleccionada],
  )

  function handleBuscar(e: FormEvent) {
    e.preventDefault()
    const q = busqueda.trim()
    if (!q) return
    setSearchParams({ produccionId: q })
  }

  function handleDescargarPdf() {
    if (!seleccionada || timeline.length === 0) return
    try {
      exportarTrazabilidadViandaPdf(seleccionada, timeline)
      showToast('PDF de trazabilidad generado.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo generar el PDF.', 'error')
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/admin/menu')}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#8997A6] hover:text-[#CD1818]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a gestión de menú
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818] sm:text-2xl">
          Trazabilidad de viandas
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#8997A6]">
          Cadena HACCP desde el ingreso de insumos en central, solicitud y traslado a cocina,
          producción de este lote y despacho al cliente final.
        </p>
        <form onSubmit={handleBuscar} className="mt-4 flex max-w-xl flex-wrap gap-2">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Lote vianda, código QR o ID de producción…"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white hover:brightness-105"
          >
            <Search className="h-4 w-4" aria-hidden />
            Buscar
          </button>
        </form>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        {cargandoId ? (
          <p className="text-sm text-[#8997A6]">Cargando producción…</p>
        ) : !seleccionada ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-[#8997A6]">
            Buscá por lote de producción (ej. P-20260524-CARNE), código de etiqueta o ID interno.
          </p>
        ) : (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8997A6]">
                Lote de vianda rastreado
              </p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[#171717]">{seleccionada.nombreProducto}</p>
                  <p className="mt-1 font-mono text-sm text-[#CD1818]">{seleccionada.loteProducto}</p>
                  <p className="mt-1 text-sm text-[#8997A6]">
                    {seleccionada.cantidadPorciones} viandas · Receta {seleccionada.recetaNombre} ·
                    Vto {seleccionada.fechaVencimiento}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right text-xs text-[#8997A6]">
                  <p>Producido {formatFechaHoraTrazabilidadVianda(seleccionada.fecha)}</p>
                  <p>
                    {despachosCount > 0
                      ? `${despachosCount} remito${despachosCount === 1 ? '' : 's'}`
                      : 'Sin despachos aún'}
                  </p>
                  <button
                    type="button"
                    onClick={handleDescargarPdf}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#CD1818]/25 bg-white px-3 text-xs font-semibold text-[#CD1818] hover:bg-[#CD1818]/5"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Descargar PDF
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                Leyenda del recorrido
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {(
                  [
                    'INGRESO_CENTRAL',
                    'SOLICITUD_COCINA',
                    'TRASLADO_SALIDA',
                    'RECEPCION_COCINA',
                    'PRODUCCION_VIANDA',
                    'DESPACHO_EMPRESA',
                  ] as TipoPasoTrazabilidadVianda[]
                ).map((t) => (
                  <span
                    key={t}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ring-1 ${estiloPaso(t)}`}
                  >
                    {iconoPaso(t)}
                    {ETIQUETA_TIPO_PASO[t]}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#CD1818]">
                Línea de tiempo (cronológica · despacho al final)
              </h2>
              <div className="relative ml-4 space-y-6 border-l-2 border-[#CD1818]/20 pl-6">
                {timeline.map((paso, idx) => (
                  <PasoTimelineCard key={paso.id} paso={paso} indice={idx + 1} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
