import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PadronFormModal, inputClass, labelClass } from '../../components/padron/PadronFormModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../context/ToastContext'
import type { FilaImportPadronEmpresa, PadronEmpresa } from '../../types/padronEmpresa'
import {
  actualizarEmpresaPadron,
  crearEmpresaPadron,
  eliminarEmpresaPadron,
  importarPadronEmpresasDesdeFilas,
  subscribePadronEmpresas,
} from '../../lib/padronEmpresas'

function normalizarTextoBusqueda(s: string): string {
  return s.trim().toLowerCase()
}

function filasDesdeSheet(ws: XLSX.WorkSheet): FilaImportPadronEmpresa[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][]
  if (!rows.length) return []

  const header = rows[0].map((c) => String(c ?? '').trim().toLowerCase())
  const idx = (name: string) => header.findIndex((h) => h === name)
  const iNombre = idx('nombre')
  const iEmpresa = idx('empresa')
  const iNombreEmpresa = idx('nombre de empresa')
  const iCuit = idx('cuit')

  const col =
    iNombre >= 0 ? iNombre : iEmpresa >= 0 ? iEmpresa : iNombreEmpresa >= 0 ? iNombreEmpresa : -1

  if (col < 0) {
    throw new Error(
      'El archivo debe tener una fila de encabezados con la columna: Nombre (o Empresa / Nombre de empresa).',
    )
  }

  const out: FilaImportPadronEmpresa[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const nombre = String(row[col] ?? '').trim()
    if (!nombre) continue
    const cuit = iCuit >= 0 ? String(row[iCuit] ?? '').trim() : undefined
    out.push({ nombre, cuit })
  }
  return out
}

type ModalEmpresa =
  | { modo: 'nueva' }
  | { modo: 'editar'; empresa: PadronEmpresa }
  | null

export function PadronEmpresasPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PadronEmpresa[]>([])
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const [modal, setModal] = useState<ModalEmpresa>(null)
  const [guardando, setGuardando] = useState(false)
  const [empresaAEliminar, setEmpresaAEliminar] = useState<PadronEmpresa | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [fNombre, setFNombre] = useState('')
  const [fCuit, setFCuit] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = subscribePadronEmpresas(setRows)
    return () => unsub()
  }, [])

  const filtradas = useMemo(() => {
    const nq = normalizarTextoBusqueda(q)
    if (!nq) return rows
    return rows.filter(
      (e) =>
        e.nombre.toLowerCase().includes(nq) ||
        (e.cuit && e.cuit.toLowerCase().includes(nq)),
    )
  }, [rows, q])

  const onPickExcel = useCallback(() => {
    fileRef.current?.click()
  }, [])

  function abrirNueva() {
    setFNombre('')
    setFCuit('')
    setModal({ modo: 'nueva' })
  }

  function abrirEditar(empresa: PadronEmpresa) {
    setFNombre(empresa.nombre)
    setFCuit(empresa.cuit)
    setModal({ modo: 'editar', empresa })
  }

  function cerrarModal() {
    if (guardando) return
    setModal(null)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const name = wb.SheetNames[0]
      if (!name) {
        showToast('El archivo no tiene hojas.', 'error')
        return
      }
      const filas = filasDesdeSheet(wb.Sheets[name]!)
      if (!filas.length) {
        showToast('No se encontraron filas de datos.', 'error')
        return
      }
      const res = await importarPadronEmpresasDesdeFilas(filas)
      const extra =
        res.omitidos > 0 ? `, ${res.omitidos} filas omitidas (vacías o duplicadas en archivo).` : ''
      showToast(
        `Importación finalizada: ${res.creados} creadas, ${res.actualizados} actualizadas${extra}`,
        'success',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo importar el archivo.'
      showToast(msg, 'error')
    } finally {
      setImporting(false)
    }
  }

  async function confirmarEliminarEmpresa() {
    if (!empresaAEliminar) return
    setEliminando(true)
    try {
      await eliminarEmpresaPadron(empresaAEliminar.id)
      showToast('Empresa eliminada del padrón.', 'success')
      setEmpresaAEliminar(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo eliminar.', 'error')
    } finally {
      setEliminando(false)
    }
  }

  async function guardarFormulario() {
    setGuardando(true)
    try {
      const payload = { nombre: fNombre, cuit: fCuit }
      if (modal?.modo === 'editar') {
        await actualizarEmpresaPadron(modal.empresa.id, payload)
        showToast('Empresa actualizada.', 'success')
      } else {
        await crearEmpresaPadron(payload)
        showToast('Empresa agregada al padrón.', 'success')
      }
      setModal(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const esEdicion = modal?.modo === 'editar'
  const tituloModal = esEdicion ? 'Editar empresa' : 'Nueva empresa'
  const subtituloModal = esEdicion ? modal.empresa.nombre : 'Datos del padrón corporativo'

  return (
    <div className="min-h-full w-full bg-neutral-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1">
              <span className="text-xs font-medium text-neutral-600">
                Buscar por nombre o CUIT
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej. Minera del Sur"
                className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[#CD1818]/40 focus:ring-2 focus:ring-[#CD1818]/15"
              />
            </label>
            <div className="flex shrink-0 flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(ev) => void onFile(ev)}
              />
              <button
                type="button"
                onClick={abrirNueva}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#CD1818]/30 bg-white px-5 text-sm font-semibold text-[#CD1818] shadow-sm transition hover:bg-[#CD1818]/5"
              >
                Nueva empresa
              </button>
              <button
                type="button"
                onClick={onPickExcel}
                disabled={importing}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#CD1818] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b01414] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? 'Importando…' : 'Importar Excel'}
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-100">
            <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Nombre de empresa</th>
                  <th className="px-4 py-3">CUIT</th>
                  <th className="w-24 px-4 py-3 text-center">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-neutral-500">
                      {rows.length === 0
                        ? 'No hay empresas en el padrón. Usá «Nueva empresa» o importá un Excel.'
                        : 'No hay resultados para la búsqueda.'}
                    </td>
                  </tr>
                ) : (
                  filtradas.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50/80">
                      <td className="px-4 py-3 font-medium">{e.nombre}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-600">
                        {e.cuit || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEditar(e)}
                            aria-label={`Editar ${e.nombre}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-[#CD1818]/10 hover:text-[#CD1818]"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmpresaAEliminar(e)}
                            aria-label={`Eliminar ${e.nombre}`}
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
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Mostrando {filtradas.length} de {rows.length} empresas.
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={empresaAEliminar !== null}
        title="Eliminar empresa"
        description={
          empresaAEliminar
            ? `¿Estás seguro que deseas eliminar «${empresaAEliminar.nombre}»?`
            : ''
        }
        confirmLabel="Sí"
        cancelLabel="No"
        isWorking={eliminando}
        onCancel={() => {
          if (!eliminando) setEmpresaAEliminar(null)
        }}
        onConfirm={() => void confirmarEliminarEmpresa()}
      />

      <PadronFormModal
        open={modal !== null}
        title={tituloModal}
        subtitle={subtituloModal}
        onClose={cerrarModal}
        onSave={() => void guardarFormulario()}
        saving={guardando}
        saveDisabled={!fNombre.trim()}
        saveLabel={esEdicion ? 'Guardar cambios' : 'Guardar'}
      >
        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>Nombre de empresa</span>
            <input
              value={fNombre}
              onChange={(e) => setFNombre(e.target.value)}
              className={inputClass}
              placeholder="Ej. Contratista ABC S.A."
            />
          </label>
          <label className="block">
            <span className={labelClass}>
              CUIT <span className="font-normal text-neutral-400">(opcional)</span>
            </span>
            <input
              value={fCuit}
              onChange={(e) => setFCuit(e.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="Ej. 30-71234567-8"
              autoComplete="off"
            />
          </label>
        </div>
      </PadronFormModal>
    </div>
  )
}
