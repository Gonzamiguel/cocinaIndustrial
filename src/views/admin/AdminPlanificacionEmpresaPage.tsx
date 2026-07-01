import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlanificacionMenuPorDiaPanel } from '../../components/admin/PlanificacionMenuPorDiaPanel'
import { PadronFormModal, inputClass as modalInputClass, labelClass } from '../../components/padron/PadronFormModal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { desplazarSemanaLaborable } from '../../lib/fechasDinamicas'
import { subscribeMenu, type MenuItem } from '../../lib/menu'
import {
  crearClienteViandasPadron,
  filtrarClientesViandasPadron,
  subscribePadronEmpresas,
} from '../../lib/padronEmpresas'
import { sanitizarEmpresaInput } from '../../lib/padronFormInput'
import {
  buildDiasVaciosPlanificacion,
  etiquetaSemanaPlanificacion,
  fetchPlanificacionMenuEmpresa,
  guardarPlanificacionMenuEmpresa,
  publicarPlanificacionMenuEmpresa,
  semanaLaborableDefault,
  subscribePlanificacionesMenuEmpresa,
  toggleOpcionEnDia,
  urlFormularioPedido,
  type GuardarPlanificacionInput,
} from '../../lib/planificacionMenuEmpresa'
import { exportarPlanificacionMenuPdf } from '../../lib/planificacionMenuPdf'
import type { PadronEmpresa } from '../../types/padronEmpresa'
import type {
  PlanificacionDiaMenuEmpresa,
  PlanificacionMenuEmpresa,
} from '../../types/planificacionMenuEmpresa'

function badgeEstado(estado: PlanificacionMenuEmpresa['estado']) {
  if (estado === 'PUBLICADA') {
    return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  }
  if (estado === 'CERRADA') {
    return 'bg-gray-100 text-gray-600 ring-gray-200'
  }
  return 'bg-amber-50 text-amber-800 ring-amber-200'
}

export function AdminPlanificacionEmpresaPage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const semanaDefault = useMemo(() => semanaLaborableDefault(), [])
  const [empresasPadron, setEmpresasPadron] = useState<PadronEmpresa[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [planificaciones, setPlanificaciones] = useState<PlanificacionMenuEmpresa[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [lunesYmd, setLunesYmd] = useState(semanaDefault.lunesYmd)
  const [viernesYmd, setViernesYmd] = useState(semanaDefault.viernesYmd)
  const [dias, setDias] = useState<PlanificacionDiaMenuEmpresa[]>(() =>
    buildDiasVaciosPlanificacion(semanaDefault.dias),
  )
  const [mensajeEmpresa, setMensajeEmpresa] = useState('')
  const [planActual, setPlanActual] = useState<PlanificacionMenuEmpresa | null>(null)
  const [esNueva, setEsNueva] = useState(true)
  const [cargandoPlan, setCargandoPlan] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalEmpresaOpen, setModalEmpresaOpen] = useState(false)
  const [fNombreEmpresa, setFNombreEmpresa] = useState('')
  const [fCuitEmpresa, setFCuitEmpresa] = useState('')
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false)

  useEffect(() => {
    return subscribePadronEmpresas(setEmpresasPadron)
  }, [])

  const empresas = useMemo(
    () => filtrarClientesViandasPadron(empresasPadron),
    [empresasPadron],
  )

  useEffect(() => {
    return subscribeMenu(setMenuItems)
  }, [])

  useEffect(() => {
    return subscribePlanificacionesMenuEmpresa(setPlanificaciones)
  }, [])

  const principales = useMemo(
    () => menuItems.filter((i) => i.categoria === 'principal'),
    [menuItems],
  )
  const guarniciones = useMemo(
    () => menuItems.filter((i) => i.categoria === 'guarnicion'),
    [menuItems],
  )

  const empresaSeleccionada = useMemo(
    () => empresas.find((e) => e.id === empresaId) ?? null,
    [empresas, empresaId],
  )

  const cargarPlan = useCallback(async (eid: string, semana: string) => {
    if (!eid) {
      setPlanActual(null)
      setEsNueva(true)
      return
    }
    setCargandoPlan(true)
    setError(null)
    try {
      const plan = await fetchPlanificacionMenuEmpresa(eid, semana)
      if (plan) {
        setPlanActual(plan)
        setDias(plan.dias)
        setMensajeEmpresa(plan.mensajeEmpresa ?? '')
        setEsNueva(false)
      } else {
        const { dias: diasSem, viernesYmd: vy } = desplazarSemanaLaborable(semana, 0)
        setPlanActual(null)
        setDias(buildDiasVaciosPlanificacion(diasSem))
        setMensajeEmpresa('')
        setEsNueva(true)
        setViernesYmd(vy)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la planificación')
    } finally {
      setCargandoPlan(false)
    }
  }, [])

  useEffect(() => {
    if (!empresaId) return
    void cargarPlan(empresaId, lunesYmd)
  }, [empresaId, lunesYmd, cargarPlan])

  function cambiarSemana(delta: number) {
    const next = desplazarSemanaLaborable(lunesYmd, delta)
    setLunesYmd(next.lunesYmd)
    setViernesYmd(next.viernesYmd)
  }

  function actualizarDia(index: number, patch: Partial<PlanificacionDiaMenuEmpresa>) {
    setDias((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function agregarOpcionDia(
    index: number,
    tipo: 'principal' | 'guarnicion',
    menuId: string,
    nombre: string,
  ) {
    setDias((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const key = tipo === 'principal' ? 'opcionesPrincipales' : 'opcionesGuarniciones'
        if (d[key].some((o) => o.menuId === menuId)) return d
        return toggleOpcionEnDia(d, tipo, menuId, nombre)
      }),
    )
  }

  function quitarOpcionDia(
    index: number,
    tipo: 'principal' | 'guarnicion',
    menuId: string,
  ) {
    setDias((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const key = tipo === 'principal' ? 'opcionesPrincipales' : 'opcionesGuarniciones'
        return { ...d, [key]: d[key].filter((o) => o.menuId !== menuId) }
      }),
    )
  }

  function abrirModalEmpresa() {
    setFNombreEmpresa('')
    setFCuitEmpresa('')
    setModalEmpresaOpen(true)
  }

  async function guardarNuevaEmpresa() {
    setGuardandoEmpresa(true)
    try {
      const id = await crearClienteViandasPadron({
        nombre: sanitizarEmpresaInput(fNombreEmpresa),
        cuit: fCuitEmpresa.trim(),
      })
      setEmpresaId(id)
      setModalEmpresaOpen(false)
      showToast('Empresa cliente de viandas creada.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo crear la empresa', 'error')
    } finally {
      setGuardandoEmpresa(false)
    }
  }

  async function handleGuardar(): Promise<boolean> {
    if (!user?.uid) {
      setError('Sesión no válida.')
      return false
    }
    if (!empresaSeleccionada) {
      setError('Elegí o creá una empresa cliente de viandas.')
      return false
    }
    setGuardando(true)
    setError(null)
    try {
      const input: GuardarPlanificacionInput = {
        empresaId: empresaSeleccionada.id,
        empresaNombre: empresaSeleccionada.nombre,
        empresaCuit: empresaSeleccionada.cuit,
        semanaInicioYmd: lunesYmd,
        semanaFinYmd: viernesYmd,
        dias,
        mensajeEmpresa,
        creadoPorUid: user.uid,
        creadoPorNombre: user.email?.trim() || 'Administración cocina',
        esNueva,
      }
      const saved = await guardarPlanificacionMenuEmpresa(input)
      setPlanActual(saved)
      setEsNueva(false)
      showToast('Planificación guardada.', 'success')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function handlePublicar() {
    if (!empresaSeleccionada) return
    setPublicando(true)
    setError(null)
    try {
      if (esNueva || !planActual) {
        const ok = await handleGuardar()
        if (!ok) return
      }
      const pub = await publicarPlanificacionMenuEmpresa(empresaSeleccionada.id, lunesYmd)
      setPlanActual(pub)
      showToast('Planificación publicada. Copiá el enlace para enviar a la empresa.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar')
    } finally {
      setPublicando(false)
    }
  }

  async function copiarEnlace() {
    const token = planActual?.tokenPublico
    if (!token) {
      showToast('Publicá la planificación antes de copiar el enlace.', 'error')
      return
    }
    const url = urlFormularioPedido(token)
    try {
      await navigator.clipboard.writeText(url)
      showToast('Enlace copiado al portapapeles.', 'success')
    } catch {
      showToast(url, 'info')
    }
  }

  const inputClass =
    'mt-1 w-full min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#171717] outline-none focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

  const planificacionesRecientes = planificaciones.slice(0, 8)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2 border-b border-gray-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8997A6]">
            Cocina central
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#CD1818]">
            Planificación por empresa
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#8997A6]">
            Creá la empresa cliente (con CUIT) en el padrón compartido, armá las opciones de menú
            por día y compartí el formulario para que cada empleado elija. Los pedidos ingresan en{' '}
            <Link to="/admin/pedidos" className="font-medium text-[#CD1818] hover:underline">
              Pedidos del día
            </Link>
            ; la misma empresa queda disponible para facturación (rol CLIENTE, distinto de
            campamento).
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Empresa y semana
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-0 flex-1 text-left">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Cliente de viandas (padrón)
                  </span>
                  <select
                    value={empresaId}
                    onChange={(e) => setEmpresaId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Seleccioná empresa…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                        {e.cuit ? ` · CUIT ${e.cuit}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={abrirModalEmpresa}
                  className="shrink-0 rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
                >
                  + Nueva empresa
                </button>
              </div>
              <p className="md:col-span-2 text-xs text-[#8997A6]">
                {empresas.length === 0
                  ? 'Creá la primera empresa con nombre y CUIT. Es la misma ficha que usará finanzas para facturar viandas.'
                  : 'Solo se listan empresas con rol CLIENTE (viandas). Campamento y proveedores usan otros roles en el mismo padrón.'}
              </p>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => cambiarSemana(-1)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-[#171717] hover:bg-gray-50"
                >
                  ← Semana anterior
                </button>
                <span className="text-sm font-semibold text-[#171717]">
                  {etiquetaSemanaPlanificacion(lunesYmd, viernesYmd)}
                </span>
                <button
                  type="button"
                  onClick={() => cambiarSemana(1)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-[#171717] hover:bg-gray-50"
                >
                  Semana siguiente →
                </button>
                {planActual ? (
                  <span
                    className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badgeEstado(planActual.estado)}`}
                  >
                    {planActual.estado}
                  </span>
                ) : (
                  <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                    Sin guardar
                  </span>
                )}
              </div>
            </div>
          </section>

          {empresaId ? (
            <>
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                  Mensaje para la empresa
                </h2>
                <div className="mt-4">
                  <label className="block text-left">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Instrucciones (opcional)
                    </span>
                    <textarea
                      value={mensajeEmpresa}
                      onChange={(e) => setMensajeEmpresa(e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Ej. Completar antes del viernes 17 hs y reenviar el link a cada empleado…"
                    />
                  </label>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                    Opciones de menú por día
                  </h2>
                  <p className="mt-1 text-xs text-[#8997A6]">
                    Elegí un día, buscá platos y guarniciones para agregar. Repetí en cada día y
                    publicá el formulario.
                  </p>
                </div>
                <PlanificacionMenuPorDiaPanel
                  dias={dias}
                  principales={principales}
                  guarniciones={guarniciones}
                  cargando={cargandoPlan}
                  onAgregarOpcion={agregarOpcionDia}
                  onQuitarOpcion={quitarOpcionDia}
                  onObservaciones={(idx, obs) => actualizarDia(idx, { observaciones: obs })}
                />
              </section>

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-sm text-[#CD1818]"
                >
                  {error}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={guardando || cargandoPlan}
                  onClick={() => void handleGuardar()}
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#171717] ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar borrador'}
                </button>
                <button
                  type="button"
                  disabled={publicando || cargandoPlan}
                  onClick={() => void handlePublicar()}
                  className="rounded-xl bg-[#CD1818] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-50"
                >
                  {publicando ? 'Publicando…' : 'Publicar y generar enlace'}
                </button>
                {planActual?.tokenPublico ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void copiarEnlace()}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
                    >
                      Copiar enlace formulario
                    </button>
                    <a
                      href={urlFormularioPedido(planActual.tokenPublico)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#CD1818] hover:bg-gray-50"
                    >
                      Abrir formulario
                    </a>
                    <button
                      type="button"
                      onClick={() => exportarPlanificacionMenuPdf(planActual)}
                      className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#171717] hover:bg-gray-50"
                    >
                      Exportar PDF
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-8 text-center text-sm text-[#8997A6]">
              Creá o elegí una empresa cliente para planificar su menú semanal.
            </p>
          )}
        </div>

        <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
            Planificaciones recientes
          </h2>
          <ul className="mt-3 space-y-2">
            {planificacionesRecientes.length === 0 ? (
              <li className="text-sm text-[#8997A6]">Aún no hay planificaciones.</li>
            ) : (
              planificacionesRecientes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmpresaId(p.empresaId)
                      setLunesYmd(p.semanaInicioYmd)
                      setViernesYmd(p.semanaFinYmd)
                    }}
                    className="w-full rounded-lg border border-gray-100 px-3 py-2 text-left text-sm transition hover:border-[#CD1818]/20 hover:bg-gray-50"
                  >
                    <span className="font-semibold text-[#171717]">{p.empresaNombre}</span>
                    <span className="mt-0.5 block text-xs text-[#8997A6]">
                      {etiquetaSemanaPlanificacion(p.semanaInicioYmd, p.semanaFinYmd)}
                    </span>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badgeEstado(p.estado)}`}
                    >
                      {p.estado}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>

      <PadronFormModal
        open={modalEmpresaOpen}
        title="Nueva empresa cliente (viandas)"
        subtitle="Se guarda en el padrón compartido con rol CLIENTE y CUIT para facturación."
        onClose={() => {
          if (!guardandoEmpresa) setModalEmpresaOpen(false)
        }}
        onSave={() => void guardarNuevaEmpresa()}
        saving={guardandoEmpresa}
        saveDisabled={!fNombreEmpresa.trim() || fCuitEmpresa.replace(/\D/g, '').length < 8}
        saveLabel="Crear empresa"
      >
        <label className="block text-left">
          <span className={labelClass}>Nombre / razón social</span>
          <input
            value={fNombreEmpresa}
            onChange={(e) => setFNombreEmpresa(e.target.value)}
            className={modalInputClass}
            placeholder="Ej. LACOSTE"
            autoComplete="organization"
          />
        </label>
        <label className="mt-4 block text-left">
          <span className={labelClass}>CUIT</span>
          <input
            value={fCuitEmpresa}
            onChange={(e) => setFCuitEmpresa(e.target.value)}
            className={modalInputClass}
            placeholder="Ej. 30-12345678-9"
            inputMode="numeric"
          />
        </label>
      </PadronFormModal>
    </div>
  )
}
