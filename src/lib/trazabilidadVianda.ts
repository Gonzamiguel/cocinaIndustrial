import {
  filtrarDespachosPorProduccionId,
  type DespachoViandaRegistro,
} from './despachosViandas'
import {
  UBICACION_COCINA_CENTRAL,
  UBICACION_DEPOSITO_CENTRAL,
  ubicacionEfectivaMovimiento,
  type MovimientoEgreso,
  type MovimientoIngreso,
  type MovimientoInventario,
  type ProduccionCocinaRegistro,
  type ProduccionInsumoDetalle,
} from './movimientosInventario'
import type { SolicitudMercaderia } from './solicitudesMercaderia'

export type TipoPasoTrazabilidadVianda =
  | 'INGRESO_CENTRAL'
  | 'SOLICITUD_COCINA'
  | 'TRASLADO_SALIDA'
  | 'RECEPCION_COCINA'
  | 'PRODUCCION_VIANDA'
  | 'DESPACHO_EMPRESA'
  | 'SIN_TRAZA'

export const ETIQUETA_TIPO_PASO: Record<TipoPasoTrazabilidadVianda, string> = {
  INGRESO_CENTRAL: 'Depósito central',
  SOLICITUD_COCINA: 'Solicitud',
  TRASLADO_SALIDA: 'Traslado',
  RECEPCION_COCINA: 'Cocina',
  PRODUCCION_VIANDA: 'Producción',
  DESPACHO_EMPRESA: 'Despacho',
  SIN_TRAZA: 'Sin datos',
}

export interface PasoTrazabilidadVianda {
  id: string
  tipo: TipoPasoTrazabilidadVianda
  fecha: Date | null
  titulo: string
  detalle: string
  insumoNombre?: string
  loteInsumo?: string
  cantidadTexto?: string
}

function normalizarLote(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function fechaMs(fecha: Date | null): number {
  return fecha?.getTime() ?? Number.MAX_SAFE_INTEGER
}

function formatFechaHora(fecha: Date | null): string {
  if (!fecha) return 'Sin fecha registrada'
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCantidad(value: number, unidad: string): string {
  const n = value.toLocaleString('es-AR', { maximumFractionDigits: 4 })
  return unidad ? `${n} ${unidad}` : n
}

function cantidadLoteEnMovimiento(
  movimiento: MovimientoInventario,
  loteNorm: string,
  insumoId: string,
): number {
  let sum = 0
  for (const item of movimiento.items) {
    if (normalizarLote(item.lote ?? '') !== loteNorm) continue
    if (insumoId && item.insumoId !== insumoId) continue
    const q = Number(item.cantidad)
    if (Number.isFinite(q)) sum += Math.abs(q)
  }
  return sum
}

function movimientosConLote(
  movimientos: MovimientoInventario[],
  loteNorm: string,
  insumoId: string,
): MovimientoInventario[] {
  return movimientos.filter((m) =>
    m.items.some(
      (item) =>
        normalizarLote(item.lote ?? '') === loteNorm &&
        (!insumoId || item.insumoId === insumoId),
    ),
  )
}

function esTrasladoACocina(m: MovimientoInventario): m is MovimientoEgreso {
  if (m.tipo !== 'EGRESO') return false
  const eg = m as MovimientoEgreso
  const destUb = eg.ubicacionDestino?.trim().toUpperCase()
  if (destUb === UBICACION_COCINA_CENTRAL) return true
  return (
    ubicacionEfectivaMovimiento(m) === UBICACION_DEPOSITO_CENTRAL &&
    normalizarTexto(eg.destino).includes('cocina')
  )
}

function esRecepcionCocina(m: MovimientoInventario): m is MovimientoIngreso {
  if (m.tipo !== 'INGRESO') return false
  return (
    ubicacionEfectivaMovimiento(m) === UBICACION_COCINA_CENTRAL &&
    Boolean((m as MovimientoIngreso).egresoTrasladoOrigenId?.trim())
  )
}

function etiquetaUbicacionSolicitante(id?: string): string {
  const u = id?.trim().toUpperCase() ?? ''
  if (u === UBICACION_COCINA_CENTRAL) return 'Cocina central'
  if (u === 'CASPOSO') return 'Campamento Casposo'
  if (u === UBICACION_DEPOSITO_CENTRAL) return 'Depósito central'
  return id?.trim() || '—'
}

function pasosInsumoVianda(
  item: ProduccionInsumoDetalle,
  movimientos: MovimientoInventario[],
  solicitudesById: Map<string, SolicitudMercaderia>,
  produccion: ProduccionCocinaRegistro,
): PasoTrazabilidadVianda[] {
  const pasos: PasoTrazabilidadVianda[] = []
  const lote = item.loteInsumo.trim()
  if (!lote) {
    pasos.push({
      id: `sin-lote-${item.insumoId}`,
      tipo: 'SIN_TRAZA',
      fecha: null,
      titulo: `Insumo sin lote registrado · ${item.nombre}`,
      detalle:
        'En la producción no se guardó el lote del insumo. No es posible reconstruir la cadena hasta depósito.',
      insumoNombre: item.nombre,
    })
    return pasos
  }

  const loteNorm = normalizarLote(lote)
  const relacionados = movimientosConLote(movimientos, loteNorm, item.insumoId)
  const solicitudesUsadas = new Set<string>()

  const ingresosCentral = relacionados
    .filter(
      (m) =>
        m.tipo === 'INGRESO' &&
        ubicacionEfectivaMovimiento(m) === UBICACION_DEPOSITO_CENTRAL,
    )
    .sort((a, b) => fechaMs(a.fecha) - fechaMs(b.fecha))

  for (const ing of ingresosCentral) {
    const mov = ing as MovimientoIngreso
    const qty = cantidadLoteEnMovimiento(ing, loteNorm, item.insumoId)
    pasos.push({
      id: `ing-central-${ing.id}`,
      tipo: 'INGRESO_CENTRAL',
      fecha: ing.fecha,
      titulo: 'Ingreso en depósito central',
      detalle: [
        `Proveedor: ${mov.proveedor || '—'}`,
        `Documento: ${mov.tipoDocumento ?? '—'} ${mov.numeroDocumento || '—'}`,
        mov.ordenCompraNumero ? `OC ${mov.ordenCompraNumero}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      insumoNombre: item.nombre,
      loteInsumo: lote,
      cantidadTexto: qty > 0 ? formatCantidad(qty, item.unidad) : undefined,
    })
  }

  const traslados = relacionados
    .filter(esTrasladoACocina)
    .sort((a, b) => fechaMs(a.fecha) - fechaMs(b.fecha))

  for (const eg of traslados) {
    const solicitudId = eg.solicitudId?.trim()
    if (solicitudId && !solicitudesUsadas.has(solicitudId)) {
      solicitudesUsadas.add(solicitudId)
      const sol = solicitudesById.get(solicitudId)
      if (sol) {
        pasos.push({
          id: `sol-${solicitudId}-${item.insumoId}`,
          tipo: 'SOLICITUD_COCINA',
          fecha: sol.fechaCreacion,
          titulo: 'Solicitud de mercadería (cocina)',
          detalle: [
            `Estado: ${sol.estado}`,
            `Prioridad: ${sol.prioridad}`,
            `Entrega esperada: ${sol.fechaEntregaEsperada || '—'}`,
            `Solicitante: ${etiquetaUbicacionSolicitante(sol.ubicacionSolicitanteId)}`,
          ].join(' · '),
          insumoNombre: item.nombre,
          loteInsumo: lote,
        })
      }
    }

    const qty = cantidadLoteEnMovimiento(eg, loteNorm, item.insumoId)
    pasos.push({
      id: `traslado-${eg.id}`,
      tipo: 'TRASLADO_SALIDA',
      fecha: eg.fecha,
      titulo: 'Salida desde depósito central → cocina',
      detalle: [
        `Remito ${eg.numeroDocumento || '—'}`,
        eg.estadoTraslado ? `Estado traslado: ${eg.estadoTraslado}` : null,
        eg.transporte?.patente ? `Patente ${eg.transporte.patente}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      insumoNombre: item.nombre,
      loteInsumo: lote,
      cantidadTexto: qty > 0 ? formatCantidad(qty, item.unidad) : undefined,
    })

    const recepcion = relacionados.find(
      (m) =>
        esRecepcionCocina(m) &&
        (m as MovimientoIngreso).egresoTrasladoOrigenId === eg.id,
    ) as MovimientoIngreso | undefined

    if (recepcion) {
      const qtyRec = cantidadLoteEnMovimiento(recepcion, loteNorm, item.insumoId)
      pasos.push({
        id: `recep-cocina-${recepcion.id}`,
        tipo: 'RECEPCION_COCINA',
        fecha: recepcion.fecha,
        titulo: 'Recepción en cocina central',
        detalle: `Documento ${recepcion.numeroDocumento || '—'} · Cierra traslado ${eg.numeroDocumento || eg.id.slice(0, 8)}`,
        insumoNombre: item.nombre,
        loteInsumo: lote,
        cantidadTexto: qtyRec > 0 ? formatCantidad(qtyRec, item.unidad) : undefined,
      })
    } else if (eg.estadoTraslado === 'EN_TRANSITO') {
      pasos.push({
        id: `recep-pend-${eg.id}`,
        tipo: 'RECEPCION_COCINA',
        fecha: null,
        titulo: 'Recepción en cocina · pendiente',
        detalle: 'El traslado aún no fue confirmado en cocina central.',
        insumoNombre: item.nombre,
        loteInsumo: lote,
      })
    }
  }

  if (ingresosCentral.length === 0 && traslados.length === 0) {
    pasos.push({
      id: `sin-mov-${item.insumoId}-${loteNorm}`,
      tipo: 'SIN_TRAZA',
      fecha: null,
      titulo: `Sin movimientos de stock para lote ${lote}`,
      detalle:
        'No encontramos ingreso en central ni traslado a cocina con este lote. Puede ser stock histórico o lote mal cargado en producción.',
      insumoNombre: item.nombre,
      loteInsumo: lote,
    })
  }

  const qtyProd =
    item.cantidadReal > 0 ? item.cantidadReal : item.cantidadTeorica
  pasos.push({
    id: `prod-uso-${produccion.id}-${item.insumoId}`,
    tipo: 'PRODUCCION_VIANDA',
    fecha: produccion.fecha,
    titulo: `Usado en producción · ${produccion.nombreProducto}`,
    detalle: `Lote vianda ${produccion.loteProducto} · ${qtyProd > 0 ? formatCantidad(qtyProd, item.unidad) : 'cantidad no informada'} consumida en este batch`,
    insumoNombre: item.nombre,
    loteInsumo: lote,
    cantidadTexto: qtyProd > 0 ? formatCantidad(qtyProd, item.unidad) : undefined,
  })

  return pasos
}

export function construirTimelineVianda(input: {
  produccion: ProduccionCocinaRegistro
  movimientos: MovimientoInventario[]
  solicitudes: SolicitudMercaderia[]
  despachos: DespachoViandaRegistro[]
}): PasoTrazabilidadVianda[] {
  const { produccion, movimientos, solicitudes, despachos } = input
  const solicitudesById = new Map(solicitudes.map((s) => [s.id, s] as const))
  const pasos: PasoTrazabilidadVianda[] = []

  for (const item of produccion.itemsDetalle) {
    pasos.push(...pasosInsumoVianda(item, movimientos, solicitudesById, produccion))
  }

  pasos.push({
    id: `prod-${produccion.id}`,
    tipo: 'PRODUCCION_VIANDA',
    fecha: produccion.fecha,
    titulo: `Producción registrada · ${produccion.nombreProducto}`,
    detalle: [
      `${produccion.cantidadPorciones} viandas`,
      `Receta ${produccion.recetaNombre}`,
      `Vto ${produccion.fechaVencimiento}`,
      produccion.codigoTrazabilidad
        ? `Código ${produccion.codigoTrazabilidad}`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  })

  const despachosRel = filtrarDespachosPorProduccionId(despachos, produccion.id)
  for (const d of despachosRel) {
    const lineas = d.items.flatMap((it) =>
      it.lotes
        .filter((l) => l.produccionId === produccion.id)
        .map((l) => `${l.cantidad} × ${it.nombrePlato}`),
    )
    pasos.push({
      id: `desp-${d.id}`,
      tipo: 'DESPACHO_EMPRESA',
      fecha: d.fecha,
      titulo: `Despacho · ${d.empresa}`,
      detalle: [
        `Remito ${d.numeroRemito || d.id.slice(0, 8)}`,
        d.lugarEntrega ? `Entrega: ${d.lugarEntrega}` : null,
        d.fechaConsumoPedidos ? `Consumo: ${d.fechaConsumoPedidos}` : null,
        lineas.length > 0 ? lineas.join(', ') : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  if (despachosRel.length === 0) {
    pasos.push({
      id: `desp-pend-${produccion.id}`,
      tipo: 'DESPACHO_EMPRESA',
      fecha: null,
      titulo: 'Despacho a cliente · pendiente',
      detalle: 'Este lote de viandas aún no figura en un remito de salida.',
    })
  }

  return pasos.sort((a, b) => {
    const aEsDespacho = a.tipo === 'DESPACHO_EMPRESA'
    const bEsDespacho = b.tipo === 'DESPACHO_EMPRESA'
    if (aEsDespacho !== bEsDespacho) return aEsDespacho ? 1 : -1

    const ta = fechaMs(a.fecha)
    const tb = fechaMs(b.fecha)
    if (ta !== tb) return ta - tb
    const ordenTipo: Record<TipoPasoTrazabilidadVianda, number> = {
      INGRESO_CENTRAL: 1,
      SOLICITUD_COCINA: 2,
      TRASLADO_SALIDA: 3,
      RECEPCION_COCINA: 4,
      PRODUCCION_VIANDA: 5,
      DESPACHO_EMPRESA: 6,
      SIN_TRAZA: 99,
    }
    return ordenTipo[a.tipo] - ordenTipo[b.tipo]
  })
}

export function agruparPasosPorInsumo(
  pasos: PasoTrazabilidadVianda[],
): { insumo: string; lote: string; pasos: PasoTrazabilidadVianda[] }[] {
  const map = new Map<string, PasoTrazabilidadVianda[]>()
  for (const p of pasos) {
    if (p.tipo === 'DESPACHO_EMPRESA' && p.id.startsWith('desp-')) continue
    if (p.tipo === 'PRODUCCION_VIANDA' && p.id.startsWith('prod-')) continue
    const key = `${p.insumoNombre ?? '—'}::${p.loteInsumo ?? ''}`
    const prev = map.get(key) ?? []
    prev.push(p)
    map.set(key, prev)
  }
  return [...map.entries()].map(([key, grupo]) => {
    const [insumo, lote] = key.split('::')
    return { insumo, lote, pasos: grupo }
  })
}

export { formatFechaHora as formatFechaHoraTrazabilidadVianda }
