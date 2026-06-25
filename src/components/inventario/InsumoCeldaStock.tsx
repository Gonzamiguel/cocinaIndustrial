import type { Insumo } from '../../lib/insumos'

type InsumoCeldaStockProps = {
  insumo: Pick<Insumo, 'nombreGenerico' | 'marca' | 'presentacion' | 'rubro' | 'subrubro'>
}

/** Celda de insumo en tablas de stock (nombre, marca, presentación, rubro). */
export function InsumoCeldaStock({ insumo }: InsumoCeldaStockProps) {
  const presentacion = insumo.presentacion?.trim()

  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-[#171717]">
        {insumo.nombreGenerico || 'Sin nombre'}
      </p>
      <p className="mt-0.5 truncate text-xs text-[#8997A6]">
        {insumo.marca || 'Sin marca'}
      </p>
      {presentacion ? (
        <p className="mt-0.5 truncate text-xs font-medium text-[#525252]">
          ({presentacion})
        </p>
      ) : null}
      <p className="mt-1 truncate text-xs text-[#8997A6]">
        {insumo.rubro || 'Sin rubro'}
        {insumo.subrubro ? ` / ${insumo.subrubro}` : ''}
      </p>
    </div>
  )
}
