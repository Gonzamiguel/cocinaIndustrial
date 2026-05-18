import { useEffect, useState } from 'react'
import type { ServicioComedor } from '../types/comedor'
import { obtenerServicioActual } from '../lib/servicioComedor'

/** Recalcula el servicio actual cada minuto (y al montar). */
export function useServicioComedor(): ServicioComedor {
  const [servicio, setServicio] = useState<ServicioComedor>(() => obtenerServicioActual())

  useEffect(() => {
    const tick = () => setServicio(obtenerServicioActual())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  return servicio
}
