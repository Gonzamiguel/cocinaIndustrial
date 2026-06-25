import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import {
  ModalEtiquetaProduccionCocina,
  type EtiquetaProduccionData,
} from '../../components/cocina/ModalEtiquetaProduccionCocina'
import { InsumoSearchSelect } from '../../components/insumos/InsumoSearchSelect'
import {
  formatLabelInsumo,
  subscribeInsumos,
  type Insumo,
} from '../../lib/insumos'
import { subscribeMenu, type MenuItem } from '../../lib/menu'
import {
  costoTeoricoProduccionPorciones,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'
import { generarCodigoTrazabilidad } from '../../lib/qrProduccion'
import {
  lotesDisponiblesParaEgreso,
  opcionesHistorialAmplio,
  registrarProduccionCocina,
  subscribeMovimientosInventarioPorUbicacion,
  type ItemMovimientoInventario,
  type MovimientoInventario,
  type ProduccionInsumoDetalle,
} from '../../lib/movimientosInventario'
import { selectClassComanda, inputClassComanda } from '../campamento/comandasFormShared'

type ProduccionCocinaInput = Parameters<typeof registrarProduccionCocina>[0]

type FilaProd = {
  key: string
  insumoId: string | null
  nombre: string
  unidad: string
  cantidadTeorica: number
  cantidadReal: string
  loteKey: string | null
  esExtra: boolean
}

function nuevaFilaExtra(): FilaProd {
  return {
    key:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    insumoId: null,
    nombre: '',
    unidad: 'Kg',
    cantidadTeorica: 0,
    cantidadReal: '',
    loteKey: null,
    esExtra: true,
  }
}

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultFechaVencimiento(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return toInputDate(d)
}

function sugerirLoteProduccion(receta: RecetaTecnica): string {
  const slug = receta.nombre
    .replace(/[^\w\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('')
    .slice(0, 8)
    .toUpperCase()
  const hoy = toInputDate(new Date()).replace(/-/g, '')
  return `P-${hoy}-${slug || 'LOTE'}`
}

function construirFilasDesdeReceta(
  receta: RecetaTecnica,
  porciones: number,
  movimientos: MovimientoInventario[],
  ub: string,
  insumoPorId: Map<string, Insumo>,
): FilaProd[] {
  const rend = Math.max(1, Math.floor(receta.rendimientoPorciones) || 1)
  const p = Number(porciones)
  const factor = Number.isFinite(p) && p > 0 ? p / rend : 0

  const filas: FilaProd[] = []

  for (const ing of receta.ingredientes) {
    const id = ing.insumoId?.trim() || null
    const teorico =
      ing.cantidadBruta * (1 + Math.max(0, ing.porcentajeMerma) / 100) * factor
    const teorRounded = Math.round(teorico * 10000) / 10000
    const ins = id ? insumoPorId.get(id) : undefined
    const nombre = ins ? formatLabelInsumo(ins) : ing.ingrediente.trim() || '—'
    let loteKey: string | null = null
    if (id) {
      const lotes = lotesDisponiblesParaEgreso(movimientos, id, ub)
      for (const l of lotes) {
        if (l.stock > 1e-9) {
          loteKey = l.loteKey
          break
        }
      }
    }
    filas.push({
      key:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${id ?? ing.ingrediente}-${Math.random()}`,
      insumoId: id,
      nombre,
      unidad: ing.unidad,
      cantidadTeorica: teorRounded,
      cantidadReal: '',
      loteKey,
      esExtra: false,
    })
  }

  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

type AdminProduccionCocinaTabProps = {
  className?: string
  onAfterSuccess?: () => void
}

export function AdminProduccionCocinaTab({
  className,
  onAfterSuccess,
}: AdminProduccionCocinaTabProps) {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [recetaId, setRecetaId] = useState('')
  const [porcionesStr, setPorcionesStr] = useState('1')
  const [loteProduccion, setLoteProduccion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState(defaultFechaVencimiento)
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaProd[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmProduccionOpen, setConfirmProduccionOpen] = useState(false)
  const [payloadPendiente, setPayloadPendiente] = useState<ProduccionCocinaInput | null>(null)
  const [etiquetaModal, setEtiquetaModal] = useState<EtiquetaProduccionData | null>(null)
  const [etiquetaCopias, setEtiquetaCopias] = useState(1)

  const ub = ubicacionId?.trim().toUpperCase() ?? ''

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeRecetario(setRecetas), [])
  useEffect(() => subscribeMenu(setMenuItems), [])

  useEffect(() => {
    if (!ub) {
      setMovimientos([])
      return
    }
    return subscribeMovimientosInventarioPorUbicacion(
      ub,
      setMovimientos,
      opcionesHistorialAmplio(35000),
    )
  }, [ub])

  const insumoPorId = useMemo(() => {
    const m = new Map<string, Insumo>()
    for (const i of insumos) m.set(i.id, i)
    return m
  }, [insumos])

  const menuItemSeleccionado = useMemo(
    () => (menuItemId ? menuItems.find((m) => m.id === menuItemId) ?? null : null),
    [menuItemId, menuItems],
  )

  const menuOpciones = useMemo(() => {
    const sorted = [...menuItems].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    if (!recetaId) return sorted
    const vinculados = sorted.filter((m) => m.recetaId === recetaId)
    return vinculados.length > 0 ? vinculados : sorted
  }, [menuItems, recetaId])

  const recetaSeleccionada = useMemo(
    () => recetas.find((r) => r.id === recetaId) ?? null,
    [recetas, recetaId],
  )

  const porciones = Number(porcionesStr.replace(',', '.'))

  useEffect(() => {
    if (!recetaSeleccionada) {
      setMenuItemId(null)
      return
    }
    const vinculados = menuItems.filter((m) => m.recetaId === recetaSeleccionada.id)
    if (vinculados.length === 1) {
      setMenuItemId(vinculados[0].id)
    } else if (vinculados.length === 0) {
      setMenuItemId(null)
    }
    setLoteProduccion((prev) => prev.trim() || sugerirLoteProduccion(recetaSeleccionada))
  }, [recetaSeleccionada, menuItems])

  const recalcularFilas = useCallback(() => {
    if (!recetaSeleccionada || !ub || !Number.isFinite(porciones) || porciones <= 0) {
      setFilas([])
      return
    }
    setFilas(
      construirFilasDesdeReceta(recetaSeleccionada, porciones, movimientos, ub, insumoPorId),
    )
  }, [recetaSeleccionada, porciones, movimientos, ub, insumoPorId])

  useEffect(() => {
    recalcularFilas()
  }, [recalcularFilas])

  const costoTeorico = useMemo(() => {
    if (!recetaSeleccionada || !Number.isFinite(porciones) || porciones <= 0) return 0
    return costoTeoricoProduccionPorciones(insumos, recetaSeleccionada, porciones)
  }, [insumos, recetaSeleccionada, porciones])

  const insumosOrdenados = useMemo(
    () =>
      [...insumos].sort((a, b) =>
        formatLabelInsumo(a).localeCompare(formatLabelInsumo(b), 'es', { sensitivity: 'base' }),
      ),
    [insumos],
  )

  function actualizarFilaPorKey(key: string, patch: Partial<FilaProd>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  }

  function agregarInsumoExtra() {
    setFilas((prev) => [...prev, nuevaFilaExtra()])
  }

  function quitarFila(key: string) {
    setFilas((prev) => prev.filter((f) => f.key !== key))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ub) {
      showToast('No hay ubicación de cocina asignada.', 'error')
      return
    }
    if (!recetaSeleccionada) {
      showToast('Seleccioná una receta.', 'error')
      return
    }
    if (!Number.isFinite(porciones) || porciones <= 0) {
      showToast('Indicá una cantidad de porciones válida.', 'error')
      return
    }
    if (!menuItemSeleccionado) {
      showToast('Seleccioná la vianda del menú que produjiste (ej. Carne a la pizza).', 'error')
      return
    }
    const lote = loteProduccion.trim()
    if (!lote) {
      showToast('Indicá el lote de producción.', 'error')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento.trim())) {
      showToast('Indicá la fecha de vencimiento (AAAA-MM-DD).', 'error')
      return
    }
    const items: ItemMovimientoInventario[] = []
    const itemsDetalle: ProduccionInsumoDetalle[] = []

    for (const f of filas) {
      const cant = Number(String(f.cantidadReal).replace(',', '.'))
      const real = Number.isFinite(cant) ? cant : 0

      itemsDetalle.push({
        insumoId: f.insumoId ?? '',
        nombre: f.nombre,
        unidad: f.unidad,
        cantidadTeorica: f.cantidadTeorica,
        cantidadReal: real,
        loteInsumo: '',
      })

      if (real <= 0) continue

      if (!f.insumoId) {
        showToast(
          `Vinculá el insumo de catálogo para «${f.nombre}» (columna insumo) antes de registrar.`,
          'error',
        )
        return
      }
      if (f.loteKey === null) {
        showToast(`Elegí el lote de depósito para «${f.nombre}».`, 'error')
        return
      }
      const ins = insumoPorId.get(f.insumoId)
      if (!ins) {
        showToast(`Insumo inválido: «${f.nombre}».`, 'error')
        return
      }
      const lotes = lotesDisponiblesParaEgreso(movimientos, f.insumoId, ub)
      const loteRow = lotes.find((l) => l.loteKey === f.loteKey)
      if (!loteRow) {
        showToast(`El lote ya no está disponible para «${f.nombre}».`, 'error')
        return
      }
      if (real > loteRow.stock + 1e-9) {
        showToast(
          `Stock insuficiente de «${f.nombre}» en ese lote (${loteRow.stock.toLocaleString('es-AR', { maximumFractionDigits: 4 })}).`,
          'error',
        )
        return
      }

      const detIdx = itemsDetalle.length - 1
      itemsDetalle[detIdx] = {
        ...itemsDetalle[detIdx],
        loteInsumo: loteRow.lotePersistido || '',
      }

      items.push({
        insumoId: f.insumoId,
        nombreSnapshot: formatLabelInsumo(ins),
        cantidad: real,
        lote: loteRow.lotePersistido || undefined,
        fechaVencimiento: loteRow.fechaVencimiento ?? undefined,
        controlCalidadOk: true,
        costoPorUnidadBaseSnapshot: ins.costoPorUnidadBase,
      })
    }

    if (items.length === 0) {
      showToast(
        'Cargá al menos un insumo con cantidad real (lo que usó cocina: ej. 20 kg carne).',
        'error',
      )
      return
    }

    const codigoTrazabilidad = generarCodigoTrazabilidad(
      recetaSeleccionada.id,
      lote,
      fechaVencimiento.trim(),
    )

    setPayloadPendiente({
      ubicacionId: ub,
      fecha: new Date(),
      recetaId: recetaSeleccionada.id,
      recetaNombre: recetaSeleccionada.nombre,
      cantidadPorciones: porciones,
      nombreProductoSnapshot: menuItemSeleccionado.nombre,
      loteProductoTerminado: lote,
      fechaVencimientoProducto: fechaVencimiento.trim(),
      codigoTrazabilidad,
      menuItemId: menuItemSeleccionado.id,
      itemsDetalle,
      itemsEgreso: items,
      costoTeoricoTotal: costoTeorico,
    })
    setConfirmProduccionOpen(true)
  }

  async function confirmarRegistroProduccion() {
    if (!payloadPendiente) return
    setIsSubmitting(true)
    try {
      await registrarProduccionCocina(payloadPendiente)
      showToast(
        'Producción registrada: stock del menú actualizado con lote y vencimiento.',
        'success',
      )
      setEtiquetaCopias(Math.max(1, Math.floor(payloadPendiente.cantidadPorciones) || 1))
      setEtiquetaModal({
        nombrePlato: payloadPendiente.nombreProductoSnapshot,
        recetaNombre: payloadPendiente.recetaNombre,
        lote: payloadPendiente.loteProductoTerminado,
        fechaVencimiento: payloadPendiente.fechaVencimientoProducto,
        codigoTrazabilidad: payloadPendiente.codigoTrazabilidad,
        recetaId: payloadPendiente.recetaId,
        menuItemId: payloadPendiente.menuItemId,
        cantidadPorciones: payloadPendiente.cantidadPorciones,
      })
      setPorcionesStr('1')
      setFilas([])
      setRecetaId('')
      setLoteProduccion('')
      setFechaVencimiento(defaultFechaVencimiento())
      setPayloadPendiente(null)
      setConfirmProduccionOpen(false)
      onAfterSuccess?.()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'No se pudo registrar la producción.',
        'error',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!ubicacionId) {
    return (
      <p className="text-sm text-neutral-600">
        No hay ubicación asignada. Configurá{' '}
        <code className="rounded bg-neutral-100 px-1 text-xs">ubicacionId</code> en tu usuario.
      </p>
    )
  }

  return (
    <>
      <ModalEtiquetaProduccionCocina
        open={etiquetaModal !== null}
        onClose={() => setEtiquetaModal(null)}
        data={etiquetaModal}
        copias={etiquetaCopias}
      />
      <ConfirmDialog
        open={confirmProduccionOpen}
        title="Confirmar producción en cocina"
        description={
          payloadPendiente
            ? `¿Registrar ${payloadPendiente.cantidadPorciones.toLocaleString('es-AR')} porciones de «${payloadPendiente.recetaNombre}»? Lote ${payloadPendiente.loteProductoTerminado} · Vto ${payloadPendiente.fechaVencimientoProducto}. Se actualizará el stock del menú con trazabilidad.`
            : ''
        }
        confirmLabel="Sí, registrar producción"
        cancelLabel="Volver"
        isWorking={isSubmitting}
        onCancel={() => {
          if (!isSubmitting) {
            setConfirmProduccionOpen(false)
            setPayloadPendiente(null)
          }
        }}
        onConfirm={() => void confirmarRegistroProduccion()}
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={`flex min-h-0 flex-1 flex-col gap-4 ${className ?? ''}`}
      >
        <fieldset
          disabled={isSubmitting}
          className="m-0 flex min-h-0 flex-1 flex-col gap-4 border-0 p-0 disabled:opacity-[0.92]"
        >
          <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
              Registro de lo que cocinó
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
              Elegí la receta de referencia (nutrición), cuántas viandas salieron, lote y vencimiento.
              Abajo cargá <strong className="font-semibold text-[#171717]">lo que realmente usó cocina</strong>{' '}
              (ej. 20 kg carne, 3 kg papa). Se compara automáticamente con la ficha técnica.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block text-sm font-medium text-[#171717] sm:col-span-2 xl:col-span-1">
                Receta de referencia (nutrición)
                <select
                  value={recetaId}
                  onChange={(e) => setRecetaId(e.target.value)}
                  className={selectClassComanda}
                >
                  <option value="">— Elegir —</option>
                  {recetas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#171717] sm:col-span-2">
                Vianda producida (menú del día) *
                <select
                  value={menuItemId ?? ''}
                  onChange={(e) => setMenuItemId(e.target.value || null)}
                  className={selectClassComanda}
                >
                  <option value="">— Qué plato / guarnición salió —</option>
                  {menuOpciones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                      {m.categoria === 'guarnicion' ? ' (Guarnición)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#171717]">
                Viandas producidas *
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={porcionesStr}
                  onChange={(e) => setPorcionesStr(e.target.value)}
                  className={inputClassComanda}
                  placeholder="Ej. 50"
                />
              </label>
              <label className="block text-sm font-medium text-[#171717]">
                Lote producción *
                <input
                  type="text"
                  value={loteProduccion}
                  onChange={(e) => setLoteProduccion(e.target.value.toUpperCase())}
                  placeholder="Ej. P-20260524-CARNE"
                  className={inputClassComanda}
                />
              </label>
              <label className="block text-sm font-medium text-[#171717]">
                Fecha vencimiento *
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className={inputClassComanda}
                />
              </label>
            </div>
          </div>

          {recetaSeleccionada && filas.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              La ficha técnica no tiene ingredientes. Pedí a nutrición que complete el recetario.
            </p>
          ) : null}

          {filas.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="shrink-0 border-b border-neutral-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#CD1818]">
                  Insumos — ficha técnica vs uso real
                </p>
                <p className="mt-0.5 text-xs text-[#8997A6]">
                  Columna «Según ficha»: lo que dice nutrición para {porcionesStr || '…'} viandas.
                  Columna «Usó cocina»: lo que reporta el cocinero. Costo teórico ficha:{' '}
                  <span className="font-semibold text-[#171717]">
                    {costoTeorico.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-[#8997A6]">
                    <tr>
                      <th className="px-3 py-3">Insumo (catálogo)</th>
                      <th className="px-3 py-3">Un.</th>
                      <th className="px-3 py-3 text-right">Según ficha</th>
                      <th className="px-3 py-3 text-right">Usó cocina</th>
                      <th className="px-3 py-3">Lote depósito</th>
                      <th className="px-3 py-3 text-right">Desvío</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {filas.map((f) => {
                      const lotes = f.insumoId
                        ? lotesDisponiblesParaEgreso(movimientos, f.insumoId, ub)
                        : []
                      const real = Number(String(f.cantidadReal).replace(',', '.'))
                      const desvio =
                        f.cantidadTeorica > 0 && Number.isFinite(real) && real > 0
                          ? ((real - f.cantidadTeorica) / f.cantidadTeorica) * 100
                          : null
                      return (
                        <tr key={f.key}>
                          <td className="min-w-[200px] px-3 py-2">
                            {f.esExtra || !f.insumoId ? (
                              <InsumoSearchSelect
                                insumos={insumosOrdenados}
                                selectedId={f.insumoId}
                                selectedLabel={f.nombre}
                                compact
                                hideLabelOnDesktop
                                placeholder="Escribí para buscar…"
                                onSelect={(ins) =>
                                  actualizarFilaPorKey(f.key, {
                                    insumoId: ins.id,
                                    nombre: formatLabelInsumo(ins),
                                    unidad: f.unidad || 'Kg',
                                  })
                                }
                                onClear={() =>
                                  actualizarFilaPorKey(f.key, {
                                    insumoId: null,
                                    nombre: '',
                                  })
                                }
                              />
                            ) : (
                              <p className="font-medium text-[#171717]">{f.nombre}</p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs">{f.unidad}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#8997A6]">
                            {f.cantidadTeorica > 0
                              ? f.cantidadTeorica.toLocaleString('es-AR', { maximumFractionDigits: 4 })
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={f.cantidadReal}
                              onChange={(e) =>
                                actualizarFilaPorKey(f.key, { cantidadReal: e.target.value })
                              }
                              placeholder="0"
                              className="ml-auto w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm font-semibold text-[#171717] outline-none focus:ring-2 focus:ring-[#CD1818]/15"
                            />
                          </td>
                          <td className="max-w-[200px] px-3 py-2">
                            {f.insumoId ? (
                              <select
                                value={f.loteKey ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  actualizarFilaPorKey(f.key, {
                                    loteKey: v === '' ? null : v,
                                  })
                                }}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#CD1818]/15"
                              >
                                <option value="">— Lote —</option>
                                {lotes.map((l) => (
                                  <option key={l.loteKey || '__empty'} value={l.loteKey}>
                                    {(l.lotePersistido || '(sin lote)').slice(0, 24)}
                                    {l.fechaVencimiento ? ` · vto ${l.fechaVencimiento}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-[#8997A6]">Elegí insumo</span>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${
                              desvio !== null && Math.abs(desvio) > 5
                                ? 'text-red-600'
                                : 'text-[#8997A6]'
                            }`}
                          >
                            {desvio !== null
                              ? `${desvio >= 0 ? '+' : ''}${desvio.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {f.esExtra ? (
                              <button
                                type="button"
                                onClick={() => quitarFila(f.key)}
                                className="text-xs text-[#8997A6] hover:text-red-600"
                              >
                                Quitar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-neutral-100 px-4 py-3">
                <button
                  type="button"
                  onClick={agregarInsumoExtra}
                  className="text-sm font-semibold text-[#CD1818] hover:underline"
                >
                  + Agregar insumo usado (no está en la ficha)
                </button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden />
          )}

          <div className="mt-auto flex shrink-0 flex-wrap justify-end gap-3 border-t border-neutral-100 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || confirmProduccionOpen || filas.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Registrar producción
            </button>
          </div>
        </fieldset>
      </form>
    </>
  )
}
