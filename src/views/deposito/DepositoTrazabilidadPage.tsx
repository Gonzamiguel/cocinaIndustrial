import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, Truck, Utensils, Warehouse } from 'lucide-react'
import {
  MOTIVO_EGRESO_CONSUMO_DIARIO,
  subscribeMovimientosInventario,
  opcionesHistorialAmplio,
  UBICACION_DEPOSITO_CENTRAL,
  ubicacionEfectivaMovimiento,
  type MovimientoEgreso,
  type MovimientoInventario,
} from '../../lib/movimientosInventario'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'

type EventoOrigen = {
  id: string
  fecha: Date | null
  proveedor: string
  documento: string
  cantidad: number
  vencimiento: string | null
  unidadBase: string
}

type EventoTraslado = {
  id: string
  fecha: Date | null
  cantidad: number
  unidadBase: string
  destinoTexto: string
  ubicacionDestino: string
  ubicacionDestinoLabel: string
  numeroDocumento: string
  transporte?: {
    chofer: string
    patente: string
    precinto: string
  }
}

type EventoRecepcion = {
  id: string
  fecha: Date | null
  cantidad: number
  unidadBase: string
  ubicacionId: string
  ubicacionLabel: string
  numeroDocumento: string
  egresoTrasladoOrigenId?: string
}

type EventoConsumo = {
  id: string
  fecha: Date | null
  cantidad: number
  unidadBase: string
  ubicacionLabel: string
  observaciones: string
}

type EventoDispersion = {
  id: string
  tipo: MovimientoInventario['tipo']
  fecha: Date | null
  titulo: string
  detalle: string
  cantidad: number
  unidadBase: string
  ubicacionLabel: string
  transporte?: {
    chofer: string
    patente: string
    precinto: string
  }
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function etiquetaUbicacion(ubicacionId: string): string {
  const u = ubicacionId.trim().toUpperCase()
  if (u === UBICACION_DEPOSITO_CENTRAL) return 'Depósito central'
  if (u === 'CASPOSO') return 'Campamento Casposo'
  return ubicacionId.trim() || '—'
}

function formatCantidad(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function formatCantidadUnidad(value: number, unidadBase: string): string {
  return `${formatCantidad(value)} ${unidadBase || 'Un'}`
}

function formatFechaHora(value: Date | null): string {
  if (!value) return 'Sin fecha'
  return value.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFecha(value: string | null): string {
  if (!value) return 'Sin fecha'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

function getDelta(tipo: MovimientoInventario['tipo'], cantidad: number): number {
  if (tipo === 'INGRESO') return Math.abs(cantidad)
  if (tipo === 'EGRESO' || tipo === 'DECOMISO') return -Math.abs(cantidad)
  return cantidad
}

function fechaMs(value: Date | null): number {
  return value?.getTime() ?? 0
}

function iconoEvento(tipo: 'origen' | 'stock' | 'dispersion') {
  if (tipo === 'origen') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 19V5" />
        <path d="m6.75 10.25 5.25-5.25 5.25 5.25" />
      </svg>
    )
  }
  if (tipo === 'stock') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4.75 7.75h14.5v10a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5v-10Z" />
        <path d="M8.5 7.75v-2a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 5v14" />
      <path d="m17.25 13.75-5.25 5.25-5.25-5.25" />
    </svg>
  )
}

function sortPorFechaAsc<T extends { fecha: Date | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => fechaMs(a.fecha) - fechaMs(b.fecha))
}

export function DepositoTrazabilidadPage() {
  const [searchParams] = useSearchParams()
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [loteInput, setLoteInput] = useState('')
  const [loteBuscado, setLoteBuscado] = useState('')

  useEffect(() => {
    return subscribeMovimientosInventario(
      setMovimientos,
      opcionesHistorialAmplio(50000),
    )
  }, [])

  useEffect(() => {
    return subscribeInsumos(setInsumos)
  }, [])

  useEffect(() => {
    const loteParam = searchParams.get('lote')?.trim() ?? ''
    if (!loteParam) return
    setLoteInput(loteParam)
    setLoteBuscado(loteParam)
  }, [searchParams])

  const insumosById = useMemo(() => {
    const map = new Map<string, Insumo>()
    for (const insumo of insumos) map.set(insumo.id, insumo)
    return map
  }, [insumos])

  const resultado = useMemo(() => {
    const loteNormalizado = normalizarTexto(loteBuscado)
    if (!loteNormalizado) return null

    const movimientosConLote = movimientos
      .map((movimiento) => {
        const itemsLote = movimiento.items.filter(
          (item) => normalizarTexto(item.lote ?? '') === loteNormalizado,
        )
        return itemsLote.length > 0 ? { movimiento, itemsLote } : null
      })
      .filter(
        (item): item is { movimiento: MovimientoInventario; itemsLote: MovimientoInventario['items'] } =>
          item !== null,
      )

    if (movimientosConLote.length === 0) {
      return {
        lote: loteBuscado.trim(),
        insumos: [] as string[],
        unidadesBase: [] as string[],
        origenes: [] as EventoOrigen[],
        traslados: [] as EventoTraslado[],
        recepciones: [] as EventoRecepcion[],
        otros: [] as EventoDispersion[],
        consumos: [] as EventoConsumo[],
        stockRemanenteGlobal: 0,
        totalIngresadoCentralOrigen: 0,
        totalConsumidoComandas: 0,
      }
    }

    const insumosSet = new Map<string, string>()
    const unidadesSet = new Map<string, string>()
    const origenes: EventoOrigen[] = []
    const traslados: EventoTraslado[] = []
    const recepciones: EventoRecepcion[] = []
    const otros: EventoDispersion[] = []
    const consumos: EventoConsumo[] = []
    let stockRemanenteGlobal = 0
    let totalIngresadoCentralOrigen = 0
    let totalConsumidoComandas = 0

    for (const { movimiento, itemsLote } of movimientosConLote) {
      let cantidadMovimiento = 0
      let vencimiento: string | null = null
      let unidadBase = 'Un'

      for (const item of itemsLote) {
        const cantidad = Number(item.cantidad)
        if (!Number.isFinite(cantidad)) continue

        const delta = getDelta(movimiento.tipo, cantidad)
        stockRemanenteGlobal += delta
        cantidadMovimiento += cantidad
        if (!vencimiento && typeof item.fechaVencimiento === 'string' && item.fechaVencimiento.trim()) {
          vencimiento = item.fechaVencimiento.trim()
        }

        const insumoCatalogo = insumosById.get(item.insumoId)
        const nombre = insumoCatalogo
          ? formatLabelInsumo(insumoCatalogo)
          : item.nombreSnapshot.trim() || 'Insumo sin nombre'
        insumosSet.set(normalizarTexto(nombre), nombre)

        const unidadItem = insumoCatalogo?.unidadBase?.trim() || 'Un'
        unidadBase = unidadItem
        unidadesSet.set(normalizarTexto(unidadItem), unidadItem)
      }

      const ub = ubicacionEfectivaMovimiento(movimiento)

      if (movimiento.tipo === 'INGRESO') {
        if (ub === UBICACION_DEPOSITO_CENTRAL) {
          totalIngresadoCentralOrigen += Math.abs(cantidadMovimiento)
          origenes.push({
            id: movimiento.id,
            fecha: movimiento.fecha,
            proveedor: movimiento.proveedor || 'Sin proveedor',
            documento: `${movimiento.tipoDocumento} ${movimiento.numeroDocumento}`.trim(),
            cantidad: Math.abs(cantidadMovimiento),
            vencimiento,
            unidadBase,
          })
        } else {
          recepciones.push({
            id: movimiento.id,
            fecha: movimiento.fecha,
            cantidad: Math.abs(cantidadMovimiento),
            unidadBase,
            ubicacionId: ub,
            ubicacionLabel: etiquetaUbicacion(ub),
            numeroDocumento: movimiento.numeroDocumento || '—',
            ...(movimiento.egresoTrasladoOrigenId
              ? { egresoTrasladoOrigenId: movimiento.egresoTrasladoOrigenId }
              : {}),
          })
        }
        continue
      }

      if (movimiento.tipo === 'EGRESO') {
        const eg = movimiento as MovimientoEgreso
        if (eg.motivo === MOTIVO_EGRESO_CONSUMO_DIARIO) {
          totalConsumidoComandas += Math.abs(cantidadMovimiento)
          consumos.push({
            id: movimiento.id,
            fecha: movimiento.fecha,
            cantidad: Math.abs(cantidadMovimiento),
            unidadBase,
            ubicacionLabel: etiquetaUbicacion(ub),
            observaciones: eg.observacionesComanda?.trim() || '—',
          })
          continue
        }
        if (ub === UBICACION_DEPOSITO_CENTRAL && eg.ubicacionDestino) {
          traslados.push({
            id: movimiento.id,
            fecha: movimiento.fecha,
            cantidad: Math.abs(cantidadMovimiento),
            unidadBase,
            destinoTexto: eg.destino || 'Destino no informado',
            ubicacionDestino: eg.ubicacionDestino,
            ubicacionDestinoLabel: etiquetaUbicacion(eg.ubicacionDestino),
            numeroDocumento: eg.numeroDocumento || '—',
            ...(eg.transporte ? { transporte: eg.transporte } : {}),
          })
          continue
        }

        const cantidadVisible = Math.abs(cantidadMovimiento)
        otros.push({
          id: movimiento.id,
          tipo: 'EGRESO',
          fecha: movimiento.fecha,
          titulo: `Egreso · ${etiquetaUbicacion(ub)}`,
          detalle: `${eg.destino || '—'} · Doc. ${eg.numeroDocumento || '—'}`,
          cantidad: cantidadVisible,
          unidadBase,
          ubicacionLabel: etiquetaUbicacion(ub),
          ...(eg.transporte ? { transporte: eg.transporte } : {}),
        })
        continue
      }

      if (movimiento.tipo === 'DECOMISO') {
        const cantidadVisible = Math.abs(cantidadMovimiento)
        otros.push({
          id: movimiento.id,
          tipo: 'DECOMISO',
          fecha: movimiento.fecha,
          titulo: `Decomiso · ${etiquetaUbicacion(ub)}`,
          detalle: movimiento.motivo || 'Sin observación',
          cantidad: cantidadVisible,
          unidadBase,
          ubicacionLabel: etiquetaUbicacion(ub),
        })
        continue
      }

      if (movimiento.tipo === 'AJUSTE') {
        otros.push({
          id: movimiento.id,
          tipo: 'AJUSTE',
          fecha: movimiento.fecha,
          titulo: `Ajuste · ${etiquetaUbicacion(ub)}`,
          detalle: movimiento.motivo || 'Sin observación',
          cantidad: cantidadMovimiento,
          unidadBase,
          ubicacionLabel: etiquetaUbicacion(ub),
        })
      }
    }

    sortPorFechaAsc(origenes)
    sortPorFechaAsc(traslados)
    sortPorFechaAsc(recepciones)
    sortPorFechaAsc(otros)
    sortPorFechaAsc(consumos)

    return {
      lote: loteBuscado.trim(),
      insumos: [...insumosSet.values()],
      unidadesBase: [...unidadesSet.values()],
      origenes,
      traslados,
      recepciones,
      otros,
      consumos,
      stockRemanenteGlobal,
      totalIngresadoCentralOrigen,
      totalConsumidoComandas,
    }
  }, [insumosById, loteBuscado, movimientos])

  const primeraFecha = resultado?.origenes[0]?.fecha ?? null
  const proveedores = useMemo(() => {
    if (!resultado) return []
    return [...new Set(resultado.origenes.map((item) => item.proveedor).filter(Boolean))]
  }, [resultado])
  const documentos = useMemo(() => {
    if (!resultado) return []
    return [...new Set(resultado.origenes.map((item) => item.documento).filter(Boolean))]
  }, [resultado])
  const unidadesBase = useMemo(() => {
    if (!resultado) return []
    return resultado.unidadesBase
  }, [resultado])
  const vencimientos = useMemo(() => {
    if (!resultado) return []
    return [...new Set(resultado.origenes.map((item) => item.vencimiento).filter(Boolean))]
  }, [resultado])
  const unidadPrincipal = unidadesBase.join(' / ') || 'Un'

  const hayActividadLote = useMemo(() => {
    if (!resultado) return false
    return (
      resultado.origenes.length > 0 ||
      resultado.traslados.length > 0 ||
      resultado.recepciones.length > 0 ||
      resultado.otros.length > 0 ||
      resultado.consumos.length > 0
    )
  }, [resultado])

  const ultimoConsumoId = useMemo(() => {
    if (!resultado || resultado.consumos.length === 0) return null
    return resultado.consumos[resultado.consumos.length - 1]?.id ?? null
  }, [resultado])

  function handleBuscar(e: FormEvent) {
    e.preventDefault()
    setLoteBuscado(loteInput.trim())
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-5 py-5 shadow-sm sm:px-8 xl:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-[#CD1818]">
          Reporte de trazabilidad (HACCP)
        </h1>
        <p className="mt-1 text-sm text-[#8997A6]">
          Rastreá el ciclo de vida del lote en todas las ubicaciones: central, traslados, recepción en
          campamentos y consumo final por comandas.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="mx-auto w-full max-w-4xl">
          <form
            onSubmit={handleBuscar}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="mx-auto max-w-2xl">
              <label className="block text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                  Número de lote
                </span>
                <input
                  type="text"
                  value={loteInput}
                  onChange={(e) => setLoteInput(e.target.value)}
                  placeholder="Ej. LT-2026-0045"
                  className="mt-3 w-full min-h-14 rounded-xl border border-gray-200 bg-white px-5 text-center text-base font-medium text-[#171717] shadow-sm outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10"
                />
              </label>
              <div className="mt-4 flex justify-center">
                <button
                  type="submit"
                  disabled={!loteInput.trim()}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#CD1818] px-7 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Rastrear lote
                </button>
              </div>
            </div>
          </form>

          {!loteBuscado ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-[#8997A6]">
                Ingresá un número de lote para visualizar su línea de tiempo HACCP.
              </p>
            </div>
          ) : resultado && !hayActividadLote ? (
            <div className="mt-6 rounded-xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-base font-semibold text-[#171717]">
                No se encontraron movimientos para el lote {resultado.lote}.
              </p>
              <p className="mt-2 text-sm text-[#8997A6]">
                Verificá el número ingresado o revisá si el lote fue registrado en los movimientos de inventario.
              </p>
            </div>
          ) : resultado ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8997A6]">
                  Lote rastreado
                </p>
                <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#CD1818]">
                      {resultado.lote}
                    </h2>
                    <p className="mt-1 text-sm text-[#8997A6]">
                      {resultado.insumos.length} insumo{resultado.insumos.length === 1 ? '' : 's'}{' '}
                      asociado{resultado.insumos.length === 1 ? '' : 's'}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {resultado.insumos.map((insumo) => (
                      <span
                        key={insumo}
                        className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-[#171717]"
                      >
                        {insumo}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CD1818]">
                    Balance de lote
                  </p>
                  <p className="mt-1 text-xs text-[#8997A6]">
                    Red global (central + campamentos). El stock remanente es la suma algebraica de todos los
                    movimientos del lote.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Stock remanente
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold tabular-nums ${
                          resultado.stockRemanenteGlobal <= 0 ? 'text-[#CD1818]' : 'text-[#171717]'
                        }`}
                      >
                        {formatCantidadUnidad(resultado.stockRemanenteGlobal, unidadPrincipal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Total ingresado (central)
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-[#171717]">
                        {formatCantidadUnidad(resultado.totalIngresadoCentralOrigen, unidadPrincipal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Total consumido (comandas)
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-[#171717]">
                        {formatCantidadUnidad(resultado.totalConsumidoComandas, unidadPrincipal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#8997A6]">
                        Eventos registrados
                      </p>
                      <p className="mt-1 text-xl font-bold text-[#171717]">
                        {(
                          resultado.origenes.length +
                          resultado.traslados.length +
                          resultado.recepciones.length +
                          resultado.otros.length +
                          resultado.consumos.length
                        ).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ml-4 border-l-2 border-gray-200 pl-6">
                <div className="relative pb-6">
                  <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                  <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    {resultado.origenes.length > 0 ? (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="inline-flex items-center gap-2 text-[#CD1818]">
                              {iconoEvento('origen')}
                              <span className="font-bold">Origen · Depósito central</span>
                            </p>
                            <p className="mt-2 text-sm text-[#8997A6]">
                              Primer ingreso central: {formatFechaHora(primeraFecha)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-wide text-[#8997A6]">
                              Suma ingresos central
                            </p>
                            <p className="mt-1 text-lg font-semibold text-[#171717]">
                              {formatCantidadUnidad(resultado.totalIngresadoCentralOrigen, unidadPrincipal)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-sm text-[#8997A6]">Proveedor</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {proveedores.length > 0 ? proveedores.join(' · ') : 'Sin proveedor'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Remito / Factura</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {documentos.length > 0 ? documentos.join(' · ') : 'Sin documento'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Fecha de vencimiento</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {vencimientos.length > 0
                                ? vencimientos.map((item) => formatFecha(item)).join(' · ')
                                : 'Sin fecha'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Movimientos de ingreso central</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {resultado.origenes.length.toLocaleString('es-AR')}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="inline-flex items-center gap-2 text-[#CD1818]">
                          {iconoEvento('origen')}
                          <span className="font-bold">Origen · Depósito central</span>
                        </p>
                        <p className="mt-3 text-sm text-[#8997A6]">
                          No hay movimientos de ingreso en central para este número de lote. El ciclo puede
                          haber iniciado en otra ubicación o con datos históricos sin trazabilidad en central.
                        </p>
                      </>
                    )}
                  </article>
                </div>

                {resultado.traslados.map((t) => (
                  <div key={t.id} className="relative pb-6">
                    <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                      <p className="inline-flex items-center gap-2 text-[#CD1818]">
                        <Truck className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span className="font-bold">Traslado desde central</span>
                      </p>
                      <p className="mt-2 text-sm text-[#8997A6]">{formatFechaHora(t.fecha)}</p>
                      <p className="mt-3 text-sm text-[#8997A6]">Destino</p>
                      <p className="mt-1 font-medium text-[#171717]">
                        {t.destinoTexto} → <span className="text-[#CD1818]">{t.ubicacionDestinoLabel}</span>
                      </p>
                      <p className="mt-2 text-xs text-[#8997A6]">Doc. {t.numeroDocumento}</p>
                      <div className="mt-4 flex flex-wrap justify-end">
                        <div className="rounded-xl bg-gray-50 px-4 py-3 text-right">
                          <p className="text-sm text-[#8997A6]">Cantidad enviada</p>
                          <p className="mt-1 text-lg font-semibold text-[#171717]">
                            {formatCantidadUnidad(t.cantidad, t.unidadBase)}
                          </p>
                        </div>
                      </div>
                      {t.transporte ? (
                        <div className="mt-3 flex flex-col gap-4 rounded-lg bg-gray-100 p-3 text-sm sm:flex-row">
                          <div>
                            <p className="text-sm text-[#8997A6]">Chofer</p>
                            <p className="mt-1 font-medium text-[#171717]">{t.transporte.chofer || '—'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Patente</p>
                            <p className="mt-1 font-medium text-[#171717]">{t.transporte.patente || '—'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Precinto</p>
                            <p className="mt-1 font-medium text-[#171717]">{t.transporte.precinto || '—'}</p>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </div>
                ))}

                {resultado.recepciones.map((r) => (
                  <div key={r.id} className="relative pb-6">
                    <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                      <p className="inline-flex items-center gap-2 text-[#CD1818]">
                        <Warehouse className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span className="font-bold">Recepción en destino</span>
                      </p>
                      <p className="mt-2 text-sm text-[#8997A6]">{formatFechaHora(r.fecha)}</p>
                      <p className="mt-3 text-sm text-[#8997A6]">Ubicación</p>
                      <p className="mt-1 font-medium text-[#171717]">{r.ubicacionLabel}</p>
                      <p className="mt-2 text-xs text-[#8997A6]">
                        Doc. {r.numeroDocumento}
                        {r.egresoTrasladoOrigenId
                          ? ` · Cierra traslado (${r.egresoTrasladoOrigenId.slice(0, 8)}…)`
                          : ''}
                      </p>
                      <div className="mt-4 flex justify-end">
                        <div className="rounded-xl bg-gray-50 px-4 py-3 text-right">
                          <p className="text-sm text-[#8997A6]">Cantidad recibida</p>
                          <p className="mt-1 text-lg font-semibold text-[#171717]">
                            {formatCantidadUnidad(r.cantidad, r.unidadBase)}
                          </p>
                        </div>
                      </div>
                    </article>
                  </div>
                ))}

                {resultado.otros.map((evento) => (
                  <div key={evento.id} className="relative pb-6">
                    <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="inline-flex items-center gap-2 text-[#CD1818]">
                            {iconoEvento('dispersion')}
                            <span className="font-bold">{evento.titulo}</span>
                          </p>
                          <p className="mt-2 text-sm text-[#8997A6]">{formatFechaHora(evento.fecha)}</p>
                          <p className="mt-1 text-xs text-[#8997A6]">{evento.ubicacionLabel}</p>
                          <p className="mt-3 text-sm text-[#8997A6]">Detalle</p>
                          <p className="mt-1 font-medium text-[#171717]">{evento.detalle}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-4 py-3">
                          <p className="text-sm text-[#8997A6]">Cantidad</p>
                          <p className="mt-1 text-lg font-medium text-[#171717]">
                            {evento.tipo === 'AJUSTE' && evento.cantidad > 0 ? '+' : ''}
                            {formatCantidadUnidad(evento.cantidad, evento.unidadBase)}
                          </p>
                        </div>
                      </div>
                      {evento.transporte ? (
                        <div className="mt-3 flex flex-col gap-4 rounded-lg bg-gray-100 p-3 text-sm sm:flex-row">
                          <div>
                            <p className="text-sm text-[#8997A6]">Chofer</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {evento.transporte.chofer || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Patente</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {evento.transporte.patente || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-[#8997A6]">Precinto</p>
                            <p className="mt-1 font-medium text-[#171717]">
                              {evento.transporte.precinto || '—'}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  </div>
                ))}

                <div className="relative pb-2">
                  <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                  <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-base font-bold text-[#CD1818]">
                      <Utensils className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                      Consumo en sitio (comandas)
                    </p>
                    <p className="mt-1 text-sm text-[#8997A6]">
                      Egresos con motivo consumo diario en campamento u otra sucursal.
                    </p>

                    {resultado.consumos.length === 0 ? (
                      <p className="mt-4 text-sm text-[#8997A6]">
                        Sin comandas registradas para este lote.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {resultado.consumos.map((c) => {
                          const esCierre =
                            resultado.stockRemanenteGlobal <= 0 &&
                            c.id === ultimoConsumoId
                          return (
                            <article
                              key={c.id}
                              className={`rounded-xl border bg-white p-4 shadow-sm ${
                                esCierre
                                  ? 'border-[#CD1818] ring-2 ring-[#CD1818]/25 ring-offset-2 ring-offset-white'
                                  : 'border-gray-100'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  <CheckCircle
                                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                                      esCierre ? 'text-[#CD1818]' : 'text-[#8997A6]'
                                    }`}
                                    strokeWidth={1.75}
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#171717]">
                                      Consumo · {formatFechaHora(c.fecha)}
                                    </p>
                                    <p className="mt-1 text-xs text-[#8997A6]">
                                      Ubicación:{' '}
                                      <span className="font-medium text-[#171717]">{c.ubicacionLabel}</span>
                                    </p>
                                    <p className="mt-2 text-sm text-[#8997A6]">Observaciones</p>
                                    <p className="mt-0.5 text-sm font-medium text-[#171717]">{c.observaciones}</p>
                                  </div>
                                </div>
                                <div className="rounded-xl bg-gray-50 px-4 py-2 text-right">
                                  <p className="text-xs text-[#8997A6]">Cantidad</p>
                                  <p className="mt-0.5 text-base font-bold tabular-nums text-[#171717]">
                                    {formatCantidadUnidad(c.cantidad, c.unidadBase)}
                                  </p>
                                </div>
                              </div>
                              {esCierre ? (
                                <p className="mt-3 rounded-lg bg-[#CD1818]/8 px-3 py-2 text-center text-xs font-semibold text-[#CD1818]">
                                  Ciclo de vida del lote finalizado · stock remanente en red igual a cero
                                </p>
                              ) : null}
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {resultado.traslados.length === 0 &&
                resultado.recepciones.length === 0 &&
                resultado.otros.length === 0 &&
                resultado.consumos.length === 0 &&
                resultado.origenes.length > 0 ? (
                  <div className="relative pb-2">
                    <span className="absolute -left-[2.1rem] top-6 h-3.5 w-3.5 rounded-full bg-[#CD1818]" />
                    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                      <p className="font-bold text-[#CD1818]">Sin otros movimientos</p>
                      <p className="mt-2 text-sm text-[#8997A6]">
                        Este lote solo registra ingreso en central; aún no hay traslados, recepciones en destino,
                        ajustes ni comandas para el mismo número de lote.
                      </p>
                    </article>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
