import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../../context/ToastContext'
import type { FilaImportPadron, PadronPersona } from '../../types/hoteleria'
import {
  crearPersonaPadron,
  importarPadronDesdeFilas,
  subscribePadronPersonas,
} from '../../lib/hoteleria'

function normalizarTextoBusqueda(s: string): string {
  return s.trim().toLowerCase()
}

function filasDesdeSheet(ws: XLSX.WorkSheet): FilaImportPadron[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as string[][]
  if (!rows.length) return []
  const header = rows[0].map((c) => String(c ?? '').trim().toLowerCase())
  const idx = (name: string) => header.findIndex((h) => h === name)
  const iDni = idx('dni')
  const iNombre = idx('nombre')
  const iApellido = idx('apellido')
  const iEmpresa = idx('empresa')
  if (iDni < 0 || iNombre < 0 || iApellido < 0 || iEmpresa < 0) {
    throw new Error(
      'El archivo debe tener una fila de encabezados con las columnas: DNI, Nombre, Apellido, Empresa.',
    )
  }
  const out: FilaImportPadron[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const dni = String(row[iDni] ?? '').trim()
    const nombre = String(row[iNombre] ?? '').trim()
    const apellido = String(row[iApellido] ?? '').trim()
    const empresa = String(row[iEmpresa] ?? '').trim()
    if (!dni && !nombre && !apellido && !empresa) continue
    out.push({ dni, nombre, apellido, empresa })
  }
  return out
}

export function PadronPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PadronPersona[]>([])
  const [q, setQ] = useState('')
  const [importing, setImporting] = useState(false)
  const [modalNueva, setModalNueva] = useState(false)
  const [guardandoPersona, setGuardandoPersona] = useState(false)
  const [npDni, setNpDni] = useState('')
  const [npNombre, setNpNombre] = useState('')
  const [npApellido, setNpApellido] = useState('')
  const [npEmpresa, setNpEmpresa] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = subscribePadronPersonas(setRows)
    return () => unsub()
  }, [])

  const filtradas = useMemo(() => {
    const nq = normalizarTextoBusqueda(q)
    if (!nq) return rows
    return rows.filter((p) => {
      const blob = `${p.dni} ${p.nombre} ${p.apellido} ${p.empresa}`.toLowerCase()
      return blob.includes(nq)
    })
  }, [rows, q])

  const onPickExcel = useCallback(() => {
    fileRef.current?.click()
  }, [])

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
      const res = await importarPadronDesdeFilas(filas)
      showToast(
        `Importación finalizada: ${res.creados} creados, ${res.actualizados} actualizados.`,
        'success',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo importar el archivo.'
      showToast(msg, 'error')
    } finally {
      setImporting(false)
    }
  }

  function abrirModalNueva() {
    setNpDni('')
    setNpNombre('')
    setNpApellido('')
    setNpEmpresa('')
    setModalNueva(true)
  }

  async function guardarNuevaPersona() {
    setGuardandoPersona(true)
    try {
      await crearPersonaPadron({
        dni: npDni,
        nombre: npNombre,
        apellido: npApellido,
        empresa: npEmpresa,
      })
      showToast('Persona agregada al padrón.', 'success')
      setModalNueva(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardandoPersona(false)
    }
  }

  return (
    <div className="min-h-full w-full bg-neutral-100">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1">
              <span className="text-xs font-medium text-neutral-600">Buscar por DNI o nombre</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej. 30123456 o García"
                className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
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
                onClick={abrirModalNueva}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-orange-300 bg-white px-5 text-sm font-semibold text-orange-800 shadow-sm transition hover:bg-orange-50"
              >
                Nueva persona
              </button>
              <button
                type="button"
                onClick={onPickExcel}
                disabled={importing}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? 'Importando…' : 'Importar Excel'}
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-100">
            <table className="min-w-full divide-y divide-neutral-100 text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Apellido</th>
                  <th className="px-4 py-3">Empresa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white text-neutral-800">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                      {rows.length === 0
                        ? 'No hay personas en el padrón. Usá «Nueva persona» o importá un Excel.'
                        : 'No hay resultados para la búsqueda.'}
                    </td>
                  </tr>
                ) : (
                  filtradas.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{p.dni}</td>
                      <td className="px-4 py-3">{p.nombre}</td>
                      <td className="px-4 py-3">{p.apellido}</td>
                      <td className="px-4 py-3 text-neutral-600">{p.empresa || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Mostrando {filtradas.length} de {rows.length} registros.
          </p>
        </section>
      </div>

      {modalNueva ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nueva-persona"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <h2 id="titulo-nueva-persona" className="text-lg font-semibold text-neutral-900">
              Nueva persona
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">DNI</span>
                <input
                  value={npDni}
                  onChange={(e) => setNpDni(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Sin puntos"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Nombre</span>
                <input
                  value={npNombre}
                  onChange={(e) => setNpNombre(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Apellido</span>
                <input
                  value={npApellido}
                  onChange={(e) => setNpApellido(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Empresa</span>
                <input
                  value={npEmpresa}
                  onChange={(e) => setNpEmpresa(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalNueva(false)}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarNuevaPersona()}
                disabled={guardandoPersona}
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {guardandoPersona ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
