import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import type { Cama, PadronPersona } from '../../types/hoteleria'
import {
  actualizarFechaSalidaEstimadaTransaccion,
  assertFechaCheckOutRealNoEsFutura,
  buscarCamaOcupadaPorPersona,
  buscarPersonaPadronPorId,
  buscarPersonaPorDni,
  checkInCamaTransaccion,
  checkInCamasMasivoBatch,
  checkOutCamaTransaccion,
  checkOutCamasMasivoBatch,
  marcarCamaMantenimiento,
  registrarLimpiezaCamasBatch,
  subscribeCamas,
  subscribePadronPersonas,
  trasladarCamaTransaccion,
  trasladarCamasMasivoBatch,
} from '../../lib/hoteleria'

type ModalTipo =
  | null
  | { tipo: 'checkin'; cama: Cama }
  | { tipo: 'checkout'; cama: Cama }
  | { tipo: 'sucia'; cama: Cama }
  | { tipo: 'mantenimiento'; cama: Cama }

type ModalMasivoTipo = null | 'checkin' | 'checkout' | 'traslado' | 'limpieza'

function hoyYmdLocal(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parseYmdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0)
}

function dateToYmdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function formatoSalidaPrevista(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function etiquetaNombrePersona(p: PadronPersona): string {
  const t = `${p.nombre} ${p.apellido}`.trim()
  return t || 'Esta persona'
}

function estilosCama(estado: Cama['estado']): string {
  switch (estado) {
    case 'LIBRE':
      return 'bg-green-100 border-green-500 hover:brightness-[1.02]'
    case 'OCUPADA':
      return 'bg-red-100 border-red-500 hover:brightness-[1.02]'
    case 'SUCIA':
      return 'bg-yellow-100 border-yellow-500 hover:brightness-[1.02]'
    case 'MANTENIMIENTO':
      return 'bg-gray-100 border-gray-400 hover:brightness-[1.02]'
    default:
      return 'bg-neutral-50 border-neutral-300'
  }
}

export function MapaCamasPage() {
  const { showToast } = useToast()
  const [camas, setCamas] = useState<Cama[]>([])
  const [padron, setPadron] = useState<PadronPersona[]>([])
  const [modal, setModal] = useState<ModalTipo>(null)
  const [busy, setBusy] = useState(false)

  const [dniCheckIn, setDniCheckIn] = useState('')
  const [personaCheckIn, setPersonaCheckIn] = useState<PadronPersona | null>(null)
  const [fechaCheckIn, setFechaCheckIn] = useState(hoyYmdLocal())
  const [fechaSalidaEstimadaCheckIn, setFechaSalidaEstimadaCheckIn] = useState('')

  const [fechaMovimientoTraslado, setFechaMovimientoTraslado] = useState(hoyYmdLocal())
  const [fechaCheckOutReal, setFechaCheckOutReal] = useState(hoyYmdLocal())
  const [modoOcupada, setModoOcupada] = useState<'estadia' | 'traslado' | 'checkout_real'>('estadia')
  const [camaDestinoId, setCamaDestinoId] = useState('')
  const [fechaSalidaEstimadaEdicion, setFechaSalidaEstimadaEdicion] = useState('')

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedCamas, setSelectedCamas] = useState<string[]>([])
  const [modalMasivo, setModalMasivo] = useState<ModalMasivoTipo>(null)
  const [fechaMasivo, setFechaMasivo] = useState(hoyYmdLocal())
  const [masivoDni, setMasivoDni] = useState<Record<string, string>>({})
  const [masivoPersona, setMasivoPersona] = useState<Record<string, PadronPersona | null>>({})
  const [masivoFechaSalidaEstimada, setMasivoFechaSalidaEstimada] = useState('')
  const [masivoCheckinCamaIdsConError, setMasivoCheckinCamaIdsConError] = useState<string[]>([])
  const [responsableLimpieza, setResponsableLimpieza] = useState('')
  const [trasladoDestinoPorOrigen, setTrasladoDestinoPorOrigen] = useState<Record<string, string>>(
    {},
  )
  const [checkoutPersonaResuelta, setCheckoutPersonaResuelta] = useState<PadronPersona | null>(
    null,
  )
  const [checkoutPersonaCargando, setCheckoutPersonaCargando] = useState(false)

  const necesitaPadron = useMemo(() => {
    if (camas.some((c) => c.estado === 'OCUPADA')) return true
    if (modal?.tipo === 'checkin') return true
    if (modalMasivo === 'checkin') return true
    return false
  }, [camas, modal, modalMasivo])

  useEffect(() => {
    const unsub = subscribeCamas(setCamas)
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!necesitaPadron) {
      setPadron([])
      return
    }
    const unsub = subscribePadronPersonas(setPadron)
    return () => unsub()
  }, [necesitaPadron])

  useEffect(() => {
    if (!isMultiSelectMode) setSelectedCamas([])
  }, [isMultiSelectMode])

  const camasById = useMemo(() => {
    const m = new Map<string, Cama>()
    for (const c of camas) m.set(c.id, c)
    return m
  }, [camas])

  const padronById = useMemo(() => {
    const m = new Map<string, PadronPersona>()
    for (const p of padron) m.set(p.id, p)
    return m
  }, [padron])

  useEffect(() => {
    if (modal?.tipo !== 'checkout' || !modal.cama.personaId) {
      setCheckoutPersonaResuelta(null)
      setCheckoutPersonaCargando(false)
      return
    }
    const personaId = modal.cama.personaId
    const desdeCache = padronById.get(personaId)
    if (desdeCache) {
      setCheckoutPersonaResuelta(desdeCache)
      setCheckoutPersonaCargando(false)
      return
    }
    let cancelado = false
    setCheckoutPersonaCargando(true)
    setCheckoutPersonaResuelta(null)
    void (async () => {
      try {
        const p = await buscarPersonaPadronPorId(personaId)
        if (!cancelado) setCheckoutPersonaResuelta(p)
      } finally {
        if (!cancelado) setCheckoutPersonaCargando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [modal, padronById])

  const nombreEnCama = useCallback(
    (c: Cama): string => {
      const den = c.ocupanteNombre?.trim()
      if (den) return den
      if (!c.personaId) return ''
      const p = padronById.get(c.personaId)
      if (!p) return 'Huésped'
      return `${p.apellido}, ${p.nombre}`.trim()
    },
    [padronById],
  )

  /** Nombre y apellido para la tarjeta del mapa (sin empresa). */
  const nombreApellidoEnTarjetaCama = useCallback(
    (c: Cama): string => {
      if (!c.personaId && !c.ocupanteNombre?.trim()) return ''
      const p = c.personaId ? padronById.get(c.personaId) : undefined
      if (p) return `${p.nombre} ${p.apellido}`.trim()
      const den = c.ocupanteNombre?.trim()
      if (den) {
        const parts = den.split(',').map((s) => s.trim())
        if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.trim()
        return den
      }
      return 'Huésped'
    },
    [padronById],
  )

  const empresaEnCama = useCallback(
    (c: Cama): string => {
      const de = c.ocupanteEmpresa?.trim()
      if (de) return de
      if (!c.personaId) return ''
      return padronById.get(c.personaId)?.empresa?.trim() ?? ''
    },
    [padronById],
  )

  const agrupado = useMemo(() => {
    const porSector = new Map<string, Map<string, Cama[]>>()
    for (const c of camas) {
      const sec = c.sector || '—'
      const hab = c.habitacion || '—'
      if (!porSector.has(sec)) porSector.set(sec, new Map())
      const m = porSector.get(sec)!
      if (!m.has(hab)) m.set(hab, [])
      m.get(hab)!.push(c)
    }
    for (const m of porSector.values()) {
      for (const arr of m.values()) {
        arr.sort((a, b) =>
          a.denominacion.localeCompare(b.denominacion, 'es', { numeric: true }),
        )
      }
    }
    const unicos = new Set<string>()
    for (const c of camas) unicos.add(c.sector || '—')
    const sectores = [...unicos].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
    return { porSector, sectores }
  }, [camas])

  const [sectorActivo, setSectorActivo] = useState<string | null>(null)

  useEffect(() => {
    if (agrupado.sectores.length === 0) {
      setSectorActivo(null)
      return
    }
    setSectorActivo((prev) => {
      if (prev != null && agrupado.sectores.includes(prev)) return prev
      return agrupado.sectores[0]!
    })
  }, [agrupado.sectores])

  const camasSeleccionadasOrdenadas = useMemo(() => {
    return selectedCamas
      .map((id) => camasById.get(id))
      .filter((c): c is Cama => Boolean(c))
      .sort((a, b) =>
        `${a.sector} ${a.habitacion} ${a.denominacion}`.localeCompare(
          `${b.sector} ${b.habitacion} ${b.denominacion}`,
          'es',
          { numeric: true, sensitivity: 'base' },
        ),
      )
  }, [selectedCamas, camasById])

  const tipoSeleccionMasiva = useMemo(() => {
    if (selectedCamas.length === 0) return null
    const first = camasById.get(selectedCamas[0]!)
    return first?.estado ?? null
  }, [selectedCamas, camasById])

  const camasDestinoMover = useMemo(() => {
    if (!modal || modal.tipo !== 'checkout') return []
    return camas
      .filter((c) => c.estado === 'LIBRE' && c.id !== modal.cama.id)
      .sort((a, b) =>
        `${a.sector} ${a.habitacion} ${a.denominacion}`.localeCompare(
          `${b.sector} ${b.habitacion} ${b.denominacion}`,
          'es',
          { numeric: true, sensitivity: 'base' },
        ),
      )
  }, [camas, modal])

  const camaModalOcupada = useMemo(() => {
    if (modal?.tipo !== 'checkout') return null
    return camasById.get(modal.cama.id) ?? modal.cama
  }, [modal, camasById])

  function toggleSeleccionCama(c: Cama) {
    if (c.estado === 'MANTENIMIENTO') {
      showToast(
        'Las camas en mantenimiento no se pueden incluir en la selección múltiple.',
        'error',
      )
      return
    }
    const ya = selectedCamas.includes(c.id)
    if (ya) {
      setSelectedCamas((prev) => prev.filter((id) => id !== c.id))
      return
    }
    if (selectedCamas.length > 0) {
      const primero = camasById.get(selectedCamas[0]!)
      if (primero && primero.estado !== c.estado) {
        showToast(
          'Solo podés combinar camas del mismo estado: todas libres, todas ocupadas o todas sucias.',
          'error',
        )
        return
      }
    }
    setSelectedCamas((prev) => [...prev, c.id])
  }

  function handleClicCama(c: Cama) {
    if (isMultiSelectMode) {
      toggleSeleccionCama(c)
      return
    }
    abrirSegunCama(c)
  }

  function abrirSegunCama(c: Cama) {
    if (c.estado === 'LIBRE') {
      setDniCheckIn('')
      setPersonaCheckIn(null)
      setFechaCheckIn(hoyYmdLocal())
      setFechaSalidaEstimadaCheckIn('')
      setModal({ tipo: 'checkin', cama: c })
      return
    }
    if (c.estado === 'OCUPADA') {
      setModoOcupada('estadia')
      setFechaCheckOutReal(hoyYmdLocal())
      setFechaMovimientoTraslado(hoyYmdLocal())
      setCamaDestinoId('')
      setFechaSalidaEstimadaEdicion(
        c.fechaSalidaEstimada ? dateToYmdLocal(c.fechaSalidaEstimada) : '',
      )
      setModal({ tipo: 'checkout', cama: c })
      return
    }
    if (c.estado === 'SUCIA') {
      setResponsableLimpieza('')
      setModal({ tipo: 'sucia', cama: c })
      return
    }
    if (c.estado === 'MANTENIMIENTO') {
      setModal({ tipo: 'mantenimiento', cama: c })
    }
  }

  async function buscarDni() {
    const d = dniCheckIn.trim()
    if (!d) {
      setPersonaCheckIn(null)
      return
    }
    setBusy(true)
    try {
      const p = await buscarPersonaPorDni(d)
      setPersonaCheckIn(p)
      if (!p) showToast('No se encontró ninguna persona con ese DNI.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarCheckIn() {
    if (!modal || modal.tipo !== 'checkin') return
    if (!personaCheckIn) {
      showToast('Buscá y seleccioná una persona del padrón por DNI.', 'error')
      return
    }
    setBusy(true)
    try {
      const camaOcupada = await buscarCamaOcupadaPorPersona(personaCheckIn.id)
      if (camaOcupada) {
        showToast(
          `Error: ${etiquetaNombrePersona(personaCheckIn)} ya se encuentra ocupando una cama. Debe hacerle Check-Out o Traslado primero.`,
          'error',
        )
        return
      }
      await checkInCamaTransaccion({
        camaId: modal.cama.id,
        personaId: personaCheckIn.id,
        fecha: parseYmdToLocalDate(fechaCheckIn),
        fechaSalidaEstimada: fechaSalidaEstimadaCheckIn.trim()
          ? parseYmdToLocalDate(fechaSalidaEstimadaCheckIn.trim())
          : null,
      })
      showToast('Check-in registrado correctamente.', 'success')
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en check-in.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function guardarFechaSalidaEstimadaEdicion() {
    if (!modal || modal.tipo !== 'checkout') return
    const c = camasById.get(modal.cama.id) ?? modal.cama
    if (!c.historialAbiertoId) {
      showToast('Esta cama no tiene historial activo.', 'error')
      return
    }
    setBusy(true)
    try {
      await actualizarFechaSalidaEstimadaTransaccion({
        camaId: c.id,
        fechaSalidaEstimada: fechaSalidaEstimadaEdicion.trim()
          ? parseYmdToLocalDate(fechaSalidaEstimadaEdicion.trim())
          : null,
      })
      showToast('Fecha estimada de salida actualizada.', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarTrasladoDesdeModal() {
    if (!modal || modal.tipo !== 'checkout') return
    const c = camasById.get(modal.cama.id) ?? modal.cama
    if (!c.historialAbiertoId) {
      showToast(
        'Esta cama no tiene vínculo de historial activo. Contactá a sistemas para regularizar datos.',
        'error',
      )
      return
    }
    if (!camaDestinoId) {
      showToast('Elegí una cama destino libre.', 'error')
      return
    }
    setBusy(true)
    try {
      await trasladarCamaTransaccion({
        camaOrigenId: c.id,
        camaDestinoId,
        fecha: parseYmdToLocalDate(fechaMovimientoTraslado),
      })
      showToast('Movimiento de cama completado.', 'success')
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en la operación.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarCheckOutReal() {
    if (!modal || modal.tipo !== 'checkout') return
    const c = camasById.get(modal.cama.id) ?? modal.cama
    if (!c.historialAbiertoId) {
      showToast(
        'Esta cama no tiene vínculo de historial activo. Contactá a sistemas para regularizar datos.',
        'error',
      )
      return
    }
    const fecha = parseYmdToLocalDate(fechaCheckOutReal)
    try {
      assertFechaCheckOutRealNoEsFutura(fecha)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Fecha no válida.', 'error')
      return
    }
    setBusy(true)
    try {
      await checkOutCamaTransaccion({
        camaId: c.id,
        fechaCheckOut: fecha,
      })
      showToast('Check-out registrado. La cama quedó en limpieza.', 'success')
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en la operación.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmarRegistroLimpiezaIndividual() {
    if (!modal || modal.tipo !== 'sucia') return
    const r = responsableLimpieza.trim()
    if (!r) {
      showToast('Completá el responsable de limpieza antes de guardar.', 'error')
      return
    }
    const c = camasById.get(modal.cama.id) ?? modal.cama
    if (c.estado !== 'SUCIA') {
      showToast('Esta cama ya no está en estado Sucia. Actualizá el mapa.', 'error')
      return
    }
    setBusy(true)
    try {
      await registrarLimpiezaCamasBatch(
        [{ camaId: c.id, sector: c.sector, habitacion: c.habitacion }],
        r,
      )
      showToast('Limpieza registrada correctamente. Camas liberadas.', 'success')
      setModal(null)
      setResponsableLimpieza('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo registrar la limpieza.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function abrirModalMasivoLimpieza() {
    if (selectedCamas.length === 0) return
    setResponsableLimpieza('')
    setModalMasivo('limpieza')
  }

  async function confirmarRegistroLimpiezaMasivo() {
    const r = responsableLimpieza.trim()
    if (!r) {
      showToast('Completá el responsable de limpieza antes de guardar.', 'error')
      return
    }
    const items: { camaId: string; sector: string; habitacion: string }[] = []
    for (const id of selectedCamas) {
      const c = camasById.get(id)
      if (!c || c.estado !== 'SUCIA') {
        showToast('Alguna cama seleccionada ya no está sucia. Actualizá la selección.', 'error')
        return
      }
      items.push({ camaId: c.id, sector: c.sector, habitacion: c.habitacion })
    }
    if (!items.length) return
    setBusy(true)
    try {
      await registrarLimpiezaCamasBatch(items, r)
      showToast('Limpieza registrada correctamente. Camas liberadas.', 'success')
      setModalMasivo(null)
      setSelectedCamas([])
      setResponsableLimpieza('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo registrar la limpieza.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function liberarMantenimiento() {
    if (!modal || modal.tipo !== 'mantenimiento') return
    setBusy(true)
    try {
      await marcarCamaMantenimiento(modal.cama.id, false)
      showToast('Cama disponible nuevamente.', 'success')
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const sugerenciasDni = useMemo(() => {
    const t = dniCheckIn.trim().toLowerCase()
    if (t.length < 2) return []
    return padron
      .filter((p) => p.dni.toLowerCase().includes(t))
      .slice(0, 8)
  }, [dniCheckIn, padron])

  const camasLibresParaTrasladoMasivo = useMemo(() => {
    return camas
      .filter((c) => c.estado === 'LIBRE' && !selectedCamas.includes(c.id))
      .sort((a, b) =>
        `${a.sector} ${a.habitacion} ${a.denominacion}`.localeCompare(
          `${b.sector} ${b.habitacion} ${b.denominacion}`,
          'es',
          { numeric: true, sensitivity: 'base' },
        ),
      )
  }, [camas, selectedCamas])

  function destinosDisponiblesTrasladoFila(origenId: string): Cama[] {
    const ocupadosPorOtrasFilas = new Set<string>()
    for (const [oid, did] of Object.entries(trasladoDestinoPorOrigen)) {
      if (oid !== origenId && did) ocupadosPorOtrasFilas.add(did)
    }
    return camasLibresParaTrasladoMasivo.filter(
      (c) => !ocupadosPorOtrasFilas.has(c.id) || trasladoDestinoPorOrigen[origenId] === c.id,
    )
  }

  async function buscarDniMasivoFila(camaId: string) {
    const d = (masivoDni[camaId] ?? '').trim()
    if (!d) {
      setMasivoPersona((prev) => ({ ...prev, [camaId]: null }))
      return
    }
    setMasivoCheckinCamaIdsConError([])
    setBusy(true)
    try {
      const p = await buscarPersonaPorDni(d)
      setMasivoPersona((prev) => ({ ...prev, [camaId]: p }))
      if (!p) showToast('No se encontró persona con ese DNI.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function abrirModalMasivoCheckin() {
    setFechaMasivo(hoyYmdLocal())
    const dniInit: Record<string, string> = {}
    const perInit: Record<string, PadronPersona | null> = {}
    for (const id of selectedCamas) {
      dniInit[id] = ''
      perInit[id] = null
    }
    setMasivoDni(dniInit)
    setMasivoPersona(perInit)
    setMasivoFechaSalidaEstimada('')
    setMasivoCheckinCamaIdsConError([])
    setModalMasivo('checkin')
  }

  async function confirmarMasivoCheckin() {
    setMasivoCheckinCamaIdsConError([])
    const fecha = parseYmdToLocalDate(fechaMasivo)
    const fseMasivo = masivoFechaSalidaEstimada.trim()
      ? parseYmdToLocalDate(masivoFechaSalidaEstimada.trim())
      : null

    type FilaMasiva = { cama: Cama; persona: PadronPersona }
    const filas: FilaMasiva[] = []
    for (const c of camasSeleccionadasOrdenadas) {
      const p = masivoPersona[c.id]
      if (!p) {
        showToast(`Falta asignar persona (DNI) para la cama ${c.denominacion}.`, 'error')
        return
      }
      filas.push({ cama: c, persona: p })
    }

    const porPersonaId = new Map<string, string[]>()
    for (const { cama, persona } of filas) {
      const arr = porPersonaId.get(persona.id) ?? []
      arr.push(cama.id)
      porPersonaId.set(persona.id, arr)
    }
    const camaIdsDuplicadosLocales: string[] = []
    for (const [, ids] of porPersonaId) {
      if (ids.length > 1) camaIdsDuplicadosLocales.push(...ids)
    }
    if (camaIdsDuplicadosLocales.length > 0) {
      setMasivoCheckinCamaIdsConError(camaIdsDuplicadosLocales)
      showToast('Error: Has ingresado a la misma persona más de una vez en esta lista.', 'error')
      return
    }

    const items = filas.map(({ cama, persona: p }) => {
      const ocupanteNombre =
        `${p.apellido}, ${p.nombre}`.trim() || p.nombre || p.apellido || 'Huésped'
      return {
        camaId: cama.id,
        personaId: p.id,
        empresa: (p.empresa ?? '').trim(),
        ocupanteNombre,
        fecha,
        fechaSalidaEstimada: fseMasivo,
      }
    })

    setBusy(true)
    try {
      const pidsUnicos = [...new Set(items.map((it) => it.personaId))]
      for (const pid of pidsUnicos) {
        const camaOcupada = await buscarCamaOcupadaPorPersona(pid)
        if (camaOcupada) {
          const persona = filas.find((f) => f.persona.id === pid)!.persona
          const camaIdsAfectadas = filas.filter((f) => f.persona.id === pid).map((f) => f.cama.id)
          setMasivoCheckinCamaIdsConError(camaIdsAfectadas)
          showToast(
            `Error: ${etiquetaNombrePersona(persona)} ya se encuentra ocupando una cama. Debe hacerle Check-Out o Traslado primero.`,
            'error',
          )
          return
        }
      }

      await checkInCamasMasivoBatch(items)
      showToast(`Check-in masivo: ${items.length} camas.`, 'success')
      setModalMasivo(null)
      setSelectedCamas([])
      setMasivoCheckinCamaIdsConError([])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en check-in masivo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function abrirModalMasivoCheckout() {
    for (const c of camasSeleccionadasOrdenadas) {
      if (!c.historialAbiertoId) {
        showToast(
          `La cama ${c.denominacion} no tiene historial activo; no se puede incluir en check-out masivo.`,
          'error',
        )
        return
      }
    }
    setFechaMasivo(hoyYmdLocal())
    setModalMasivo('checkout')
  }

  async function confirmarMasivoCheckout() {
    const fecha = parseYmdToLocalDate(fechaMasivo)
    try {
      assertFechaCheckOutRealNoEsFutura(fecha)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'La fecha de check-out no puede ser futura.', 'error')
      return
    }
    const items = camasSeleccionadasOrdenadas.map((c) => ({
      camaId: c.id,
      historialAbiertoId: c.historialAbiertoId!,
      fechaCheckOut: fecha,
    }))
    setBusy(true)
    try {
      await checkOutCamasMasivoBatch(items)
      showToast(`Check-out masivo: ${items.length} camas.`, 'success')
      setModalMasivo(null)
      setSelectedCamas([])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en check-out masivo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function abrirModalMasivoTraslado() {
    for (const c of camasSeleccionadasOrdenadas) {
      if (!c.historialAbiertoId || !c.personaId) {
        showToast(`La cama ${c.denominacion} no tiene datos de ocupación completos.`, 'error')
        return
      }
    }
    if (camasLibresParaTrasladoMasivo.length < camasSeleccionadasOrdenadas.length) {
      showToast(
        'No hay suficientes camas libres para trasladar todas las seleccionadas. Liberá camas primero.',
        'error',
      )
      return
    }
    setFechaMasivo(hoyYmdLocal())
    setTrasladoDestinoPorOrigen({})
    setModalMasivo('traslado')
  }

  async function confirmarMasivoTraslado() {
    const fecha = parseYmdToLocalDate(fechaMasivo)
    const items: {
      camaOrigenId: string
      camaDestinoId: string
      personaId: string
      empresa: string
      ocupanteNombre: string
      historialAbiertoIdOrigen: string
      fecha: Date
      fechaSalidaEstimada?: Date | null
    }[] = []
    for (const c of camasSeleccionadasOrdenadas) {
      const dest = trasladoDestinoPorOrigen[c.id]?.trim()
      if (!dest) {
        showToast(`Elegí cama destino para ${c.denominacion}.`, 'error')
        return
      }
      const p = padronById.get(c.personaId!)
      const ocupanteNombre =
        c.ocupanteNombre?.trim() ||
        (p ? `${p.apellido}, ${p.nombre}`.trim() : '') ||
        'Huésped'
      items.push({
        camaOrigenId: c.id,
        camaDestinoId: dest,
        personaId: c.personaId!,
        empresa: (p?.empresa ?? c.ocupanteEmpresa ?? '').trim(),
        ocupanteNombre,
        historialAbiertoIdOrigen: c.historialAbiertoId!,
        fecha,
        fechaSalidaEstimada: c.fechaSalidaEstimada ?? null,
      })
    }
    setBusy(true)
    try {
      await trasladarCamasMasivoBatch(items)
      showToast(`Traslado masivo: ${items.length} movimientos.`, 'success')
      setModalMasivo(null)
      setSelectedCamas([])
      setTrasladoDestinoPorOrigen({})
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error en traslado masivo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-3 sm:px-5 sm:py-4">
        {camas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-600">
            No hay camas cargadas. Configurá plazas en{' '}
            <Link
              to="/hoteleria/configuracion"
              className="font-semibold text-[#CD1818] underline-offset-2 hover:underline"
            >
              Configuración de campamento
            </Link>
            .
          </div>
        ) : (
          <div className={`flex flex-col gap-4 ${selectedCamas.length > 0 ? 'pb-28' : ''}`}>
            <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-800" id="label-multi">
                  Selección múltiple
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isMultiSelectMode}
                  aria-labelledby="label-multi"
                  onClick={() => setIsMultiSelectMode((v) => !v)}
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818] focus-visible:ring-offset-2 ${
                    isMultiSelectMode ? 'bg-[#CD1818]' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      isMultiSelectMode ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-neutral-500 sm:max-w-md sm:text-right">
                Con el modo activo, cada clic suma o quita camas del mismo estado. Las acciones
                aparecen abajo.
              </p>
            </div>

            <nav
              className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:flex-nowrap sm:overflow-x-auto sm:pb-2"
              role="tablist"
              aria-label="Sectores"
            >
              {agrupado.sectores.map((sector) => {
                const activo = sectorActivo === sector
                return (
                  <button
                    key={sector}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setSectorActivo(sector)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CD1818]/40 focus-visible:ring-offset-2 ${
                      activo
                        ? 'bg-[#CD1818] text-white shadow-sm'
                        : 'border border-neutral-200 bg-white text-neutral-600 hover:border-[#CD1818]/20 hover:bg-[#CD1818]/5 hover:text-[#171717]'
                    }`}
                  >
                    {sector}
                  </button>
                )
              })}
            </nav>

            {sectorActivo != null && agrupado.porSector.has(sectorActivo) ? (
              <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="grid auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...agrupado.porSector.get(sectorActivo)!.keys()]
                    .sort((a, b) =>
                      a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }),
                    )
                    .map((hab) => {
                      const habitaciones = agrupado.porSector.get(sectorActivo)!
                      return (
                        <div
                          key={`${sectorActivo}-${hab}`}
                          className="flex h-full min-h-0 flex-col rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
                        >
                          <h3 className="text-center text-sm font-medium text-gray-900">
                            Habitación <span className="font-semibold">{hab}</span>
                          </h3>
                          <div className="mt-3 flex min-h-0 flex-grow flex-wrap content-start gap-3">
                            {habitaciones.get(hab)!.map((c) => {
                              const sel = selectedCamas.includes(c.id)
                              const salidaPreviaTexto =
                                c.estado === 'OCUPADA' && c.fechaSalidaEstimada
                                  ? formatoSalidaPrevista(c.fechaSalidaEstimada)
                                  : ''
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleClicCama(c)}
                                  className={`relative flex min-h-[5.5rem] w-[7.5rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center text-xs shadow-sm transition ${estilosCama(c.estado)} ${
                                    sel
                                      ? 'z-[1] ring-4 ring-[#CD1818] ring-offset-2 ring-offset-white'
                                      : ''
                                  }`}
                                >
                                  {sel ? (
                                    <span
                                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#CD1818] text-[10px] font-bold text-white shadow"
                                      aria-hidden
                                    >
                                      ✓
                                    </span>
                                  ) : null}
                                  <span className="line-clamp-2 font-semibold leading-tight text-gray-900">
                                    {c.denominacion}
                                  </span>
                                {c.estado === 'OCUPADA' ? (
                                  <>
                                    <span className="mt-1 line-clamp-2 text-[10px] font-normal leading-tight text-gray-800">
                                      {nombreApellidoEnTarjetaCama(c)}
                                    </span>
                                    {salidaPreviaTexto ? (
                                      <span className="mt-0.5 text-xs text-gray-700">
                                        Salida previa: {salidaPreviaTexto}
                                      </span>
                                    ) : null}
                                  </>
                                ) : c.estado === 'SUCIA' ? (
                                  <span className="mt-1 text-[10px] font-normal text-gray-800">
                                    Pend. limpieza
                                  </span>
                                ) : c.estado === 'MANTENIMIENTO' ? (
                                  <span className="mt-1 text-[10px] font-normal text-gray-800">
                                    Mantenimiento
                                  </span>
                                ) : (
                                  <span className="mt-1 text-[10px] font-normal text-gray-800">
                                    Libre
                                  </span>
                                )}
                                {c.estado === 'OCUPADA' && !c.historialAbiertoId ? (
                                  <span className="mt-0.5 text-[9px] font-bold text-gray-900">
                                    Sin historial
                                  </span>
                                ) : null}
                              </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      {modal?.tipo === 'checkin' ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-neutral-900">Check-in</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Cama: {modal.cama.sector} · {modal.cama.habitacion} · {modal.cama.denominacion}
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">Fecha de ingreso</span>
              <input
                type="date"
                value={fechaCheckIn}
                onChange={(e) => setFechaCheckIn(e.target.value)}
                className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">
                Fecha estimada de salida (opcional)
              </span>
              <input
                type="date"
                value={fechaSalidaEstimadaCheckIn}
                onChange={(e) => setFechaSalidaEstimadaCheckIn(e.target.value)}
                className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
              />
              <span className="mt-1 block text-[11px] text-neutral-500">
                Planificación: no ejecuta el check-out. Podés cambiarla después desde la cama
                ocupada.
              </span>
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">DNI (padrón)</span>
              <div className="mt-1 flex gap-2">
                <input
                  value={dniCheckIn}
                  onChange={(e) => {
                    setDniCheckIn(e.target.value)
                    setPersonaCheckIn(null)
                  }}
                  className="min-h-10 flex-1 rounded-xl border border-neutral-200 px-3 text-sm font-mono outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
                  placeholder="Sin puntos"
                />
                <button
                  type="button"
                  onClick={() => void buscarDni()}
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-[#CD1818] px-4 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
                >
                  Buscar
                </button>
              </div>
            </label>
            {sugerenciasDni.length > 0 && !personaCheckIn ? (
              <ul className="mt-2 max-h-36 overflow-auto rounded-xl border border-neutral-100 bg-neutral-50 text-sm">
                {sugerenciasDni.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-white"
                      onClick={() => {
                        setPersonaCheckIn(p)
                        setDniCheckIn(p.dni)
                      }}
                    >
                      <span className="font-mono text-xs">{p.dni}</span> — {p.apellido},{' '}
                      {p.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {personaCheckIn ? (
              <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900 ring-1 ring-green-200">
                <span className="font-semibold">Asignar a:</span> {personaCheckIn.apellido},{' '}
                {personaCheckIn.nombre} — {personaCheckIn.empresa || 'Sin empresa'}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarCheckIn()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar check-in
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.tipo === 'checkout' && camaModalOcupada ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">Cama ocupada</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {camaModalOcupada.sector} · {camaModalOcupada.habitacion} · {camaModalOcupada.denominacion}
            </p>
            <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-900">
              Cama ocupada por:{' '}
              <span className="font-semibold text-neutral-950">
                {camaModalOcupada.ocupanteNombre?.trim() ||
                  (checkoutPersonaResuelta
                    ? `${checkoutPersonaResuelta.apellido}, ${checkoutPersonaResuelta.nombre}`.trim()
                    : nombreEnCama(camaModalOcupada))}
              </span>
              {' - '}
              Empresa:{' '}
              <span className="font-semibold text-neutral-950">
                {camaModalOcupada.ocupanteEmpresa?.trim() ||
                  checkoutPersonaResuelta?.empresa?.trim() ||
                  empresaEnCama(camaModalOcupada) ||
                  '—'}
              </span>
            </p>
            {checkoutPersonaCargando &&
            !camaModalOcupada.ocupanteNombre?.trim() &&
            !checkoutPersonaResuelta ? (
              <p className="mt-1 text-xs text-neutral-500">Consultando datos del padrón…</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-neutral-50 p-1">
              <button
                type="button"
                onClick={() => setModoOcupada('estadia')}
                className={`min-w-0 flex-1 rounded-lg py-2 text-xs font-semibold sm:text-sm ${modoOcupada === 'estadia' ? 'bg-white text-[#CD1818] shadow-sm' : 'text-neutral-600'}`}
              >
                Editar estadía
              </button>
              <button
                type="button"
                onClick={() => setModoOcupada('traslado')}
                className={`min-w-0 flex-1 rounded-lg py-2 text-xs font-semibold sm:text-sm ${modoOcupada === 'traslado' ? 'bg-white text-[#CD1818] shadow-sm' : 'text-neutral-600'}`}
              >
                Trasladar
              </button>
              <button
                type="button"
                onClick={() => setModoOcupada('checkout_real')}
                className={`min-w-0 flex-1 rounded-lg py-2 text-xs font-semibold sm:text-sm ${modoOcupada === 'checkout_real' ? 'bg-white text-[#CD1818] shadow-sm' : 'text-neutral-600'}`}
              >
                Check-out real
              </button>
            </div>

            {modoOcupada === 'estadia' ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Fecha estimada de salida (opcional)
                  </span>
                  <input
                    type="date"
                    value={fechaSalidaEstimadaEdicion}
                    onChange={(e) => setFechaSalidaEstimadaEdicion(e.target.value)}
                    className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-neutral-500">
                    Solo planificación: no libera la cama. Dejá vacío para quitar la estimación.
                  </span>
                </label>
              </div>
            ) : null}

            {modoOcupada === 'traslado' ? (
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">Fecha del movimiento</span>
                  <input
                    type="date"
                    value={fechaMovimientoTraslado}
                    onChange={(e) => setFechaMovimientoTraslado(e.target.value)}
                    className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">
                    Cama destino (solo libres)
                  </span>
                  <select
                    value={camaDestinoId}
                    onChange={(e) => setCamaDestinoId(e.target.value)}
                    className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                  >
                    <option value="">Seleccionar cama libre…</option>
                    {camasDestinoMover.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sector} · {c.habitacion} · {c.denominacion}
                      </option>
                    ))}
                  </select>
                  {camasDestinoMover.length === 0 ? (
                    <p className="mt-2 text-xs text-amber-800">
                      No hay camas libres disponibles. Liberá una cama en el mapa o en configuración.
                    </p>
                  ) : null}
                </label>
              </div>
            ) : null}

            {modoOcupada === 'checkout_real' ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <strong>Atención:</strong> esto liberará la cama y la marcará como SUCIA. Solo usar
                  si la persona ya se retiró.
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">Fecha de check-out real</span>
                  <input
                    type="date"
                    value={fechaCheckOutReal}
                    onChange={(e) => setFechaCheckOutReal(e.target.value)}
                    max={hoyYmdLocal()}
                    className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-neutral-500">
                    No puede ser una fecha futura.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cerrar
              </button>
              {modoOcupada === 'estadia' ? (
                <button
                  type="button"
                  onClick={() => void guardarFechaSalidaEstimadaEdicion()}
                  disabled={busy}
                  className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
                >
                  Guardar estimación
                </button>
              ) : null}
              {modoOcupada === 'traslado' ? (
                <button
                  type="button"
                  onClick={() => void confirmarTrasladoDesdeModal()}
                  disabled={busy}
                  className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
                >
                  Confirmar traslado
                </button>
              ) : null}
              {modoOcupada === 'checkout_real' ? (
                <button
                  type="button"
                  onClick={() => void confirmarCheckOutReal()}
                  disabled={busy}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Ejecutar check-out
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {modal?.tipo === 'sucia' ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">Registrar Limpieza</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {modal.cama.sector} · {modal.cama.habitacion} — {modal.cama.denominacion}. Pendiente de
              limpieza.
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">
                Responsable de Limpieza (Mucama/Maestranza)
              </span>
              <input
                type="text"
                value={responsableLimpieza}
                onChange={(e) => setResponsableLimpieza(e.target.value)}
                className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40"
                placeholder="Nombre y apellido o legajo"
                autoComplete="off"
              />
            </label>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setResponsableLimpieza('')
                  setModal(null)
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => void confirmarRegistroLimpiezaIndividual()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar limpieza
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal?.tipo === 'mantenimiento' ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">Mantenimiento</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {modal.cama.denominacion} está fuera de servicio.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => void liberarMantenimiento()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Marcar disponible
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedCamas.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-[85] border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-neutral-800">
              {selectedCamas.length}{' '}
              {selectedCamas.length === 1 ? 'cama seleccionada' : 'camas seleccionadas'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {tipoSeleccionMasiva === 'LIBRE' ? (
                <button
                  type="button"
                  onClick={abrirModalMasivoCheckin}
                  disabled={busy}
                  className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b01414] disabled:opacity-50"
                >
                  Check-in masivo
                </button>
              ) : null}
              {tipoSeleccionMasiva === 'OCUPADA' ? (
                <>
                  <button
                    type="button"
                    onClick={abrirModalMasivoCheckout}
                    disabled={busy}
                    className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b01414] disabled:opacity-50"
                  >
                    Check-out masivo
                  </button>
                  <button
                    type="button"
                    onClick={abrirModalMasivoTraslado}
                    disabled={busy}
                    className="rounded-xl border border-[#CD1818]/30 bg-[#CD1818]/5 px-4 py-2 text-sm font-semibold text-[#171717] hover:bg-[#CD1818]/10 disabled:opacity-50"
                  >
                    Trasladar seleccionadas
                  </button>
                </>
              ) : null}
              {tipoSeleccionMasiva === 'SUCIA' ? (
                <button
                  type="button"
                  onClick={abrirModalMasivoLimpieza}
                  disabled={busy}
                  className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b01414] disabled:opacity-50"
                >
                  Marcar limpias (masivo)
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedCamas([])}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
              >
                Quitar selección
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalMasivo === 'checkin' ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
          >
            <div className="border-b border-neutral-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-neutral-900">Check-in masivo</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Asigná un DNI del padrón a cada cama. Se registrarán en una sola operación.
              </p>
              <label className="mt-3 block max-w-xs">
                <span className="text-xs font-medium text-neutral-600">Fecha de ingreso</span>
                <input
                  type="date"
                  value={fechaMasivo}
                  onChange={(e) => setFechaMasivo(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                />
              </label>
              <label className="mt-3 block max-w-xs">
                <span className="text-xs font-medium text-neutral-600">
                  Fecha estimada de salida (opcional, todas las camas)
                </span>
                <input
                  type="date"
                  value={masivoFechaSalidaEstimada}
                  onChange={(e) => setMasivoFechaSalidaEstimada(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {masivoCheckinCamaIdsConError.length > 0 ? (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Revisá las filas marcadas: corregí el DNI o elegí otra persona antes de confirmar.
                </p>
              ) : null}
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Cama</th>
                    <th className="py-2 pr-3">DNI</th>
                    <th className="py-2">Persona</th>
                  </tr>
                </thead>
                <tbody>
                  {camasSeleccionadasOrdenadas.map((c) => {
                    const p = masivoPersona[c.id]
                    const filaConError = masivoCheckinCamaIdsConError.includes(c.id)
                    return (
                      <tr
                        key={c.id}
                        className={`border-b border-neutral-100 align-top ${filaConError ? 'bg-red-50/90 ring-1 ring-inset ring-red-300' : ''}`}
                      >
                        <td className="py-3 pr-3 font-medium text-neutral-900">
                          {c.sector} · {c.habitacion}
                          <br />
                          <span className="text-xs text-neutral-600">{c.denominacion}</span>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                            <input
                              value={masivoDni[c.id] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value
                                setMasivoDni((prev) => ({ ...prev, [c.id]: v }))
                                setMasivoPersona((prev) => ({ ...prev, [c.id]: null }))
                                setMasivoCheckinCamaIdsConError([])
                              }}
                              className={`min-h-9 w-full min-w-[8rem] rounded-lg border px-2 font-mono text-xs outline-none focus:border-[#CD1818]/40 ${
                                filaConError
                                  ? 'border-red-500 ring-2 ring-red-200'
                                  : 'border-neutral-200'
                              }`}
                              placeholder="DNI"
                            />
                            <button
                              type="button"
                              onClick={() => void buscarDniMasivoFila(c.id)}
                              disabled={busy}
                              className="shrink-0 rounded-lg bg-[#CD1818] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
                            >
                              Buscar
                            </button>
                          </div>
                        </td>
                        <td className={`py-3 text-neutral-700 ${filaConError ? 'rounded-r-md border-l-4 border-l-red-500 pl-2' : ''}`}>
                          {p ? (
                            <span>
                              {p.apellido}, {p.nombre}
                              <span className="mt-0.5 block text-xs text-neutral-500">
                                {p.empresa || 'Sin empresa'}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setMasivoCheckinCamaIdsConError([])
                  setModalMasivo(null)
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarMasivoCheckin()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar check-in masivo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalMasivo === 'checkout' ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-neutral-900">Check-out masivo</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Se cerrará el período de pernocte en {camasSeleccionadasOrdenadas.length} camas y
              quedarán pendientes de limpieza. Solo usá fechas de salida reales (no futuras).
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">Fecha de check-out real</span>
              <input
                type="date"
                value={fechaMasivo}
                max={hoyYmdLocal()}
                onChange={(e) => setFechaMasivo(e.target.value)}
                className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalMasivo(null)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarMasivoCheckout()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalMasivo === 'limpieza' ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-neutral-900">Registrar Limpieza</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Se liberarán {selectedCamas.length}{' '}
              {selectedCamas.length === 1 ? 'cama' : 'camas'} en estado Libre y quedará registro
              para auditoría.
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-600">
                Responsable de Limpieza (Mucama/Maestranza)
              </span>
              <input
                type="text"
                value={responsableLimpieza}
                onChange={(e) => setResponsableLimpieza(e.target.value)}
                className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-[#CD1818]/40"
                placeholder="Nombre y apellido o legajo"
                autoComplete="off"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setResponsableLimpieza('')
                  setModalMasivo(null)
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarRegistroLimpiezaMasivo()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar limpieza
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalMasivo === 'traslado' ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
          >
            <div className="border-b border-neutral-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-neutral-900">Traslado masivo</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Elegí una cama libre distinta para cada huésped. Los destinos no pueden repetirse.
              </p>
              <label className="mt-3 block max-w-xs">
                <span className="text-xs font-medium text-neutral-600">Fecha del movimiento</span>
                <input
                  type="date"
                  value={fechaMasivo}
                  onChange={(e) => setFechaMasivo(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Origen</th>
                    <th className="py-2 pr-3">Huésped</th>
                    <th className="py-2">Cama destino</th>
                  </tr>
                </thead>
                <tbody>
                  {camasSeleccionadasOrdenadas.map((c) => {
                    const opts = destinosDisponiblesTrasladoFila(c.id)
                    return (
                      <tr key={c.id} className="border-b border-neutral-100 align-middle">
                        <td className="py-3 pr-3 font-medium text-neutral-900">
                          {c.sector} · {c.habitacion} · {c.denominacion}
                        </td>
                        <td className="py-3 pr-3 text-neutral-700">{nombreEnCama(c)}</td>
                        <td className="py-3">
                          <select
                            value={trasladoDestinoPorOrigen[c.id] ?? ''}
                            onChange={(e) =>
                              setTrasladoDestinoPorOrigen((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                            className="w-full min-h-9 rounded-lg border border-neutral-200 bg-white px-2 text-xs"
                          >
                            <option value="">Seleccionar…</option>
                            {opts.map((dest) => (
                              <option key={dest.id} value={dest.id}>
                                {dest.sector} · {dest.habitacion} · {dest.denominacion}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {camasLibresParaTrasladoMasivo.length < camasSeleccionadasOrdenadas.length ? (
                <p className="mt-3 text-xs text-amber-800">
                  No hay suficientes camas libres para cubrir todos los traslados.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setModalMasivo(null)
                  setTrasladoDestinoPorOrigen({})
                }}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarMasivoTraslado()}
                disabled={busy}
                className="rounded-xl bg-[#CD1818] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b01414] disabled:opacity-50"
              >
                Confirmar traslados
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
