import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  History,
  Loader2,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getDb } from '../../lib/firebase'
import {
  anularLiquidacion,
  emitirLiquidacion,
  ETIQUETAS_CONCEPTO_LIQUIDACION,
  generarPreviewLiquidacion,
} from '../../lib/facturacion'
import { subscribeLiquidacionesContratistas } from '../../lib/facturacionQueries'
import {
  estiloBadgeEstadoLiquidacion,
  formatFechaLiquidacion,
  formatMonedaLiquidacion,
  formatYmdLegible,
  mensajeErrorFacturacion,
  parsePrecioInput,
} from '../../lib/facturacionUi'
import { subscribePadronEmpresas } from '../../lib/padronEmpresas'
import { nombreUsuarioFromAuth } from '../../lib/tesoreriaUi'
import type { PadronEmpresa } from '../../types/padronEmpresa'
import type {
  ConceptoLiquidacion,
  LiquidacionContratista,
  ListaPreciosContratista,
  PreviewLiquidacionContratista,
} from '../../types/facturacion'
import { CONCEPTOS_WIZARD_LIQUIDACION } from '../../types/facturacion'

type TabId = 'historial' | 'nueva'

const NAVY = '#1e3a5f'
const ORANGE = '#ea580c'

const inputClass =
  'w-full min-h-11 rounded-xl border border-[#1e3a5f]/20 bg-white px-3 text-sm text-[#1e3a5f] outline-none transition focus:border-[#1e3a5f]/50 focus:ring-2 focus:ring-[#1e3a5f]/10'
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]/70'
const cardClass = 'rounded-2xl border border-[#1e3a5f]/12 bg-white p-4 shadow-sm sm:p-6'

function primerDiaMesAnterior(): string {
  const hoy = new Date()
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-01`
}

function ultimoDiaMesAnterior(): string {
  const hoy = new Date()
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function BadgeEstado({ estado }: { estado: LiquidacionContratista['estado'] }) {
  const { className } = estiloBadgeEstadoLiquidacion(estado)
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${className}`}>
      {estado}
    </span>
  )
}

export function LiquidacionesPage() {
  const { user, rol } = useAuth()
  const { showToast } = useToast()
  const puedeOperar = rol === 'gerencia'

  const [tab, setTab] = useState<TabId>('historial')
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionContratista[]>([])
  const [empresas, setEmpresas] = useState<PadronEmpresa[]>([])
  const [cargando, setCargando] = useState(true)
  const [anulandoId, setAnulandoId] = useState<string | null>(null)

  // Wizard state
  const [paso, setPaso] = useState(1)
  const [empresaId, setEmpresaId] = useState('')
  const [fechaInicio, setFechaInicio] = useState(primerDiaMesAnterior())
  const [fechaFin, setFechaFin] = useState(ultimoDiaMesAnterior())
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [ivaPct, setIvaPct] = useState('21')
  const [preview, setPreview] = useState<PreviewLiquidacionContratista | null>(null)
  const [generandoPreview, setGenerandoPreview] = useState(false)
  const [emitiendo, setEmitiendo] = useState(false)

  useEffect(() => {
    let pending = 2
    const done = () => {
      pending -= 1
      if (pending <= 0) setCargando(false)
    }
    setCargando(true)
    const unsubs = [
      subscribeLiquidacionesContratistas((rows) => {
        setLiquidaciones(rows)
        done()
      }),
      subscribePadronEmpresas((rows) => {
        setEmpresas(rows)
        done()
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const liquidacionesVisibles = useMemo(
    () => liquidaciones.filter((l) => l.estado === 'EMITIDA' || l.estado === 'ANULADA'),
    [liquidaciones],
  )

  function buildListaPrecios(): ListaPreciosContratista {
    const netoPorConcepto: Partial<Record<ConceptoLiquidacion, number>> = {}
    for (const c of CONCEPTOS_WIZARD_LIQUIDACION) {
      const v = parsePrecioInput(precios[c] ?? '')
      if (v > 0) netoPorConcepto[c] = v
    }
    return {
      netoPorConcepto,
      alicuotaIvaPct: parsePrecioInput(ivaPct) || 21,
    }
  }

  function resetWizard() {
    setPaso(1)
    setPreview(null)
    setEmpresaId('')
    setFechaInicio(primerDiaMesAnterior())
    setFechaFin(ultimoDiaMesAnterior())
    setPrecios({})
    setIvaPct('21')
  }

  async function handleGenerarPreview() {
    if (!empresaId || !fechaInicio || !fechaFin) {
      showToast('Completá empresa y rango de fechas.', 'error')
      return
    }
    setGenerandoPreview(true)
    setPreview(null)
    try {
      const result = await generarPreviewLiquidacion(
        getDb(),
        empresaId,
        fechaInicio,
        fechaFin,
        buildListaPrecios(),
      )
      setPreview(result)
      setPaso(3)
      showToast('Vista previa generada.', 'success')
    } catch (err) {
      showToast(mensajeErrorFacturacion(err), 'error')
    } finally {
      setGenerandoPreview(false)
    }
  }

  async function handleEmitir() {
    if (!user || !preview || !empresaId) return
    setEmitiendo(true)
    try {
      const result = await emitirLiquidacion(getDb(), {
        empresaId,
        fechaInicio,
        fechaFin,
        listaPrecios: buildListaPrecios(),
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
      })
      showToast(
        `Liquidación ${result.numero} emitida. ${result.registrosMarcados + result.pernoctesMarcados} consumos bloqueados.`,
        'success',
      )
      resetWizard()
      setTab('historial')
    } catch (err) {
      showToast(mensajeErrorFacturacion(err), 'error')
    } finally {
      setEmitiendo(false)
    }
  }

  async function handleAnular(liq: LiquidacionContratista) {
    if (!user || !puedeOperar || liq.estado !== 'EMITIDA') return
    const motivo = window.prompt('Motivo de anulación (opcional):') ?? ''
    if (!window.confirm(`¿Anular la liquidación ${liq.numero}? Se revertirá el saldo y se desbloquearán los consumos.`)) {
      return
    }
    setAnulandoId(liq.id)
    try {
      const result = await anularLiquidacion(getDb(), {
        liquidacionId: liq.id,
        usuarioUid: user.uid,
        usuarioNombre: nombreUsuarioFromAuth(user),
        motivoAnulacion: motivo.trim() || undefined,
      })
      showToast(
        `${result.numero} anulada. ${result.consumosDesbloqueados} consumos desbloqueados.`,
        'success',
      )
    } catch (err) {
      showToast(mensajeErrorFacturacion(err), 'error')
    } finally {
      setAnulandoId(null)
    }
  }

  const tabClass = (active: boolean) =>
    `inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition sm:flex-none sm:px-6 ${
      active
        ? 'bg-[#1e3a5f] text-white shadow-sm'
        : 'bg-white text-[#1e3a5f] ring-1 ring-[#1e3a5f]/15 hover:bg-[#1e3a5f]/5'
    }`

  const pasoIndicator = (n: number, label: string) => {
    const active = paso === n
    const done = paso > n
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            active || done
              ? 'bg-[#1e3a5f] text-white'
              : 'bg-[#1e3a5f]/10 text-[#1e3a5f]/50'
          }`}
        >
          {n}
        </span>
        <span
          className={`hidden truncate text-xs font-medium sm:block ${
            active ? 'text-[#1e3a5f]' : 'text-[#1e3a5f]/50'
          }`}
        >
          {label}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-[#1e3a5f]/10 bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#1e3a5f]/60">
            Finanzas / Cuentas por cobrar
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: NAVY }}>
            Liquidaciones a contratistas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#1e3a5f]/70">
            {puedeOperar
              ? 'Agrupá consumos de comedor y hotelería, emití pre-facturas y gestioná la cuenta corriente.'
              : 'Consulta de liquidaciones emitidas a contratistas.'}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={tabClass(tab === 'historial')} onClick={() => setTab('historial')}>
              <History className="h-4 w-4" aria-hidden />
              Historial
            </button>
            {puedeOperar ? (
              <button
                type="button"
                className={tabClass(tab === 'nueva')}
                onClick={() => {
                  setTab('nueva')
                  if (paso === 1 && !preview) resetWizard()
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nueva liquidación
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-[#1e3a5f]/60">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} aria-hidden />
            <p className="text-sm">Cargando liquidaciones…</p>
          </div>
        ) : tab === 'historial' ? (
          <div className={cardClass}>
            <h2 className="mb-4 text-base font-semibold" style={{ color: NAVY }}>
              Historial de liquidaciones
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1e3a5f]/10 text-xs uppercase tracking-wide text-[#1e3a5f]/60">
                    <th className="px-2 py-3 font-semibold">Nº</th>
                    <th className="px-2 py-3 font-semibold">Empresa</th>
                    <th className="px-2 py-3 font-semibold">Período</th>
                    <th className="px-2 py-3 font-semibold">Estado</th>
                    <th className="px-2 py-3 font-semibold">Emisión</th>
                    <th className="px-2 py-3 text-right font-semibold">Total</th>
                    {puedeOperar ? <th className="px-2 py-3 font-semibold">Acción</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {liquidacionesVisibles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={puedeOperar ? 7 : 6}
                        className="px-2 py-12 text-center text-[#1e3a5f]/50"
                      >
                        No hay liquidaciones emitidas aún.
                      </td>
                    </tr>
                  ) : (
                    liquidacionesVisibles.map((liq) => (
                      <tr key={liq.id} className="border-b border-[#1e3a5f]/5 hover:bg-slate-50/80">
                        <td className="px-2 py-3 font-mono text-xs font-semibold" style={{ color: NAVY }}>
                          {liq.numero}
                        </td>
                        <td className="px-2 py-3 text-[#1e3a5f]">{liq.empresaNombre}</td>
                        <td className="px-2 py-3 text-xs text-[#1e3a5f]/80">
                          {formatYmdLegible(liq.fechaInicio)} – {formatYmdLegible(liq.fechaFin)}
                        </td>
                        <td className="px-2 py-3">
                          <BadgeEstado estado={liq.estado} />
                        </td>
                        <td className="px-2 py-3 text-xs text-[#1e3a5f]/70">
                          {formatFechaLiquidacion(liq.emitidoEn ?? liq.creadoEn)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums font-medium" style={{ color: NAVY }}>
                          {formatMonedaLiquidacion(liq.totalFacturado)}
                        </td>
                        {puedeOperar ? (
                          <td className="px-2 py-3">
                            {liq.estado === 'EMITIDA' ? (
                              <button
                                type="button"
                                disabled={anulandoId === liq.id}
                                onClick={() => void handleAnular(liq)}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50 disabled:opacity-50"
                              >
                                {anulandoId === liq.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}
                                Anular
                              </button>
                            ) : (
                              <span className="text-xs text-[#1e3a5f]/30">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step indicator */}
            <div className={`${cardClass} flex gap-1 sm:gap-3`}>
              {pasoIndicator(1, 'Parámetros')}
              <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-[#1e3a5f]/30 sm:block" />
              {pasoIndicator(2, 'Precios')}
              <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-[#1e3a5f]/30 sm:block" />
              {pasoIndicator(3, 'Preview')}
              <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-[#1e3a5f]/30 sm:block" />
              {pasoIndicator(4, 'Emisión')}
            </div>

            {/* Paso 1 */}
            {(paso === 1 || paso === 2) && (
              <div className={cardClass}>
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold" style={{ color: NAVY }}>
                  <FileText className="h-5 w-5" aria-hidden />
                  {paso === 1 ? 'Paso 1 — Parámetros' : 'Paso 2 — Lista de precios'}
                </h2>

                {paso === 1 ? (
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass} htmlFor="liq-empresa">
                        Contratista
                      </label>
                      <select
                        id="liq-empresa"
                        className={inputClass}
                        value={empresaId}
                        onChange={(e) => {
                          setEmpresaId(e.target.value)
                          setPreview(null)
                        }}
                      >
                        <option value="">Seleccioná empresa…</option>
                        {empresas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombre}
                            {e.cuit ? ` · ${e.cuit}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="liq-desde">
                          Fecha inicio
                        </label>
                        <input
                          id="liq-desde"
                          type="date"
                          className={inputClass}
                          value={fechaInicio}
                          onChange={(e) => {
                            setFechaInicio(e.target.value)
                            setPreview(null)
                          }}
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="liq-hasta">
                          Fecha fin
                        </label>
                        <input
                          id="liq-hasta"
                          type="date"
                          className={inputClass}
                          value={fechaFin}
                          onChange={(e) => {
                            setFechaFin(e.target.value)
                            setPreview(null)
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!empresaId || !fechaInicio || !fechaFin}
                        onClick={() => setPaso(2)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: NAVY }}
                      >
                        Continuar
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-[#1e3a5f]/70">
                      Precio unitario neto (ARS) por concepto operativo.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {CONCEPTOS_WIZARD_LIQUIDACION.map((concepto) => (
                        <div key={concepto}>
                          <label className={labelClass} htmlFor={`precio-${concepto}`}>
                            {ETIQUETAS_CONCEPTO_LIQUIDACION[concepto]}
                          </label>
                          <input
                            id={`precio-${concepto}`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0,00"
                            className={inputClass}
                            value={precios[concepto] ?? ''}
                            onChange={(e) => {
                              setPrecios((prev) => ({ ...prev, [concepto]: e.target.value }))
                              setPreview(null)
                            }}
                          />
                        </div>
                      ))}
                      <div>
                        <label className={labelClass} htmlFor="precio-iva">
                          IVA (%)
                        </label>
                        <input
                          id="precio-iva"
                          type="number"
                          min="0"
                          step="0.01"
                          className={inputClass}
                          value={ivaPct}
                          onChange={(e) => {
                            setIvaPct(e.target.value)
                            setPreview(null)
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setPaso(1)}
                        className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#1e3a5f] ring-1 ring-[#1e3a5f]/20 hover:bg-[#1e3a5f]/5"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={generandoPreview}
                        onClick={() => void handleGenerarPreview()}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: NAVY }}
                      >
                        {generandoPreview ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        Generar vista previa
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paso 3 — Preview */}
            {paso >= 3 && preview ? (
              <>
                <div className={cardClass}>
                  <h2 className="mb-1 text-base font-semibold" style={{ color: NAVY }}>
                    Paso 3 — Vista previa
                  </h2>
                  <p className="mb-4 text-sm text-[#1e3a5f]/70">
                    {preview.empresaNombre} · {formatYmdLegible(preview.fechaInicio)} al{' '}
                    {formatYmdLegible(preview.fechaFin)}
                  </p>

                  <div className="mb-4 flex flex-wrap gap-3 text-xs">
                    <span className="rounded-lg bg-[#1e3a5f]/8 px-3 py-1.5 font-medium text-[#1e3a5f]">
                      {preview.registrosComedorIds.length} registros comedor
                    </span>
                    <span className="rounded-lg bg-[#1e3a5f]/8 px-3 py-1.5 font-medium text-[#1e3a5f]">
                      {preview.historialPernocteIds.length} estadías
                    </span>
                    <span className="rounded-lg bg-orange-50 px-3 py-1.5 font-medium text-orange-800 ring-1 ring-orange-200">
                      Borrador — no bloquea consumos
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#1e3a5f]/10">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#1e3a5f]/5 text-xs uppercase tracking-wide text-[#1e3a5f]/70">
                          <th className="px-3 py-2.5 text-left font-semibold">Concepto</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Cant.</th>
                          <th className="px-3 py-2.5 text-right font-semibold">P. unit.</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.detalles.map((d) => (
                          <tr key={d.concepto} className="border-t border-[#1e3a5f]/5">
                            <td className="px-3 py-2.5 text-[#1e3a5f]">{d.descripcion}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{d.cantidad}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatMonedaLiquidacion(d.precioUnitarioNeto)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                              {formatMonedaLiquidacion(d.subtotalNeto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#1e3a5f]/10 bg-slate-50/80">
                          <td colSpan={3} className="px-3 py-2 text-right text-xs text-[#1e3a5f]/70">
                            Subtotal neto
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatMonedaLiquidacion(preview.subtotalNeto)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/80">
                          <td colSpan={3} className="px-3 py-2 text-right text-xs text-[#1e3a5f]/70">
                            IVA
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMonedaLiquidacion(preview.montoIva)}
                          </td>
                        </tr>
                        <tr className="bg-[#1e3a5f]/5">
                          <td
                            colSpan={3}
                            className="px-3 py-3 text-right text-sm font-semibold"
                            style={{ color: NAVY }}
                          >
                            Total
                          </td>
                          <td
                            className="px-3 py-3 text-right text-base tabular-nums font-bold"
                            style={{ color: NAVY }}
                          >
                            {formatMonedaLiquidacion(preview.totalFacturado)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPaso(2)}
                      className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#1e3a5f] ring-1 ring-[#1e3a5f]/20 hover:bg-[#1e3a5f]/5"
                    >
                      Ajustar precios
                    </button>
                  </div>
                </div>

                {/* Paso 4 — Emisión */}
                <div className={cardClass}>
                  <h2 className="mb-2 text-base font-semibold" style={{ color: NAVY }}>
                    Paso 4 — Emisión definitiva
                  </h2>
                  <div className="mb-4 flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
                    <p>
                      Al emitir se bloquearán{' '}
                      <strong>
                        {preview.registrosComedorIds.length + preview.historialPernocteIds.length}
                      </strong>{' '}
                      consumos y se incrementará la deuda del contratista. Esta operación puede
                      tardar unos segundos.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={emitiendo}
                    onClick={() => void handleEmitir()}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-60 sm:w-auto"
                    style={{ backgroundColor: ORANGE }}
                  >
                    {emitiendo ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        Emitiendo liquidación…
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5" aria-hidden />
                        Emitir liquidación definitiva
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
