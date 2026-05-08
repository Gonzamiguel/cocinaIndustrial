import { useEffect, useMemo, useState } from 'react'
import {
  confirmarPedidoSemanalConTransaccion,
  LUGARES_ENTREGA,
  subscribeMenu,
  type LugarEntrega,
  type MenuItem,
} from '../lib/menu'
import {
  formatEtiquetaPestaña,
  getProximaSemanaLaborable,
  type DiaLaboralSemana,
} from '../lib/proximaSemanaLaboral'

/** Azul corporativo (pestaña activa); naranja indicador de día completado */
const TAB_ACTIVO = 'bg-[#003366] text-white shadow-sm'
const TAB_INACTIVO =
  'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-200/80 hover:bg-neutral-50'
const INDICADOR_COMPLETADO = 'text-[#F39200]'

type DiaSeleccion = {
  principalId: string | null
  guarnicionId: string | null
}

function seleccionInicial(
  dias: DiaLaboralSemana[],
): Record<string, DiaSeleccion> {
  const m: Record<string, DiaSeleccion> = {}
  for (const d of dias) {
    m[d.fechaConsumo] = { principalId: null, guarnicionId: null }
  }
  return m
}

/** Validación previa al envío; devuelve mensaje o null si todo ok. */
function validarPedidoSemanal(input: {
  nombreCliente: string
  lugarEntrega: LugarEntrega | ''
  hayAlMenosUnDiaConMenú: boolean
}): string | null {
  const nombre = input.nombreCliente.trim()
  if (!nombre) {
    return 'Por favor, ingresá tu nombre y apellido.'
  }
  if (!input.lugarEntrega) {
    return 'Por favor, elegí un lugar de entrega.'
  }
  if (!input.hayAlMenosUnDiaConMenú) {
    return 'Elegí al menos un día de la próxima semana con plato principal o guarnición.'
  }
  return null
}

export function ClientView() {
  const diasLaborables = useMemo(() => getProximaSemanaLaborable(), [])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selecciones, setSelecciones] = useState<Record<string, DiaSeleccion>>(() =>
    seleccionInicial(diasLaborables),
  )
  const [diaActivo, setDiaActivo] = useState(
    () => diasLaborables[0]?.fechaConsumo ?? '',
  )

  const [nombreCliente, setNombreCliente] = useState('')
  const [lugarEntrega, setLugarEntrega] = useState<LugarEntrega | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successModalOpen, setSuccessModalOpen] = useState(false)

  useEffect(() => {
    return subscribeMenu(setItems)
  }, [])

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
    const base = itemsById.get(menuId)?.stock ?? 0
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
      const actual = prev[fechaConsumo] ?? {
        principalId: null,
        guarnicionId: null,
      }
      const principal = principalId ? itemsById.get(principalId) : null
      const limpiarGuarni =
        principal?.aceptaGuarnicion === false ? null : actual.guarnicionId
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
        ...(prev[fechaConsumo] ?? {
          principalId: null,
          guarnicionId: null,
        }),
        guarnicionId,
      },
    }))
  }

  function lineasEfectivasParaEnvío(): {
    fechaConsumo: string
    principalId: string | null
    guarnicionId: string | null
  }[] {
    const lineas: {
      fechaConsumo: string
      principalId: string | null
      guarnicionId: string | null
    }[] = []
    for (const d of diasLaborables) {
      const s = selecciones[d.fechaConsumo] ?? {
        principalId: null,
        guarnicionId: null,
      }
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
  }

  const hayAlMenosUnDiaConMenú = lineasEfectivasParaEnvío().length > 0

  function resetForm() {
    setNombreCliente('')
    setLugarEntrega('')
    setSelecciones(seleccionInicial(diasLaborables))
    setDiaActivo(diasLaborables[0]?.fechaConsumo ?? '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const msg = validarPedidoSemanal({
      nombreCliente,
      lugarEntrega,
      hayAlMenosUnDiaConMenú,
    })
    if (msg) {
      setError(msg)
      return
    }

    const lineas = lineasEfectivasParaEnvío()

    setLoading(true)
    try {
      await confirmarPedidoSemanalConTransaccion({
        nombreCliente,
        lugarEntrega,
        lineas,
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
    'mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200/90 bg-white px-3 text-base text-neutral-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15'

  const indiceActivo = Math.max(
    0,
    diasLaborables.findIndex((x) => x.fechaConsumo === diaActivo),
  )
  const diaVista = diasLaborables[indiceActivo] ?? diasLaborables[0]

  function pasoDía(delta: -1 | 1) {
    const siguiente = indiceActivo + delta
    if (siguiente < 0 || siguiente >= diasLaborables.length) return
    setDiaActivo(diasLaborables[siguiente].fechaConsumo)
  }

  function díaTieneMenúElegido(fc: string): boolean {
    const s = selecciones[fc]
    return Boolean(s?.principalId || s?.guarnicionId)
  }

  const fcTarjeta = diaVista?.fechaConsumo
  const selTarjeta = fcTarjeta
    ? (selecciones[fcTarjeta] ?? {
        principalId: null,
        guarnicionId: null,
      })
    : { principalId: null, guarnicionId: null }
  const principalTarjeta = selTarjeta.principalId
    ? itemsById.get(selTarjeta.principalId)
    : null
  const aceptaGuarnicionTarjeta = principalTarjeta?.aceptaGuarnicion !== false

  return (
    <div className="min-h-dvh bg-brand-surface pb-12">
      <header className="border-b border-brand-muted/15 bg-brand-surface px-4 pb-8 pt-10">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-muted">
            Pedidos anticipados
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-accent">
            Comedor industrial
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-brand-muted">
            Reservá tu menú para cada día de la{' '}
            <strong className="font-semibold text-brand-accent">
              próxima semana laborable
            </strong>
            . El stock es único: lo que elegís en un día deja menos disponible en
            los demás. Al menos un día con plato principal o guarnición.
          </p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-lg px-4">
        <form
          className="flex flex-col gap-5 rounded-2xl border border-brand-muted/15 bg-brand-surface p-5 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <section>
            <h2 className="border-b border-brand-muted/12 pb-2 text-sm font-semibold uppercase tracking-wide text-brand-accent">
              Tus datos
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <label className="block text-left">
                <span className="text-xs font-medium text-brand-muted">
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
              <label className="block text-left">
                <span className="text-xs font-medium text-brand-muted">
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
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
                Menú por día
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                Elegí el día en las pestañas. El stock es compartido entre todos
                los días.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Días de la próxima semana laborable"
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {diasLaborables.map((d) => {
                const activa = d.fechaConsumo === diaActivo
                const completado = díaTieneMenúElegido(d.fechaConsumo)
                return (
                  <button
                    key={d.fechaConsumo}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    id={`tab-${d.fechaConsumo}`}
                    onClick={() => setDiaActivo(d.fechaConsumo)}
                    className={`flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      activa ? TAB_ACTIVO : TAB_INACTIVO
                    }`}
                  >
                    <span>{formatEtiquetaPestaña(d.fecha)}</span>
                    {completado ? (
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold leading-none ${
                          activa
                            ? 'bg-white/20 text-white'
                            : `bg-[#F39200]/15 ${INDICADOR_COMPLETADO}`
                        }`}
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {diaVista ? (
              <div
                role="tabpanel"
                aria-labelledby={`tab-${diaVista.fechaConsumo}`}
                className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
                  {diaVista.fechaConsumo}
                </h3>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Plato principal y/o guarnición para este día.
                </p>

                <div className="mt-6 space-y-5">
                  <label className="block text-left">
                    <span className="text-xs font-medium text-neutral-600">
                      Plato principal
                      <span className="font-normal text-brand-muted">
                        {' '}
                        (opcional si elegís solo guarnición)
                      </span>
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
                      <option value="">Sin plato principal</option>
                      {principales
                        .filter((p) => {
                          const disp = disponibleParaDia(
                            p.id,
                            diaVista.fechaConsumo,
                          )
                          const esActual = selTarjeta.principalId === p.id
                          return disp > 0 || esActual
                        })
                        .map((p) => {
                          const disp = disponibleParaDia(
                            p.id,
                            diaVista.fechaConsumo,
                          )
                          const esActual = selTarjeta.principalId === p.id
                          return (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                              {disp > 0
                                ? ` (${disp} disponible${disp === 1 ? '' : 's'})`
                                : esActual
                                  ? ' — sin stock (elegí otro)'
                                  : ''}
                            </option>
                          )
                        })}
                    </select>
                  </label>

                  {!aceptaGuarnicionTarjeta ? (
                    <p className="rounded-xl border border-neutral-200/90 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
                      Este plato no requiere guarnición.
                    </p>
                  ) : (
                    <label className="block text-left">
                      <span className="text-xs font-medium text-neutral-600">
                        Guarnición
                        <span className="font-normal text-brand-muted">
                          {' '}
                          (opcional si elegís principal)
                        </span>
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
                        <option value="">Sin guarnición</option>
                        {guarniciones
                          .filter((g) => {
                            const disp = disponibleParaDia(
                              g.id,
                              diaVista.fechaConsumo,
                            )
                            const esActual = selTarjeta.guarnicionId === g.id
                            return disp > 0 || esActual
                          })
                          .map((g) => {
                            const disp = disponibleParaDia(
                              g.id,
                              diaVista.fechaConsumo,
                            )
                            const esActual = selTarjeta.guarnicionId === g.id
                            return (
                              <option key={g.id} value={g.id}>
                                {g.nombre}
                                {disp > 0
                                  ? ` (${disp} disponible${disp === 1 ? '' : 's'})`
                                  : esActual
                                    ? ' — sin stock (elegí otro)'
                                    : ''}
                              </option>
                            )
                          })}
                      </select>
                    </label>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-100 pt-5">
                  <button
                    type="button"
                    onClick={() => pasoDía(-1)}
                    disabled={indiceActivo <= 0}
                    className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => pasoDía(1)}
                    disabled={indiceActivo >= diasLaborables.length - 1}
                    className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="border-t border-brand-muted/12 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[3.25rem] w-full rounded-xl bg-brand-accent text-base font-semibold text-white shadow-md shadow-brand-accent/25 transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:bg-brand-muted/35 disabled:text-brand-surface disabled:shadow-none"
            >
              {loading ? 'Procesando…' : 'Confirmar pedido semanal'}
            </button>

            {error ? (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-brand-accent/35 bg-brand-accent/5 px-4 py-3 text-center text-sm font-medium text-brand-accent"
              >
                {error}
              </div>
            ) : null}

            <p className="mt-3 text-center text-[11px] leading-snug text-brand-muted">
              El stock se descuenta en una sola operación segura al confirmar.
            </p>
          </div>
        </form>
      </div>

      {successModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-muted/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setSuccessModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedido-exito-titulo"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-brand-muted/15 bg-brand-surface shadow-xl shadow-[0_20px_50px_rgba(129,129,129,0.22)]"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="border-b border-brand-muted/15 bg-brand-surface px-6 py-4">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand-muted">
                Confirmación
              </p>
            </div>
            <div className="px-6 pb-6 pt-5">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent text-3xl font-bold text-white shadow-md shadow-brand-accent/35">
                ✓
              </div>
              <h2
                id="pedido-exito-titulo"
                className="text-center text-lg font-bold text-brand-accent"
              >
                ¡Pedido semanal registrado!
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
                Cada día con menú quedó cargado con su fecha de consumo. La cocina
                lo verá en{' '}
                <strong className="text-brand-accent">Pedidos del día</strong>.
              </p>
              <button
                type="button"
                className="mt-6 min-h-12 w-full rounded-xl bg-brand-accent text-base font-semibold text-white shadow-md shadow-brand-accent/25 transition hover:brightness-105"
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
