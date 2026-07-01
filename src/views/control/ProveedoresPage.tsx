import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Loader2, Pencil, Plus } from 'lucide-react'
import { ProveedorPerfilLink } from '../../components/compras/ProveedorPerfilLink'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  ProveedorFormModal,
  type ProveedorFormValues,
} from '../../components/compras/ProveedorFormModal'
import { puedeOperarFinanzas } from '../../lib/rbac'
import {
  actualizarProveedorPadron,
  crearProveedorPadron,
  mensajeErrorProveedorPadron,
  setProveedorActivo,
  subscribeProveedoresPadron,
  type ProveedorPadron,
} from '../../lib/proveedoresPadron'

function etiquetaCondicionIva(c: ProveedorPadron['condicionIva']): string {
  switch (c) {
    case 'RESPONSABLE_INSCRIPTO':
      return 'RI'
    case 'MONOTRIBUTO':
      return 'Monotributo'
    case 'EXENTO':
      return 'Exento'
    default:
      return c.replace(/_/g, ' ')
  }
}

function formValuesToInput(values: ProveedorFormValues, usuarioUid: string) {
  return {
    razonSocial: values.razonSocial.trim(),
    cuit: values.cuit.trim(),
    tipoPersona: values.tipoPersona,
    condicionIva: values.condicionIva,
    direccionFiscal: values.direccionFiscal.trim(),
    localidad: values.localidad.trim(),
    provincia: values.provincia.trim(),
    codigoPostal: values.codigoPostal.trim(),
    email: values.email.trim(),
    telefono: values.telefono.trim(),
    plazoPagoDias: Math.max(0, Math.round(Number(values.plazoPagoDias) || 0)),
    monedaDefault: values.monedaDefault,
    proveedorActivo: values.proveedorActivo,
    codigoInterno: values.codigoInterno.trim(),
    usuarioUid,
  }
}

export function ProveedoresPage() {
  const { user, rol } = useAuth()
  const { showToast } = useToast()
  const puedeEscribir = puedeOperarFinanzas(rol)

  const [proveedores, setProveedores] = useState<ProveedorPadron[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [proveedorEditar, setProveedorEditar] = useState<ProveedorPadron | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [toggleId, setToggleId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeProveedoresPadron((rows) => {
      setProveedores(rows)
      setCargando(false)
    })
    return () => unsub()
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return proveedores
    return proveedores.filter(
      (p) =>
        p.razonSocial.toLowerCase().includes(q) ||
        p.cuit.toLowerCase().includes(q) ||
        p.direccionFiscal.toLowerCase().includes(q),
    )
  }, [proveedores, busqueda])

  function abrirNuevo() {
    setProveedorEditar(null)
    setModalAbierto(true)
  }

  function abrirEditar(p: ProveedorPadron) {
    setProveedorEditar(p)
    setModalAbierto(true)
  }

  function cerrarModal() {
    if (guardando) return
    setModalAbierto(false)
    setProveedorEditar(null)
  }

  async function handleGuardar(values: ProveedorFormValues) {
    if (!user || !puedeEscribir) return
    setGuardando(true)
    try {
      const input = formValuesToInput(values, user.uid)
      if (proveedorEditar) {
        await actualizarProveedorPadron(proveedorEditar.id, input)
        showToast(`Proveedor «${input.razonSocial}» actualizado.`, 'success')
      } else {
        await crearProveedorPadron(input)
        showToast(`Proveedor «${input.razonSocial}» dado de alta. Ya podés emitir OC.`, 'success')
      }
      cerrarModal()
    } catch (err) {
      showToast(mensajeErrorProveedorPadron(err), 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function handleToggleActivo(p: ProveedorPadron) {
    if (!user || !puedeEscribir || toggleId) return
    setToggleId(p.id)
    try {
      const nuevo = !p.proveedorActivo
      await setProveedorActivo(p.id, nuevo, user.uid)
      showToast(
        nuevo
          ? `«${p.razonSocial}» activado para compras.`
          : `«${p.razonSocial}» desactivado.`,
        'success',
      )
    } catch (err) {
      showToast(mensajeErrorProveedorPadron(err), 'error')
    } finally {
      setToggleId(null)
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
              Proveedores
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Padrón de proveedores con legajo digital. Usá «Ver perfil» para ver remitos, facturas y
              OCs de cada uno.
            </p>
          </div>
          {puedeEscribir ? (
            <button
              type="button"
              onClick={abrirNuevo}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01515]"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nuevo proveedor
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
            <Loader2 className="h-8 w-8 animate-spin text-[#CD1818]" aria-hidden />
            <p className="text-sm">Cargando proveedores…</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="search"
                placeholder="Buscar por razón social, CUIT o domicilio…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="min-h-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
              />
              <p className="text-sm text-neutral-500">
                {filtrados.length} proveedor{filtrados.length === 1 ? '' : 'es'}
              </p>
            </div>

            {filtrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-neutral-300" aria-hidden />
                <p className="text-sm font-medium text-neutral-700">
                  {proveedores.length === 0
                    ? 'Todavía no hay proveedores registrados.'
                    : 'Ningún proveedor coincide con la búsqueda.'}
                </p>
                {puedeEscribir && proveedores.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">
                    Dá de alta el primero para poder emitir órdenes de compra.{' '}
                    <button
                      type="button"
                      onClick={abrirNuevo}
                      className="font-semibold text-[#CD1818] hover:underline"
                    >
                      Crear proveedor
                    </button>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50/80 text-xs uppercase tracking-wide text-neutral-500">
                        <th className="px-3 py-3 font-semibold">Razón social</th>
                        <th className="px-3 py-3 font-semibold">CUIT</th>
                        <th className="px-3 py-3 font-semibold">IVA</th>
                        <th className="px-3 py-3 font-semibold">Domicilio fiscal</th>
                        <th className="px-3 py-3 font-semibold">Plazo</th>
                        <th className="px-3 py-3 font-semibold">Estado</th>
                        <th className="px-3 py-3 font-semibold">Legajo</th>
                        {puedeEscribir ? (
                          <th className="px-3 py-3 font-semibold">Administración</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-neutral-50 hover:bg-neutral-50/60"
                        >
                          <td className="px-3 py-3 font-medium text-neutral-900">
                            {p.razonSocial}
                          </td>
                          <td className="px-3 py-3 text-neutral-600">{p.cuit || '—'}</td>
                          <td className="px-3 py-3 text-neutral-600">
                            {etiquetaCondicionIva(p.condicionIva)}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-3 text-neutral-600">
                            {[p.direccionFiscal, p.localidad, p.provincia]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </td>
                          <td className="px-3 py-3 text-neutral-600">
                            {p.plazoPagoDias} d · {p.monedaDefault}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                p.proveedorActivo
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              {p.proveedorActivo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <ProveedorPerfilLink proveedorId={p.id} variant="button" />
                          </td>
                          {puedeEscribir ? (
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => abrirEditar(p)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={toggleId === p.id}
                                  onClick={() => void handleToggleActivo(p)}
                                  className="text-xs font-semibold text-[#CD1818] hover:underline disabled:opacity-50"
                                >
                                  {p.proveedorActivo ? 'Desactivar' : 'Activar'}
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!puedeEscribir ? (
              <p className="mt-4 text-xs text-neutral-400">
                Modo consulta. Solo administrativo finanzas puede dar de alta proveedores.
              </p>
            ) : (
              <p className="mt-4 text-xs text-neutral-500">
                Tip: después del alta, andá a{' '}
                <Link to="/control/compras" className="font-semibold text-[#CD1818] hover:underline">
                  Compras
                </Link>{' '}
                y emití una OC con el proveedor recién creado.
              </p>
            )}
          </>
        )}
      </div>

      <ProveedorFormModal
        open={modalAbierto}
        onClose={cerrarModal}
        onSave={handleGuardar}
        saving={guardando}
        proveedor={proveedorEditar}
      />
    </div>
  )
}
