import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PadronFormModal, inputClass, labelClass } from '../../components/padron/PadronFormModal'
import { CredencialDigitalModal } from '../../components/padron/CredencialDigitalModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../context/ToastContext'
import type { PadronPersona } from '../../types/hoteleria'
import type { PadronEmpresa } from '../../types/padronEmpresa'
import { filasCargaMasivaDesdeWorkbook } from '../../lib/padronImport'
import { subscribePadronEmpresas } from '../../lib/padronEmpresas'
import {
  actualizarPersonaPadron,
  crearPersonaPadron,
  eliminarPersonaPadron,
  importarPadronCargaMasiva,
  subscribePadronPersonas,
} from '../../lib/hoteleria'
import {
  MAX_LENGTH_DNI_PADRON,
  sanitizarDniInput,
  sanitizarEmpresaInput,
  sanitizarNombreApellidoInput,
} from '../../lib/padronFormInput'

function normalizarTextoBusqueda(s: string): string {
  return s.trim().toLowerCase()
}

function hoyYmdLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PAGE_SIZE = 20

type ModalPersona =
  | { modo: 'nueva' }
  | { modo: 'editar'; persona: PadronPersona }
  | null

export function PadronPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PadronPersona[]>([])
  const [empresasPadron, setEmpresasPadron] = useState<PadronEmpresa[]>([])
  const [q, setQ] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cargandoMasiva, setCargandoMasiva] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [modal, setModal] = useState<ModalPersona>(null)
  const [guardando, setGuardando] = useState(false)
  const [personaAEliminar, setPersonaAEliminar] = useState<PadronPersona | null>(null)
  const [personaCredencial, setPersonaCredencial] = useState<PadronPersona | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [fDni, setFDni] = useState('')
  const [fNombre, setFNombre] = useState('')
  const [fApellido, setFApellido] = useState('')
  const [fEmpresa, setFEmpresa] = useState('')
  const cargaMasivaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = subscribePadronPersonas(setRows)
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribePadronEmpresas(setEmpresasPadron)
    return () => unsub()
  }, [])

  const empresasDesplegable = useMemo(
    () =>
      [...empresasPadron]
        .map((e) => e.nombre.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [empresasPadron],
  )

  const empresasOpciones = useMemo(() => {
    const set = new Set<string>()
    for (const p of rows) {
      const e = p.empresa?.trim()
      if (e) set.add(e)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [rows])

  const filtradas = useMemo(() => {
    const nq = normalizarTextoBusqueda(q)
    return rows.filter((p) => {
      if (empresaFiltro && p.empresa !== empresaFiltro) return false
      if (!nq) return true
      const blob = `${p.dni} ${p.nombre} ${p.apellido} ${p.empresa}`.toLowerCase()
      return blob.includes(nq)
    })
  }, [rows, q, empresaFiltro])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const paginaSegura = Math.min(pagina, totalPaginas)

  const filtradasPagina = useMemo(() => {
    const start = (paginaSegura - 1) * PAGE_SIZE
    return filtradas.slice(start, start + PAGE_SIZE)
  }, [filtradas, paginaSegura])

  useEffect(() => {
    setPagina(1)
  }, [q, empresaFiltro])

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas)
  }, [pagina, totalPaginas])

  function abrirSelectorCargaMasiva() {
    cargaMasivaRef.current?.click()
  }

  function abrirNueva() {
    setFDni('')
    setFNombre('')
    setFApellido('')
    setFEmpresa('')
    setModal({ modo: 'nueva' })
  }

  function abrirEditar(persona: PadronPersona) {
    setFDni(sanitizarDniInput(persona.dni))
    setFNombre(sanitizarNombreApellidoInput(persona.nombre))
    setFApellido(sanitizarNombreApellidoInput(persona.apellido))
    setFEmpresa(sanitizarEmpresaInput(persona.empresa))
    setModal({ modo: 'editar', persona })
  }

  function cerrarModal() {
    if (guardando) return
    setModal(null)
  }

  async function handleExportExcel() {
    if (!filtradas.length) {
      showToast('No hay registros para exportar.', 'error')
      return
    }
    setExportando(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const header = ['DNI', 'Apellido', 'Nombre', 'Empresa']
      const rowsExport = filtradas.map((p) => [
        p.dni,
        p.apellido,
        p.nombre,
        p.empresa || 'No especificada',
      ])
      const ws = XLSX.utils.aoa_to_sheet([header, ...rowsExport])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Padron')
      const fechaArchivo = hoyYmdLocal()
      XLSX.writeFile(wb, `Padron_Personas_Export_${fechaArchivo}.xlsx`)
      showToast(
        `Excel generado: ${filtradas.length.toLocaleString('es-AR')} registros.`,
        'success',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo exportar el Excel.', 'error')
    } finally {
      setExportando(false)
    }
  }

  async function onCargaMasiva(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setCargandoMasiva(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const filas = filasCargaMasivaDesdeWorkbook(wb)
      const res = await importarPadronCargaMasiva(filas)
      if (res.procesados === 0) {
        const detalle =
          res.empresasDesconocidas.length > 0
            ? ` Empresas no registradas: ${res.empresasDesconocidas.slice(0, 5).join(', ')}${res.empresasDesconocidas.length > 5 ? '…' : ''}.`
            : ''
        showToast(
          `Ninguna fila se importó.${detalle} Cargá las empresas en Padrón de Empresas primero.`,
          'error',
        )
        return
      }
      let msg = `Carga masiva: ${res.procesados.toLocaleString('es-AR')} registros procesados.`
      if (res.omitidos > 0) {
        msg += ` ${res.omitidos.toLocaleString('es-AR')} omitidos.`
      }
      if (res.empresasDesconocidas.length > 0) {
        msg += ` Empresas no registradas: ${res.empresasDesconocidas.slice(0, 4).join(', ')}`
        if (res.empresasDesconocidas.length > 4) msg += '…'
      }
      showToast(msg, res.omitidos > 0 ? 'info' : 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo procesar el archivo.'
      showToast(msg, 'error')
    } finally {
      setCargandoMasiva(false)
    }
  }

  async function confirmarEliminarPersona() {
    if (!personaAEliminar) return
    setEliminando(true)
    try {
      await eliminarPersonaPadron(personaAEliminar.id)
      showToast('Persona eliminada del padrón.', 'success')
      setPersonaAEliminar(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    } finally {
      setEliminando(false)
    }
  }

  async function guardarFormulario() {
    setGuardando(true)
    try {
      const payload = {
        dni: fDni,
        nombre: fNombre,
        apellido: fApellido,
        empresa: fEmpresa,
      }
      if (modal?.modo === 'editar') {
        await actualizarPersonaPadron(modal.persona.id, payload)
        showToast('Persona actualizada.', 'success')
      } else {
        await crearPersonaPadron(payload)
        showToast('Persona agregada al padrón.', 'success')
      }
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const esEdicion = modal?.modo === 'editar'
  const tituloModal = esEdicion ? 'Editar persona' : 'Nueva persona'
  const subtituloModal = esEdicion
    ? `${modal.persona.apellido}, ${modal.persona.nombre}`
    : 'Completá los datos del padrón'

  return (
    <div className="min-h-full w-full bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-0 w-full max-w-[12rem] sm:max-w-[14rem]">
              <span className="text-xs font-medium text-neutral-600">Buscar por DNI o nombre</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej. 30123456 o García"
                className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
              />
            </label>
            <label className="block min-w-[10rem] sm:min-w-[12rem]">
              <span className="text-xs font-medium text-neutral-600">Empresa</span>
              <select
                value={empresaFiltro}
                onChange={(e) => setEmpresaFiltro(e.target.value)}
                className="mt-1.5 block w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
              >
                <option value="">Todas las empresas</option>
                {empresasOpciones.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={cargaMasivaRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(ev) => void onCargaMasiva(ev)}
            />
            <button
              type="button"
              onClick={abrirNueva}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#CD1818]/30 bg-white px-4 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-[#CD1818]/5"
            >
              Nueva persona
            </button>
            <button
              type="button"
              onClick={abrirSelectorCargaMasiva}
              disabled={cargandoMasiva}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cargandoMasiva ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {cargandoMasiva ? 'Cargando…' : 'Carga masiva'}
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={!filtradas.length || exportando}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {exportando ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4 shrink-0" aria-hidden />
              )}
              Excel
            </button>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-100">
            <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Apellido</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="min-w-[11rem] px-4 py-3 text-center">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                      {rows.length === 0
                        ? 'No hay personas en el padrón. Usá «Nueva persona» o «Carga masiva».'
                        : 'No hay resultados con los filtros aplicados.'}
                    </td>
                  </tr>
                ) : (
                  filtradasPagina.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{p.dni}</td>
                      <td className="px-4 py-3">{p.nombre}</td>
                      <td className="px-4 py-3">{p.apellido}</td>
                      <td className="px-4 py-3 text-neutral-600">{p.empresa || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPersonaCredencial(p)}
                            aria-label={`Ver credencial de ${p.apellido}, ${p.nombre}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-semibold text-neutral-700 transition hover:border-[#CD1818]/30 hover:bg-[#CD1818]/5 hover:text-[#CD1818]"
                          >
                            🪪 Credencial
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirEditar(p)}
                            aria-label={`Editar ${p.apellido}, ${p.nombre}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-[#CD1818]/10 hover:text-[#CD1818]"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPersonaAEliminar(p)}
                            aria-label={`Eliminar ${p.apellido}, ${p.nombre}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {filtradas.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/80 px-4 py-3">
                <p className="text-xs text-neutral-600">
                  Mostrando {(paginaSegura - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginaSegura * PAGE_SIZE, filtradas.length)} de{' '}
                  {filtradas.length.toLocaleString('es-AR')} filtrados ({rows.length.toLocaleString('es-AR')}{' '}
                  en total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={paginaSegura <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs tabular-nums text-neutral-600">
                    Pág. {paginaSegura} / {totalPaginas}
                  </span>
                  <button
                    type="button"
                    disabled={paginaSegura >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <CredencialDigitalModal
        open={personaCredencial !== null}
        persona={personaCredencial}
        onClose={() => setPersonaCredencial(null)}
      />

      <ConfirmDialog
        open={personaAEliminar !== null}
        title="Eliminar persona"
        description={
          personaAEliminar
            ? `¿Estás seguro que deseas eliminar «${personaAEliminar.apellido}, ${personaAEliminar.nombre}»?`
            : ''
        }
        confirmLabel="Sí"
        cancelLabel="No"
        isWorking={eliminando}
        onCancel={() => {
          if (!eliminando) setPersonaAEliminar(null)
        }}
        onConfirm={() => void confirmarEliminarPersona()}
      />

      <PadronFormModal
        open={modal !== null}
        title={tituloModal}
        subtitle={subtituloModal}
        onClose={cerrarModal}
        onSave={() => void guardarFormulario()}
        saving={guardando}
        saveDisabled={!fDni.trim() || !fNombre.trim() || !fApellido.trim()}
        saveLabel={esEdicion ? 'Guardar cambios' : 'Guardar'}
      >
        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>DNI</span>
            <input
              value={fDni}
              onChange={(e) => setFDni(sanitizarDniInput(e.target.value))}
              className={`${inputClass} font-mono uppercase`}
              placeholder="Sin puntos"
              autoComplete="off"
              inputMode="numeric"
              maxLength={MAX_LENGTH_DNI_PADRON}
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Nombre</span>
            <input
              value={fNombre}
              onChange={(e) => setFNombre(sanitizarNombreApellidoInput(e.target.value))}
              className={`${inputClass} uppercase`}
              autoComplete="given-name"
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Apellido</span>
            <input
              value={fApellido}
              onChange={(e) => setFApellido(sanitizarNombreApellidoInput(e.target.value))}
              className={`${inputClass} uppercase`}
              autoComplete="family-name"
              required
            />
          </label>
          <label className="block">
            <span className={labelClass}>Empresa</span>
            <select
              value={empresasDesplegable.includes(fEmpresa) ? fEmpresa : ''}
              onChange={(e) => setFEmpresa(sanitizarEmpresaInput(e.target.value))}
              className={inputClass}
            >
              <option value="">Elegir del padrón de empresas…</option>
              {empresasDesplegable.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            {empresasDesplegable.length === 0 ? (
              <p className="mt-1.5 text-xs text-neutral-500">
                No hay empresas cargadas. Agregalas en Padrón de Empresas.
              </p>
            ) : null}
            <input
              value={fEmpresa}
              onChange={(e) => setFEmpresa(sanitizarEmpresaInput(e.target.value))}
              className={`${inputClass} mt-2 uppercase`}
              placeholder="Empresa seleccionada o escribí el nombre"
              autoComplete="organization"
            />
          </label>
        </div>
      </PadronFormModal>
    </div>
  )
}
