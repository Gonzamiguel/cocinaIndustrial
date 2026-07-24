import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

type Props = {
  value: string
  className?: string
}

export function BarcodeCode128({ value, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !value.trim()) return
    try {
      JsBarcode(svg, value.trim(), {
        format: 'CODE128',
        width: 1.15,
        height: 34,
        displayValue: false,
        margin: 0,
      })
    } catch {
      svg.innerHTML = ''
    }
  }, [value])

  if (!value.trim()) return null

  return <svg ref={svgRef} className={className} aria-hidden />
}
