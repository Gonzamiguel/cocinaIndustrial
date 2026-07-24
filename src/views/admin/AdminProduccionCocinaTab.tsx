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
import { ensureMenuItemIdForReceta, subscribeMenu, type MenuItem } from '../../lib/menu'
import {
  costoTeoricoProduccionPorciones,
  subscribeRecetario,
  type RecetaTecnica,
} from '../../lib/recetario'
import { generarCodigoTrazabilidadProduccion } from '../../lib/qrProduccion'
import {
  DIAS_VENCIMIENTO_PRODUCCION,
  fechaVencimientoDesdeElaboracion,
  resolverCodigoCorto,
  type ModalidadProduccion,
} from '../../lib/produccionLotes'
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

function hoyInputDate(): string {
  return toInputDate(new Date())
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

/** Une fichas técnicas (principal + guarnición) sumando insumos repetidos. */
function construirFilasDesdeRecetas(
  lista: RecetaTecnica[],
  porciones: number,
  movimientos: MovimientoInventario[],
  ub: string,
  insumoPorId: Map<string, Insumo>,
): FilaProd[] {
  const byInsumo = new Map<string, FilaProd>()
  const sinId: FilaProd[] = []

  for (const receta of lista) {
    for (const f of construirFilasDesdeReceta(
      receta,
      porciones,
      movimientos,
      ub,
      insumoPorId,
    )) {
      if (!f.insumoId) {
        sinId.push(f)
        continue
      }
      const prev = byInsumo.get(f.insumoId)
      if (prev) {
        prev.cantidadTeorica =
          Math.round((prev.cantidadTeorica + f.cantidadTeorica) * 10000) / 10000
      } else {
        byInsumo.set(f.insumoId, f)
      }
    }
  }

  return [...byInsumo.values(), ...sinId].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  )
}

type AdminProduccionCocinaTabProps = {
  className?: string
  onAfterSuccess?: () => void
  /** Si viene del padre (stock), evita un 2.º subscribe y usa los mismos datos. */
  menuItemsProp?: MenuItem[]
}

export function AdminProduccionCocinaTab({
  className,
  onAfterSuccess,
  menuItemsProp,
}: AdminProduccionCocinaTabProps) {
  const { ubicacionId } = useAuth()
  const { showToast } = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetas, setRecetas] = useState<RecetaTecnica[]>([])
  const [menuItemsLocal, setMenuItemsLocal] = useState<MenuItem[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])
  const [porcionesStr, setPorcionesStr] = useState('1')
  const [modalidad, setModalidad] = useState<ModalidadProduccion>('vianda')
  const [fechaElaboracion, setFechaElaboracion] = useState(hoyInputDate)
  const [pesoKgStr, setPesoKgStr] = useState('')
  /** Receta principal (master recetario). Granel: alimento. */
  const [principalRecetaId, setPrincipalRecetaId] = useState<string | null>(null)
  /** Receta guarnición (master recetario). */
  const [guarnicionRecetaId, setGuarnicionRecetaId] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaProd[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmProduccionOpen, setConfirmProduccionOpen] = useState(false)
  const [payloadPendiente, setPayloadPendiente] = useState<ProduccionCocinaInput | null>(null)
  const [etiquetaModal, setEtiquetaModal] = useState<EtiquetaProduccionData | null>(null)
  const [etiquetaCopias, setEtiquetaCopias] = useState(1)

  const ub = ubicacionId?.trim().toUpperCase() ?? ''

  const fechaVencimiento = useMemo(
    () => fechaVencimientoDesdeElaboracion(fechaElaboracion) || '',
    [fechaElaboracion],
  )

  const menuItems = menuItemsProp ?? menuItemsLocal

  useEffect(() => subscribeInsumos(setInsumos), [])
  useEffect(() => subscribeRecetario(setRecetas), [])
  useEffect(() => {
    if (menuItemsProp) return
    return subscribeMenu(setMenuItemsLocal)
  }, [menuItemsProp])

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

  const principalReceta = useMemo(
    () =>
      principalRecetaId
        ? recetas.find((r) => r.id === principalRecetaId) ?? null
        : null,
    [principalRecetaId, recetas],
  )

  const guarnicionReceta = useMemo(
    () =>
      guarnicionRecetaId
        ? recetas.find((r) => r.id === guarnicionRecetaId) ?? null
        : null,
    [guarnicionRecetaId, recetas],
  )

  const menuItemPorReceta = useCallback(
    (recetaId: string | null | undefined) => {
      const rid = recetaId?.trim()
      if (!rid) return null
      return menuItems.find((m) => m.recetaId === rid) ?? null
    },
    [menuItems],
  )

  /** Stock: menú vinculado a la receta principal, o a la guarnición si va sola. */
  const menuDestinoStock =
    menuItemPorReceta(principalReceta?.id) ??
    menuItemPorReceta(guarnicionReceta?.id)

  const menuGuarnicionStock = menuItemPorReceta(guarnicionReceta?.id)

  const esComboVianda =
    modalidad === 'vianda' && Boolean(principalReceta) && Boolean(guarnicionReceta)

  const nombrePlatoProducido = useMemo(() => {
    if (esComboVianda && principalReceta && guarnicionReceta) {
      return `${principalReceta.nombre} + ${guarnicionReceta.nombre}`
    }
    return principalReceta?.nombre ?? guarnicionReceta?.nombre ?? ''
  }, [esComboVianda, principalReceta, guarnicionReceta])

  const principalOpciones = useMemo(
    () =>
      recetas
        .filter((r) => r.categoria === 'Principal')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [recetas],
  )

  const guarnicionOpciones = useMemo(
    () =>
      recetas
        .filter((r) => r.categoria === 'Guarnición')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [recetas],
  )

  const granelOpciones = useMemo(
    () => [...recetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [recetas],
  )

  /** Fichas técnicas elegidas (el master es el recetario). */
  const recetasVinculadas = useMemo(() => {
    const out: RecetaTecnica[] = []
    if (modalidad === 'granel') {
      if (principalReceta) out.push(principalReceta)
    } else {
      if (principalReceta) out.push(principalReceta)
      if (guarnicionReceta) out.push(guarnicionReceta)
    }
    return out
  }, [modalidad, principalReceta, guarnicionReceta])

  const recetaPrincipalRef = principalReceta ?? guarnicionReceta

  const codigosCortosUsados = useMemo(() => {
    const list: string[] = []
    for (const r of recetas) if (r.codigoCorto) list.push(r.codigoCorto)
    for (const m of menuItems) if (m.codigoCorto) list.push(m.codigoCorto)
    return list
  }, [recetas, menuItems])

  const codigoPlatoResuelto = useMemo(() => {
    const recetaCodigo = principalReceta ?? guarnicionReceta
    if (!recetaCodigo) return ''
    return resolverCodigoCorto({
      codigoMenu: menuItemPorReceta(recetaCodigo.id)?.codigoCorto,
      codigoReceta: recetaCodigo.codigoCorto,
      usados: codigosCortosUsados,
    })
  }, [principalReceta, guarnicionReceta, menuItemPorReceta, codigosCortosUsados])

  const codigoGuarnicionResuelto = useMemo(() => {
    if (!principalReceta || !guarnicionReceta) return null
    return resolverCodigoCorto({
      codigoMenu: menuItemPorReceta(guarnicionReceta.id)?.codigoCorto,
      codigoReceta: guarnicionReceta.codigoCorto,
      usados: codigosCortosUsados,
    })
  }, [principalReceta, guarnicionReceta, menuItemPorReceta, codigosCortosUsados])

  const codigoTrazabilidadPreview = useMemo(() => {
    if (!codigoPlatoResuelto || !/^\d{4}-\d{2}-\d{2}$/.test(fechaElaboracion)) {
      return ''
    }
    const vto = fechaVencimientoDesdeElaboracion(fechaElaboracion)
    if (!vto) return ''
    if (modalidad === 'granel') {
      const peso = Number(String(pesoKgStr).replace(',', '.'))
      if (!Number.isFinite(peso) || peso <= 0) return ''
      return generarCodigoTrazabilidadProduccion({
        modalidad: 'granel',
        codigoPlato: codigoPlatoResuelto,
        pesoKg: peso,
        fechaElaboracion,
        fechaVencimiento: vto,
      })
    }
    if (!principalReceta && !guarnicionReceta) return ''
    return generarCodigoTrazabilidadProduccion({
      modalidad: 'vianda',
      codigoPlato: codigoPlatoResuelto,
      codigoGuarnicion: codigoGuarnicionResuelto,
      fechaElaboracion,
      fechaVencimiento: vto,
    })
  }, [
    codigoPlatoResuelto,
    codigoGuarnicionResuelto,
    fechaElaboracion,
    modalidad,
    pesoKgStr,
    principalReceta,
    guarnicionReceta,
  ])

  const porciones = Number(porcionesStr.replace(',', '.'))

  const recalcularFilas = useCallback(() => {
    if (
      recetasVinculadas.length === 0 ||
      !ub ||
      !Number.isFinite(porciones) ||
      porciones <= 0
    ) {
      setFilas([])
      return
    }
    setFilas(
      construirFilasDesdeRecetas(
        recetasVinculadas,
        porciones,
        movimientos,
        ub,
        insumoPorId,
      ),
    )
  }, [recetasVinculadas, porciones, movimientos, ub, insumoPorId])

  useEffect(() => {
    recalcularFilas()
  }, [recalcularFilas])

  const costoTeorico = useMemo(() => {
    if (!Number.isFinite(porciones) || porciones <= 0) return 0
    return recetasVinculadas.reduce(
      (acc, r) => acc + costoTeoricoProduccionPorciones(insumos, r, porciones),
      0,
    )
  }, [insumos, recetasVinculadas, porciones])

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
    if (!Number.isFinite(porciones) || porciones <= 0) {
      showToast('Indicá una cantidad de porciones válida.', 'error')
      return
    }
    if (!principalReceta && !guarnicionReceta) {
      showToast(
        modalidad === 'vianda'
          ? 'Elegí plato principal, guarnición, o ambos desde el recetario.'
          : 'Seleccioná el alimento del recetario.',
        'error',
      )
      return
    }
    if (!codigoPlatoResuelto) {
      showToast('No se pudo resolver el código corto del plato (01–99).', 'error')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaElaboracion.trim())) {
      showToast('Indicá la fecha de elaboración (AAAA-MM-DD).', 'error')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento.trim())) {
      showToast('No se pudo calcular el vencimiento (+60 días).', 'error')
      return
    }
    const pesoKg =
      modalidad === 'granel' ? Number(String(pesoKgStr).replace(',', '.')) : undefined
    if (modalidad === 'granel' && (!Number.isFinite(pesoKg) || (pesoKg ?? 0) <= 0)) {
      showToast('Indicá el peso en kg de la tanda a granel.', 'error')
      return
    }

    // Stock siempre sobre la receta “base” (principal si hay combo; guarnición si va sola).
    // No existe ni se exige un ítem de menú “principal + guarnición”: el combo es flexible.
    const recetaParaStock = principalReceta ?? guarnicionReceta
    if (!recetaParaStock) return

    let menuItemIdStock = menuDestinoStock?.id ?? ''
    if (!menuItemIdStock) {
      try {
        menuItemIdStock = await ensureMenuItemIdForReceta({
          recetaId: recetaParaStock.id,
          nombre: recetaParaStock.nombre,
          categoria:
            recetaParaStock.categoria === 'Guarnición' ? 'guarnicion' : 'principal',
          aceptaGuarnicion: recetaParaStock.aceptaGuarnicion,
          codigoCorto: recetaParaStock.codigoCorto,
        })
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'No se pudo preparar el ítem de stock para esa receta.',
          'error',
        )
        return
      }
    }

    let guarnicionMenuItemIdStock: string | null = null
    if (esComboVianda && guarnicionReceta) {
      guarnicionMenuItemIdStock = menuGuarnicionStock?.id ?? null
      // Solo metadata; el stock del combo NO se duplica en la guarnición.
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

    const codigoTrazabilidad = generarCodigoTrazabilidadProduccion({
      modalidad,
      codigoPlato: codigoPlatoResuelto,
      codigoGuarnicion:
        modalidad === 'vianda' && esComboVianda ? codigoGuarnicionResuelto : null,
      pesoKg,
      fechaElaboracion: fechaElaboracion.trim(),
      fechaVencimiento: fechaVencimiento.trim(),
    })

    if (
      !codigoTrazabilidad.startsWith('V-') &&
      !codigoTrazabilidad.startsWith('G-')
    ) {
      showToast('Error interno: el código de lote debe ser V- o G-.', 'error')
      return
    }

    setPayloadPendiente({
      ubicacionId: ub,
      fecha: new Date(),
      recetaId: recetaParaStock.id,
      recetaNombre:
        recetasVinculadas.length > 0
          ? recetasVinculadas.map((r) => r.nombre).join(' + ')
          : nombrePlatoProducido,
      cantidadPorciones: porciones,
      nombreProductoSnapshot: nombrePlatoProducido,
      loteProductoTerminado: codigoTrazabilidad,
      fechaVencimientoProducto: fechaVencimiento.trim(),
      codigoTrazabilidad,
      menuItemId: menuItemIdStock,
      guarnicionMenuItemId: guarnicionMenuItemIdStock,
      nombreGuarnicion:
        esComboVianda && guarnicionReceta ? guarnicionReceta.nombre : '',
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
      // Una sola etiqueta: el mismo código/QR se pega en cada vianda del lote.
      setEtiquetaCopias(1)
      setEtiquetaModal({
        nombrePlato: esComboVianda
          ? (principalReceta?.nombre ?? payloadPendiente.nombreProductoSnapshot)
          : payloadPendiente.nombreProductoSnapshot,
        nombreGuarnicion: payloadPendiente.nombreGuarnicion ?? '',
        recetaNombre: payloadPendiente.recetaNombre,
        lote: payloadPendiente.loteProductoTerminado,
        fechaElaboracion: fechaElaboracion.trim(),
        fechaVencimiento: payloadPendiente.fechaVencimientoProducto,
        codigoTrazabilidad: payloadPendiente.codigoTrazabilidad,
        recetaId: payloadPendiente.recetaId,
        menuItemId: payloadPendiente.menuItemId,
        cantidadPorciones: payloadPendiente.cantidadPorciones,
      })
      setPorcionesStr('1')
      setFilas([])
      setFechaElaboracion(hoyInputDate())
      setPesoKgStr('')
      setPrincipalRecetaId(null)
      setGuarnicionRecetaId(null)
      setModalidad('vianda')
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
            ? `¿Registrar ${payloadPendiente.cantidadPorciones.toLocaleString('es-AR')} viandas/porciones de «${payloadPendiente.nombreProductoSnapshot}»? Lote ${payloadPendiente.loteProductoTerminado} · Vto ${payloadPendiente.fechaVencimientoProducto}. El stock se carga como ese plato.`
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
              Elegí modalidad (vianda <code className="text-[10px]">V-</code> o granel{' '}
              <code className="text-[10px]">G-</code>), el plato y/o la guarnición desde el{' '}
              <strong className="font-semibold text-[#171717]">recetario</strong>, porciones y fecha.
              Los insumos salen de la ficha técnica. El vencimiento se calcula solo (+
              {DIAS_VENCIMIENTO_PRODUCCION} días). Abajo cargá{' '}
              <strong className="font-semibold text-[#171717]">lo que realmente usó cocina</strong> y
              el lote de materia prima (FEFO).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="sm:col-span-2 xl:col-span-3">
                <span className="text-sm font-medium text-[#171717]">Modalidad de lote</span>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Modalidad">
                  <button
                    type="button"
                    onClick={() => setModalidad('vianda')}
                    className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
                      modalidad === 'vianda'
                        ? 'bg-[#CD1818] text-white'
                        : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
                    }`}
                  >
                    Vianda (V-)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalidad('granel')}
                    className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
                      modalidad === 'granel'
                        ? 'bg-[#CD1818] text-white'
                        : 'border border-neutral-200 bg-white text-[#171717] hover:bg-neutral-50'
                    }`}
                  >
                    A granel (G-)
                  </button>
                </div>
              </div>
              {modalidad === 'vianda' ? (
                <>
                  <label className="block text-sm font-medium text-[#171717] sm:col-span-2">
                    Plato principal (recetario)
                    <select
                      value={principalRecetaId ?? ''}
                      onChange={(e) => setPrincipalRecetaId(e.target.value || null)}
                      className={selectClassComanda}
                    >
                      <option value="">— Sin plato principal —</option>
                      {principalOpciones.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigoCorto ? `#${r.codigoCorto} · ` : ''}
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                    {recetas.length === 0 ? (
                      <span className="mt-1 block text-[11px] text-amber-700">
                        No hay recetas cargadas. Creálas en el recetario / nutrición.
                      </span>
                    ) : principalOpciones.length === 0 ? (
                      <span className="mt-1 block text-[11px] text-amber-700">
                        No hay recetas de categoría Principal en el master.
                      </span>
                    ) : (
                      <span className="mt-1 block text-[11px] text-[#8997A6]">
                        {principalOpciones.length} receta(s) principal(es)
                      </span>
                    )}
                  </label>
                  <label className="block text-sm font-medium text-[#171717] sm:col-span-2">
                    Guarnición (recetario)
                    <select
                      value={guarnicionRecetaId ?? ''}
                      onChange={(e) => setGuarnicionRecetaId(e.target.value || null)}
                      className={selectClassComanda}
                    >
                      <option value="">— Sin guarnición —</option>
                      {guarnicionOpciones.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigoCorto ? `#${r.codigoCorto} · ` : ''}
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                    {recetas.length > 0 && guarnicionOpciones.length === 0 ? (
                      <span className="mt-1 block text-[11px] text-amber-700">
                        No hay recetas de categoría Guarnición en el master.
                      </span>
                    ) : guarnicionOpciones.length > 0 ? (
                      <span className="mt-1 block text-[11px] text-[#8997A6]">
                        {guarnicionOpciones.length} guarnición(es)
                      </span>
                    ) : null}
                  </label>
                  <p className="sm:col-span-2 text-xs text-[#8997A6]">
                    Elegí uno o ambos. El combo es flexible: la misma milanesa puede ir con
                    distintas guarniciones. En stock queda bajo el plato principal como{' '}
                    <strong className="font-semibold text-[#171717]">
                      {nombrePlatoProducido || 'Principal + Guarnición'}
                    </strong>
                    ; no hace falta una receta/menú por cada combinación.
                  </p>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-[#171717] sm:col-span-2">
                    Alimento (recetario) *
                    <select
                      value={principalRecetaId ?? ''}
                      onChange={(e) => {
                        setPrincipalRecetaId(e.target.value || null)
                        setGuarnicionRecetaId(null)
                      }}
                      className={selectClassComanda}
                    >
                      <option value="">— Qué alimento salió —</option>
                      {granelOpciones.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.codigoCorto ? `#${r.codigoCorto} · ` : ''}
                          {r.nombre}
                          {r.categoria === 'Guarnición' ? ' (Guarnición)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-[#171717]">
                    Peso tanda (kg) *
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={pesoKgStr}
                      onChange={(e) => setPesoKgStr(e.target.value)}
                      className={inputClassComanda}
                      placeholder="Ej. 12.5"
                    />
                  </label>
                </>
              )}
              <label className="block text-sm font-medium text-[#171717]">
                {modalidad === 'granel' ? 'Porciones / unidades *' : 'Viandas producidas *'}
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
                Fecha elaboración *
                <input
                  type="date"
                  value={fechaElaboracion}
                  onChange={(e) => setFechaElaboracion(e.target.value)}
                  className={inputClassComanda}
                />
              </label>
              <label className="block text-sm font-medium text-[#171717]">
                Vencimiento (+{DIAS_VENCIMIENTO_PRODUCCION} días)
                <input
                  type="date"
                  value={fechaVencimiento}
                  readOnly
                  className={`${inputClassComanda} cursor-not-allowed bg-neutral-50 opacity-90`}
                />
              </label>
              <div className="sm:col-span-2 xl:col-span-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8997A6]">
                  Código de lote (trazabilidad)
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#171717]">
                  {codigoTrazabilidadPreview ||
                    (modalidad === 'granel'
                      ? 'Completá alimento, fechas y peso…'
                      : 'Elegí principal y/o guarnición y la fecha…')}
                </p>
                {nombrePlatoProducido ? (
                  <p className="mt-1 text-xs font-semibold text-[#171717]">
                    Plato a stock: {nombrePlatoProducido}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-[#8997A6]">
                  Plato #{codigoPlatoResuelto || '—'}
                  {modalidad === 'vianda'
                    ? ` · Guarnición #${codigoGuarnicionResuelto || 'XX'}`
                    : ''}
                  {' · '}Se graba como lote y código de escaneo (V-/G-).
                </p>
              </div>
            </div>
          </div>

          {menuDestinoStock &&
          recetasVinculadas.length === 0 &&
          filas.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              El plato/guarnición elegido no tiene ficha técnica vinculada. Podés agregar insumos
              manualmente o vincular la receta desde el menú / recetario.
            </p>
          ) : null}

          {recetasVinculadas.length > 0 && filas.length === 0 ? (
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
