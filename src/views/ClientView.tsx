import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rutaHomePorRol } from '../lib/rbac'
import {
  confirmarPedidoSemanalConTransaccion,
  LUGARES_ENTREGA,
  stockDisponibleParaPedidos,
  subscribeMenu,
  type LugarEntrega,
  type MenuItem,
} from '../lib/menu'
import {
  formatEtiquetaPestaña,
  getVentanaRodanteConsumo,
  type DiaConsumo,
} from '../lib/fechasDinamicas'
import { ensureSesionFormularioPedido } from '../lib/authPublico'
import {
  diasConsumoDesdePlanificacion,
  fetchPlanificacionByToken,
  itemsMenuDesdeOpcionesPlanificadas,
  opcionesGuarnicionesPermitidas,
  opcionesPrincipalesPermitidas,
  seleccionInicialDesdePlanificacion,
  validarLineasContraPlanificacion,
} from '../lib/planificacionMenuEmpresa'
import type { PlanificacionMenuEmpresa } from '../types/planificacionMenuEmpresa'

/** Paleta sobria alineada con dashboard. */
const TAB_ACTIVO = 'bg-[#CD1818] text-white shadow-sm'
const TAB_INACTIVO =
  'bg-white text-[#171717] ring-1 ring-gray-200 hover:bg-gray-50'
const TAB_COMPLETADO =
  'bg-gray-50 text-[#171717] ring-1 ring-gray-200 hover:bg-gray-100'

type SeleccionDia = {
  principalId: string | null
  guarnicionId: string | null
}

function crearSeleccionVacia(): SeleccionDia {
  return { principalId: null, guarnicionId: null }
}

function seleccionInicial(dias: DiaConsumo[]): Record<string, SeleccionDia> {
  const m: Record<string, SeleccionDia> = {}
  for (const d of dias) {
    m[d.fechaConsumo] = crearSeleccionVacia()
  }
  return m
}

function normalizarSelecciones(
  dias: DiaConsumo[],
  prev: Record<string, SeleccionDia>,
): Record<string, SeleccionDia> {
  const next: Record<string, SeleccionDia> = {}
  for (const d of dias) {
    next[d.fechaConsumo] = prev[d.fechaConsumo] ?? crearSeleccionVacia()
  }
  return next
}

function getDiaTabId(fechaConsumo: string): string {
  const slug = fechaConsumo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return `tab-${slug || 'dia'}`
}

/** Validación previa al envío; devuelve mensaje o null si todo ok. */
function validarPedidoSemanal(input: {
  nombreCliente: string
  lugarEntrega: LugarEntrega | ''
  hayAlMenosUnDiaConMenú: boolean
  esFormularioEmpresa: boolean
}): string | null {
  const nombre = input.nombreCliente.trim()
  if (!nombre) {
    return 'Por favor, ingresá tu nombre y apellido.'
  }
  if (!input.esFormularioEmpresa && !input.lugarEntrega) {
    return 'Por favor, elegí un lugar de entrega.'
  }
  if (!input.hayAlMenosUnDiaConMenú) {
    return input.esFormularioEmpresa
      ? 'Elegí al menos un día con plato principal o guarnición.'
      : 'Elegí al menos un día dentro de los próximos 7 días con plato principal o guarnición.'
  }
  return null
}

export function ClientView() {
  const { token } = useParams<{ token?: string }>()
  const { user, rol, loading: authLoading } = useAuth()
  const modoPlanificacion = Boolean(token?.trim())
  const diasGenericos = useMemo(() => getVentanaRodanteConsumo(), [])
  const [planificacion, setPlanificacion] = useState<PlanificacionMenuEmpresa | null>(null)
  const [planCargando, setPlanCargando] = useState(modoPlanificacion)
  const [planError, setPlanError] = useState<string | null>(null)
  const diasDisponibles = useMemo(() => {
    if (planificacion) return diasConsumoDesdePlanificacion(planificacion)
    return diasGenericos
  }, [planificacion, diasGenericos])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selecciones, setSelecciones] = useState<Record<string, SeleccionDia>>(() =>
    seleccionInicial(diasGenericos),
  )
  const [diaActivo, setDiaActivo] = useState(
    () => diasDisponibles[0]?.fechaConsumo ?? '',
  )

  const [nombreCliente, setNombreCliente] = useState('')
  const [lugarEntrega, setLugarEntrega] = useState<LugarEntrega | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [authListo, setAuthListo] = useState(false)

  useEffect(() => {
    if (!modoPlanificacion || !token?.trim()) {
      setPlanificacion(null)
      setPlanCargando(false)
      return
    }
    let cancelado = false
    setPlanCargando(true)
    setPlanError(null)
    void (async () => {
      try {
        await ensureSesionFormularioPedido()
        const plan = await fetchPlanificacionByToken(token)
        if (cancelado) return
        if (!plan || plan.estado !== 'PUBLICADA') {
          setPlanError('Este formulario no está disponible o expiró.')
          setPlanificacion(null)
          return
        }
        setPlanificacion(plan)
        setSelecciones(seleccionInicialDesdePlanificacion(plan))
        setAuthListo(true)
      } catch (err) {
        if (!cancelado) {
          const code = (err as { code?: string })?.code
          if (code === 'permission-denied') {
            setPlanError(
              'Sin permiso para abrir este formulario. Publicá la planificación y desplegá las reglas de Firestore (`firebase deploy --only firestore:rules,firestore:indexes`).',
            )
          } else {
            setPlanError(
              err instanceof Error ? err.message : 'No se pudo cargar el formulario',
            )
          }
        }
      } finally {
        if (!cancelado) setPlanCargando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [modoPlanificacion, token])

  useEffect(() => {
    let cancelado = false
    if (modoPlanificacion) return
    void (async () => {
      try {
        await ensureSesionFormularioPedido()
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelado) setAuthListo(true)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [modoPlanificacion])

  useEffect(() => {
    if (modoPlanificacion) {
      if (planCargando || !planificacion) return
    } else if (!authListo) {
      return
    }
    return subscribeMenu(setItems)
  }, [authListo, modoPlanificacion, planCargando, planificacion])

  useEffect(() => {
    if (planificacion) return
    setSelecciones((prev) => normalizarSelecciones(diasDisponibles, prev))
    setDiaActivo((prev) =>
      diasDisponibles.some((dia) => dia.fechaConsumo === prev)
        ? prev
        : diasDisponibles[0]?.fechaConsumo ?? '',
    )
  }, [diasDisponibles, planificacion])

  useEffect(() => {
    if (!planificacion) return
    setSelecciones(seleccionInicialDesdePlanificacion(planificacion))
    setDiaActivo(planificacion.dias[0]?.fechaConsumo ?? '')
  }, [planificacion])

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  )

  const principales = useMemo(
    () => items.filter((i) => i.categoria === 'principal'),
    [items],
  )
  const guarniciones = useMemo(
    () => items.filter((i) => i.categoria === 'guarnicion'),
    [items],
  )

  const usoPorItemId = useMemo(() => {
    const m = new Map<string, number>()
    for (const sel of Object.values(selecciones)) {
      if (sel.principalId) {
        m.set(sel.principalId, (m.get(sel.principalId) ?? 0) + 1)
      }
      if (sel.guarnicionId) {
        m.set(sel.guarnicionId, (m.get(sel.guarnicionId) ?? 0) + 1)
      }
    }
    return m
  }, [selecciones])

  function disponibleParaDia(menuId: string, fechaConsumo: string): number {
    const base = stockDisponibleParaPedidos(itemsById.get(menuId))
    const usadoGlobal = usoPorItemId.get(menuId) ?? 0
    const sel = selecciones[fechaConsumo]
    const enEsteDía =
      (sel?.principalId === menuId ? 1 : 0) +
      (sel?.guarnicionId === menuId ? 1 : 0)
    return base - usadoGlobal + enEsteDía
  }

  function setPrincipalDia(fechaConsumo: string, principalId: string | null) {
    setError(null)
    setSelecciones((prev) => {
      const actual = prev[fechaConsumo] ?? crearSeleccionVacia()
      const principal = principalId ? itemsById.get(principalId) : null
      const limpiarGuarni =
        !principalId || principal?.aceptaGuarnicion === false
          ? null
          : actual.guarnicionId
      return {
        ...prev,
        [fechaConsumo]: {
          principalId,
          guarnicionId: limpiarGuarni,
        },
      }
    })
  }

  function setGuarnicionDia(fechaConsumo: string, guarnicionId: string | null) {
    setError(null)
    setSelecciones((prev) => ({
      ...prev,
      [fechaConsumo]: {
        ...(prev[fechaConsumo] ?? crearSeleccionVacia()),
        guarnicionId,
      },
    }))
  }

  const lineasParaEnvio = useMemo(() => {
    const lineas: {
      fechaConsumo: string
      principalId: string | null
      guarnicionId: string | null
    }[] = []
    for (const d of diasDisponibles) {
      const s = selecciones[d.fechaConsumo] ?? crearSeleccionVacia()
      const principal = s.principalId ? itemsById.get(s.principalId) : null
      const aceptaGuarnicion = principal?.aceptaGuarnicion !== false
      const principalId = s.principalId
      const guarnicionId = aceptaGuarnicion ? s.guarnicionId : null
      if (!principalId && !guarnicionId) continue
      lineas.push({
        fechaConsumo: d.fechaConsumo,
        principalId,
        guarnicionId,
      })
    }
    return lineas
  }, [diasDisponibles, itemsById, selecciones])

  const hayAlMenosUnDiaConMenú = lineasParaEnvio.length > 0

  function resetForm() {
    setNombreCliente('')
    if (!planificacion) {
      setLugarEntrega('')
    }
    setSelecciones(
      planificacion
        ? seleccionInicialDesdePlanificacion(planificacion)
        : seleccionInicial(diasDisponibles),
    )
    setDiaActivo(diasDisponibles[0]?.fechaConsumo ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const msg = validarPedidoSemanal({
      nombreCliente,
      lugarEntrega,
      hayAlMenosUnDiaConMenú,
      esFormularioEmpresa: Boolean(planificacion),
    })
    if (msg) {
      setError(msg)
      return
    }

    setLoading(true)
    try {
      if (planificacion) {
        const msgPlan = validarLineasContraPlanificacion(planificacion, lineasParaEnvio)
        if (msgPlan) {
          setError(msgPlan)
          return
        }
      }

      await confirmarPedidoSemanalConTransaccion({
        nombreCliente,
        lugarEntrega: planificacion
          ? planificacion.empresaNombre
          : lugarEntrega,
        lineas: lineasParaEnvio,
        ...(planificacion
          ? {
              empresaId: planificacion.empresaId,
              empresaNombre: planificacion.empresaNombre,
              planificacionId: planificacion.id,
            }
          : {}),
      })
      resetForm()
      setSuccessModalOpen(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo confirmar el pedido',
      )
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-[#171717] outline-none transition focus:border-[#CD1818]/30 focus:ring-2 focus:ring-[#CD1818]/10'

  const indiceActivo = Math.max(
    0,
    diasDisponibles.findIndex((x) => x.fechaConsumo === diaActivo),
  )
  const diaVista = diasDisponibles[indiceActivo] ?? diasDisponibles[0]

  function pasoDía(delta: -1 | 1) {
    const siguiente = indiceActivo + delta
    if (siguiente < 0 || siguiente >= diasDisponibles.length) return
    setDiaActivo(diasDisponibles[siguiente].fechaConsumo)
  }

  function díaTieneMenúElegido(fc: string): boolean {
    const s = selecciones[fc]
    return Boolean(s?.principalId || s?.guarnicionId)
  }

  const fcTarjeta = diaVista?.fechaConsumo
  const selTarjeta = fcTarjeta
    ? (selecciones[fcTarjeta] ?? crearSeleccionVacia())
    : crearSeleccionVacia()
  const hayPrincipalTarjeta = Boolean(selTarjeta.principalId)

  function principalesParaDia(fechaConsumo: string, sel: SeleccionDia): MenuItem[] {
    if (planificacion) {
      return itemsMenuDesdeOpcionesPlanificadas(
        opcionesPrincipalesPermitidas(planificacion, fechaConsumo),
        'principal',
        itemsById,
        sel.principalId,
      )
    }
    return principales
  }

  function guarnicionesParaDia(fechaConsumo: string, sel: SeleccionDia): MenuItem[] {
    if (planificacion) {
      const principal = sel.principalId ? itemsById.get(sel.principalId) : null
      const principalSnap = sel.principalId
        ? opcionesPrincipalesPermitidas(planificacion, fechaConsumo).find(
            (o) => o.menuId === sel.principalId,
          )
        : null
      const aceptaGuarnicion =
        principal?.aceptaGuarnicion ??
        (principalSnap ? true : sel.principalId ? true : false)
      if (!sel.principalId || aceptaGuarnicion === false) return []
      return itemsMenuDesdeOpcionesPlanificadas(
        opcionesGuarnicionesPermitidas(planificacion, fechaConsumo),
        'guarnicion',
        itemsById,
        sel.guarnicionId,
      )
    }
    return guarniciones
  }

  function opcionesFiltradasPorStock(
    lista: MenuItem[],
    fechaConsumo: string,
    seleccionadoId: string | null,
  ): MenuItem[] {
    if (planificacion) return lista
    return lista.filter((item) => {
      const disp = disponibleParaDia(item.id, fechaConsumo)
      return disp > 0 || seleccionadoId === item.id
    })
  }

  function etiquetaOpcionMenu(item: MenuItem, fechaConsumo: string, esActual: boolean): string {
    if (planificacion) return item.nombre
    const disp = disponibleParaDia(item.id, fechaConsumo)
    if (disp > 0) {
      return `${item.nombre} (${disp} disponible${disp === 1 ? '' : 's'})`
    }
    return esActual ? `${item.nombre} — sin stock (elegí otro)` : item.nombre
  }

  const principalesDia = principalesParaDia(diaVista?.fechaConsumo ?? '', selTarjeta)
  const guarnicionesDia = guarnicionesParaDia(diaVista?.fechaConsumo ?? '', selTarjeta)
  const hayGuarnicionesPlanificadas =
    !planificacion ||
    opcionesGuarnicionesPermitidas(planificacion, diaVista?.fechaConsumo ?? '').length > 0
  const principalTarjeta = selTarjeta.principalId
    ? itemsById.get(selTarjeta.principalId) ??
      principalesDia.find((p) => p.id === selTarjeta.principalId) ??
      null
    : null
  const aceptaGuarnicionTarjeta = principalTarjeta?.aceptaGuarnicion !== false

  if (!authLoading && user && rol && !modoPlanificacion) {
    const home = rutaHomePorRol(rol)
    return <Navigate to={home ?? '/login'} replace />
  }

  if (modoPlanificacion && planCargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 text-sm text-[#8997A6]">
        Cargando formulario…
      </div>
    )
  }

  if (modoPlanificacion && planError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-[#CD1818]">Formulario no disponible</p>
        <p className="max-w-sm text-sm text-[#8997A6]">{planError}</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 pb-12">
      <header className="border-b border-gray-200 bg-white px-4 pb-8 pt-10 shadow-sm">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8997A6]">
            {planificacion ? 'Pedido planificado' : 'Pedidos anticipados'}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#CD1818]">
            {planificacion ? planificacion.empresaNombre : 'Comedor industrial'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#8997A6]">
            {planificacion ? (
              <>
                Completá tu pedido eligiendo entre las opciones planificadas para{' '}
                {planificacion.empresaNombre}. La empresa comparte este link con cada empleado.
                {planificacion.mensajeEmpresa?.trim() ? (
                  <>
                    {' '}
                    <span className="mt-2 block font-medium text-[#171717]">
                      {planificacion.mensajeEmpresa.trim()}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                Reservá tu menú para los{' '}
                <strong className="font-semibold text-[#CD1818]">
                  próximos 7 días
                </strong>
                , incluyendo fin de semana. El stock es único: lo que elegís en un
                día deja menos disponible en los demás. Al menos un día con plato
                principal o guarnición.
              </>
            )}
          </p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-lg px-4">
        <form
          className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <section>
            <h2 className="border-b border-gray-100 pb-2 text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
              Tus datos
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <label className="block text-left">
                <span className="text-xs font-medium text-[#8997A6]">
                  Nombre y apellido
                </span>
                <input
                  name="nombreCliente"
                  value={nombreCliente}
                  onChange={(e) => {
                    setError(null)
                    setNombreCliente(e.target.value)
                  }}
                  className={inputClass}
                  placeholder="Ej. María González"
                  autoComplete="name"
                  aria-invalid={Boolean(error?.includes('nombre'))}
                  required
                />
              </label>
              {!planificacion ? (
                <label className="block text-left">
                  <span className="text-xs font-medium text-[#8997A6]">
                    Lugar de entrega
                  </span>
                  <select
                    name="lugarEntrega"
                    value={lugarEntrega}
                    onChange={(e) => {
                      setError(null)
                      setLugarEntrega(e.target.value as LugarEntrega | '')
                    }}
                    className={inputClass}
                    required
                  >
                    <option value="">Seleccioná…</option>
                    {LUGARES_ENTREGA.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#CD1818]">
                Menú por día
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[#8997A6]">
                {planificacion
                  ? 'Elegí un plato principal (y guarnición si corresponde) entre las opciones de ese día.'
                  : 'Elegí el día en las pestañas. El stock es compartido entre todos los días.'}
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Próximos 7 días disponibles"
              className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:gap-1 lg:overflow-visible lg:px-0"
            >
              {diasDisponibles.map((d) => {
                const activa = d.fechaConsumo === diaActivo
                const completado = díaTieneMenúElegido(d.fechaConsumo)
                const tabId = getDiaTabId(d.fechaConsumo)
                const tabClass = activa
                  ? TAB_ACTIVO
                  : completado
                    ? TAB_COMPLETADO
                    : TAB_INACTIVO
                return (
                  <button
                    key={d.fechaConsumo}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    id={tabId}
                    onClick={() => setDiaActivo(d.fechaConsumo)}
                    className={`flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition lg:min-h-10 lg:min-w-0 lg:flex-1 lg:justify-center lg:gap-1 lg:px-2 lg:py-1.5 lg:text-xs ${
                      tabClass
                    }`}
                  >
                    <span>{formatEtiquetaPestaña(d.fecha)}</span>
                  </button>
                )
              })}
            </div>

            {diaVista ? (
              <div
                role="tabpanel"
                aria-labelledby={getDiaTabId(diaVista.fechaConsumo)}
                className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold tracking-tight text-[#171717]">
                  {diaVista.fechaConsumo}
                </h3>
                <p className="mt-0.5 text-xs text-[#8997A6]">
                  {planificacion
                    ? 'Opciones planificadas para este día. Si no pedís, dejá «No pedir nada este día».'
                    : 'Elegí tu plato principal para este día y, si corresponde, su guarnición.'}
                </p>

                <div className="mt-6 space-y-5">
                  <label className="block text-left">
                    <span className="text-xs font-medium text-[#8997A6]">
                      Plato principal
                    </span>
                    <select
                      value={selTarjeta.principalId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setPrincipalDia(
                          diaVista.fechaConsumo,
                          v === '' ? null : v,
                        )
                      }}
                      className={inputClass}
                    >
                      <option value="">-- No pedir nada este día --</option>
                      {opcionesFiltradasPorStock(
                        principalesDia,
                        diaVista.fechaConsumo,
                        selTarjeta.principalId,
                      ).map((p) => (
                        <option key={p.id} value={p.id}>
                          {etiquetaOpcionMenu(
                            p,
                            diaVista.fechaConsumo,
                            selTarjeta.principalId === p.id,
                          )}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!hayPrincipalTarjeta ? (
                    <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-[#8997A6]">
                      La guarnición se habilita cuando elegís un plato principal.
                    </p>
                  ) : !aceptaGuarnicionTarjeta ? (
                    <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-[#171717]">
                      Este plato no requiere guarnición.
                    </p>
                  ) : !hayGuarnicionesPlanificadas ? (
                    <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-[#8997A6]">
                      No hay guarniciones planificadas para este día.
                    </p>
                  ) : (
                    <label className="block text-left">
                      <span className="text-xs font-medium text-[#8997A6]">
                        Guarnición
                        {!planificacion ? (
                          <span className="font-normal text-[#8997A6]">
                            {' '}
                            (opcional si elegís principal)
                          </span>
                        ) : null}
                      </span>
                      <select
                        value={selTarjeta.guarnicionId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setGuarnicionDia(
                            diaVista.fechaConsumo,
                            v === '' ? null : v,
                          )
                        }}
                        className={inputClass}
                      >
                        <option value="">-- Sin guarnición --</option>
                        {opcionesFiltradasPorStock(
                          guarnicionesDia,
                          diaVista.fechaConsumo,
                          selTarjeta.guarnicionId,
                        ).map((g) => (
                          <option key={g.id} value={g.id}>
                            {etiquetaOpcionMenu(
                              g,
                              diaVista.fechaConsumo,
                              selTarjeta.guarnicionId === g.id,
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
                  <button
                    type="button"
                    onClick={() => pasoDía(-1)}
                    disabled={indiceActivo <= 0}
                    className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium text-[#8997A6] transition hover:bg-gray-50 hover:text-[#171717] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => pasoDía(1)}
                    disabled={indiceActivo >= diasDisponibles.length - 1}
                    className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium text-[#8997A6] transition hover:bg-gray-50 hover:text-[#171717] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="border-t border-gray-100 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[3.25rem] w-full rounded-xl bg-[#CD1818] text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white disabled:shadow-none"
            >
              {loading ? 'Procesando…' : 'Confirmar pedido'}
            </button>

            {error ? (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-[#CD1818]/20 bg-white px-4 py-3 text-center text-sm font-medium text-[#CD1818]"
              >
                {error}
              </div>
            ) : null}

            {!planificacion ? (
              <p className="mt-3 text-center text-[11px] leading-snug text-[#8997A6]">
                El stock se descuenta en una sola operación segura al confirmar.
              </p>
            ) : null}
          </div>
        </form>
      </div>

      {successModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setSuccessModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedido-exito-titulo"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="border-b border-gray-100 bg-white px-6 py-4">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#8997A6]">
                Confirmación
              </p>
            </div>
            <div className="px-6 pb-6 pt-5">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-3xl font-bold text-[#CD1818] ring-1 ring-gray-200">
                ✓
              </div>
              <h2
                id="pedido-exito-titulo"
                className="text-center text-lg font-bold text-[#CD1818]"
              >
                ¡Pedido registrado!
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-[#8997A6]">
                Cada día con menú quedó cargado con su fecha de consumo. La cocina
                lo verá en{' '}
                <strong className="text-[#CD1818]">Pedidos del día</strong>.
              </p>
              <button
                type="button"
                className="mt-6 min-h-12 w-full rounded-xl bg-[#CD1818] text-base font-semibold text-white shadow-sm transition hover:brightness-105"
                onClick={() => setSuccessModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
