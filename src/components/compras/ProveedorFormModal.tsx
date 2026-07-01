import { useEffect, useState } from 'react'
import type { CondicionIva, TipoPersonaEmpresa } from '../../types/compras'
import type { ProveedorPadron } from '../../lib/proveedoresPadron'
import {
  inputClass,
  labelClass,
  TesoreriaFormModal,
} from '../tesoreria/TesoreriaFormModal'

const CONDICIONES_IVA: CondicionIva[] = [
  'RESPONSABLE_INSCRIPTO',
  'MONOTRIBUTO',
  'EXENTO',
  'CONSUMIDOR_FINAL',
  'NO_RESPONSABLE',
]

function etiquetaCondicionIva(c: CondicionIva): string {
  switch (c) {
    case 'RESPONSABLE_INSCRIPTO':
      return 'Responsable inscripto'
    case 'MONOTRIBUTO':
      return 'Monotributo'
    case 'EXENTO':
      return 'Exento'
    case 'CONSUMIDOR_FINAL':
      return 'Consumidor final'
    default:
      return 'No responsable'
  }
}

export type ProveedorFormModalProps = {
  open: boolean
  onClose: () => void
  onSave: (values: ProveedorFormValues) => Promise<void>
  saving: boolean
  proveedor?: ProveedorPadron | null
}

export type ProveedorFormValues = {
  razonSocial: string
  cuit: string
  tipoPersona: TipoPersonaEmpresa
  condicionIva: CondicionIva
  direccionFiscal: string
  localidad: string
  provincia: string
  codigoPostal: string
  email: string
  telefono: string
  plazoPagoDias: string
  monedaDefault: 'ARS' | 'USD'
  proveedorActivo: boolean
  codigoInterno: string
}

function valoresDesdeProveedor(p: ProveedorPadron | null | undefined): ProveedorFormValues {
  if (!p) {
    return {
      razonSocial: '',
      cuit: '',
      tipoPersona: 'JURIDICA',
      condicionIva: 'RESPONSABLE_INSCRIPTO',
      direccionFiscal: '',
      localidad: '',
      provincia: '',
      codigoPostal: '',
      email: '',
      telefono: '',
      plazoPagoDias: '30',
      monedaDefault: 'ARS',
      proveedorActivo: true,
      codigoInterno: '',
    }
  }
  return {
    razonSocial: p.razonSocial,
    cuit: p.cuit,
    tipoPersona: p.tipoPersona,
    condicionIva: p.condicionIva,
    direccionFiscal: p.direccionFiscal,
    localidad: p.localidad,
    provincia: p.provincia,
    codigoPostal: p.codigoPostal,
    email: p.email,
    telefono: p.telefono,
    plazoPagoDias: String(p.plazoPagoDias),
    monedaDefault: p.monedaDefault,
    proveedorActivo: p.proveedorActivo,
    codigoInterno: p.codigoInterno,
  }
}

export function ProveedorFormModal({
  open,
  onClose,
  onSave,
  saving,
  proveedor,
}: ProveedorFormModalProps) {
  const esEdicion = Boolean(proveedor)
  const [values, setValues] = useState<ProveedorFormValues>(() =>
    valoresDesdeProveedor(proveedor),
  )

  useEffect(() => {
    if (!open) return
    setValues(valoresDesdeProveedor(proveedor))
  }, [open, proveedor])

  const formValid = values.razonSocial.trim().length > 0 && values.cuit.trim().length > 0

  function patch(partial: Partial<ProveedorFormValues>) {
    setValues((prev) => ({ ...prev, ...partial }))
  }

  return (
    <TesoreriaFormModal
      open={open}
      title={esEdicion ? 'Editar proveedor' : 'Nuevo proveedor'}
      subtitle="Al guardar queda activo y disponible para emitir órdenes de compra."
      onClose={onClose}
      onSave={() => void onSave(values)}
      saving={saving}
      saveDisabled={!formValid}
      saveLabel={esEdicion ? 'Guardar cambios' : 'Dar de alta proveedor'}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="prov-razon">
              Razón social *
            </label>
            <input
              id="prov-razon"
              className={inputClass}
              value={values.razonSocial}
              onChange={(e) => patch({ razonSocial: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-cuit">
              CUIT / CUIL *
            </label>
            <input
              id="prov-cuit"
              className={inputClass}
              placeholder="Ej. 30-71234567-8"
              value={values.cuit}
              onChange={(e) => patch({ cuit: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-tipo">
              Tipo de persona
            </label>
            <select
              id="prov-tipo"
              className={inputClass}
              value={values.tipoPersona}
              onChange={(e) =>
                patch({ tipoPersona: e.target.value as TipoPersonaEmpresa })
              }
            >
              <option value="JURIDICA">Persona jurídica</option>
              <option value="FISICA">Persona física</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-iva">
              Condición IVA
            </label>
            <select
              id="prov-iva"
              className={inputClass}
              value={values.condicionIva}
              onChange={(e) => patch({ condicionIva: e.target.value as CondicionIva })}
            >
              {CONDICIONES_IVA.map((c) => (
                <option key={c} value={c}>
                  {etiquetaCondicionIva(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-codigo">
              Código interno (opcional)
            </label>
            <input
              id="prov-codigo"
              className={inputClass}
              value={values.codigoInterno}
              onChange={(e) => patch({ codigoInterno: e.target.value })}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Domicilio fiscal
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="prov-dir">
                Dirección
              </label>
              <input
                id="prov-dir"
                className={inputClass}
                value={values.direccionFiscal}
                onChange={(e) => patch({ direccionFiscal: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="prov-loc">
                Localidad
              </label>
              <input
                id="prov-loc"
                className={inputClass}
                value={values.localidad}
                onChange={(e) => patch({ localidad: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="prov-prov">
                Provincia
              </label>
              <input
                id="prov-prov"
                className={inputClass}
                value={values.provincia}
                onChange={(e) => patch({ provincia: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="prov-cp">
                Código postal
              </label>
              <input
                id="prov-cp"
                className={inputClass}
                value={values.codigoPostal}
                onChange={(e) => patch({ codigoPostal: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="prov-email">
              Email
            </label>
            <input
              id="prov-email"
              type="email"
              className={inputClass}
              value={values.email}
              onChange={(e) => patch({ email: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-tel">
              Teléfono
            </label>
            <input
              id="prov-tel"
              className={inputClass}
              value={values.telefono}
              onChange={(e) => patch({ telefono: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-plazo">
              Plazo de pago (días)
            </label>
            <input
              id="prov-plazo"
              type="number"
              min="0"
              className={inputClass}
              value={values.plazoPagoDias}
              onChange={(e) => patch({ plazoPagoDias: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="prov-moneda">
              Moneda default
            </label>
            <select
              id="prov-moneda"
              className={inputClass}
              value={values.monedaDefault}
              onChange={(e) =>
                patch({ monedaDefault: e.target.value as 'ARS' | 'USD' })
              }
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={values.proveedorActivo}
            onChange={(e) => patch({ proveedorActivo: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-[#CD1818] focus:ring-[#CD1818]/30"
          />
          Proveedor activo (visible en compras y tesorería)
        </label>
      </div>
    </TesoreriaFormModal>
  )
}
