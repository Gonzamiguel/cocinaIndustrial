import { useEffect, useMemo, useState } from 'react'
import {
  confirmarPedidoConTransaccion,
  LUGARES_ENTREGA,
  subscribeMenu,
  type LugarEntrega,
  type MenuItem,
} from '../lib/menu'

function PickCard({
  item,
  selected,
  onSelect,
}: {
  item: MenuItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full min-h-[3.25rem] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-base shadow-sm transition active:scale-[0.99] ${
        selected
          ? 'border-brand-accent bg-brand-accent/5 text-brand-accent ring-2 ring-brand-accent/45'
          : 'border-brand-muted/25 bg-brand-surface text-brand-accent hover:border-brand-muted/40'
      }`}
    >
      <span className="font-medium">{item.nombre}</span>
      <span className="shrink-0 rounded-full bg-brand-muted/12 px-2.5 py-0.5 text-xs font-bold tabular-nums text-brand-accent">
        {item.stock}
      </span>
    </button>
  )
}

/** Validación previa al envío; devuelve mensaje o null si todo ok. */
function validarPedidoCliente(input: {
  nombreCliente: string
  lugarEntrega: LugarEntrega | ''
  principalId: string | null
  guarnicionId: string | null
}): string | null {
  const nombre = input.nombreCliente.trim()
  if (!nombre) {
    return 'Por favor, ingresá tu nombre y apellido.'
  }
  if (!input.lugarEntrega) {
    return 'Por favor, elegí un lugar de entrega.'
  }
  if (!input.principalId && !input.guarnicionId) {
    return 'Debés elegir al menos un plato principal o una guarnición para realizar el pedido.'
  }
  return null
}

export function ClientView() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [nombreCliente, setNombreCliente] = useState('')
  const [lugarEntrega, setLugarEntrega] = useState<LugarEntrega | ''>('')
  const [principalId, setPrincipalId] = useState<string | null>(null)
  const [guarnicionId, setGuarnicionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successModalOpen, setSuccessModalOpen] = useState(false)

  useEffect(() => {
    const unsub = subscribeMenu(setItems)
    return unsub
  }, [])

  const principales = useMemo(
    () => items.filter((i) => i.categoria === 'principal' && i.stock > 0),
    [items],
  )
  const guarniciones = useMemo(
    () => items.filter((i) => i.categoria === 'guarnicion' && i.stock > 0),
    [items],
  )

  useEffect(() => {
    if (principalId && !principales.some((p) => p.id === principalId)) {
      setPrincipalId(null)
    }
  }, [principalId, principales])

  useEffect(() => {
    if (guarnicionId && !guarniciones.some((g) => g.id === guarnicionId)) {
      setGuarnicionId(null)
    }
  }, [guarnicionId, guarniciones])

  function resetForm() {
    setNombreCliente('')
    setLugarEntrega('')
    setPrincipalId(null)
    setGuarnicionId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const msg = validarPedidoCliente({
      nombreCliente,
      lugarEntrega,
      principalId,
      guarnicionId,
    })
    if (msg) {
      setError(msg)
      return
    }

    setLoading(true)
    try {
      await confirmarPedidoConTransaccion({
        principalId,
        guarnicionId,
        nombreCliente,
        lugarEntrega,
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

  return (
    <div className="min-h-dvh bg-brand-surface pb-12">
      <header className="border-b border-brand-muted/15 bg-brand-surface px-4 pb-8 pt-10">
        <div className="mx-auto max-w-lg text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-brand-muted">
            Pedidos
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-accent">
            Comedor industrial
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-brand-muted">
            Completá el formulario y elegí tu menú: al menos un plato principal{' '}
            <strong className="font-semibold text-brand-accent">o</strong> una guarnición
            (podés elegir ambos). Solo mostramos ítems con stock disponible.
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
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-base text-brand-accent outline-none transition focus:border-brand-accent focus:bg-brand-surface focus:ring-2 focus:ring-brand-accent/20"
                  placeholder="Ej. María González"
                  autoComplete="name"
                  aria-invalid={Boolean(error?.includes('nombre'))}
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
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-brand-muted/25 bg-brand-muted/5 px-3 text-base text-brand-accent outline-none focus:border-brand-accent focus:bg-brand-surface focus:ring-2 focus:ring-brand-accent/20"
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

          <section>
            <h2 className="border-b border-brand-muted/12 pb-2 text-sm font-semibold uppercase tracking-wide text-brand-accent">
              Plato principal{' '}
              <span className="font-normal normal-case text-brand-muted">
                (opcional si elegís guarnición)
              </span>
            </h2>
            {principales.length === 0 ? (
              <p className="mt-3 text-sm text-brand-muted">
                No hay platos principales disponibles por el momento.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {principales.map((p) => (
                  <PickCard
                    key={p.id}
                    item={p}
                    selected={principalId === p.id}
                    onSelect={() => {
                      setError(null)
                      setPrincipalId(p.id)
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="border-b border-brand-muted/12 pb-2 text-sm font-semibold uppercase tracking-wide text-brand-accent">
              Guarnición{' '}
              <span className="font-normal normal-case text-brand-muted">
                (opcional si elegís principal)
              </span>
            </h2>
            {guarniciones.length === 0 ? (
              <p className="mt-3 text-sm text-brand-muted">
                No hay guarniciones disponibles por el momento.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {guarniciones.map((g) => (
                  <PickCard
                    key={g.id}
                    item={g}
                    selected={guarnicionId === g.id}
                    onSelect={() => {
                      setError(null)
                      setGuarnicionId(g.id)
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="border-t border-brand-muted/12 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[3.25rem] w-full rounded-xl bg-brand-accent text-base font-semibold text-white shadow-md shadow-brand-accent/25 transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:bg-brand-muted/35 disabled:text-brand-surface disabled:shadow-none"
            >
              {loading ? 'Procesando…' : 'Confirmar pedido'}
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
              El stock se actualiza de forma segura al confirmar (solo de lo que
              elegís).
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
                ¡Pedido realizado con éxito!
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-brand-muted">
                Ya está registrado. La cocina lo verá en{' '}
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
