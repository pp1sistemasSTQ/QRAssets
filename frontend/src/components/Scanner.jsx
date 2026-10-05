import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Escáner de QR con la cámara. Llama onScan(texto) por cada lectura nueva
 * (ignora repetidos del mismo código durante 2.5 s para no duplicar).
 */
export default function Scanner({ onScan, activo = true }) {
  const idRef = useRef(`scanner-${Math.random().toString(36).slice(2)}`)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState('')
  onScanRef.current = onScan

  useEffect(() => {
    if (!activo) return undefined
    let cancelled = false
    let scanner = null
    let iniciado = false
    let ultimo = { texto: '', t: 0 }

    const timer = setTimeout(async () => {
      if (cancelled) return
      scanner = new Html5Qrcode(idRef.current)
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.75, height: Math.min(w, h) * 0.75 }) },
          (texto) => {
            const ahora = Date.now()
            if (texto === ultimo.texto && ahora - ultimo.t < 2500) return
            ultimo = { texto, t: ahora }
            onScanRef.current(texto)
          },
          () => {},
        )
        iniciado = true
        if (cancelled) await scanner.stop().catch(() => {})
      } catch (e) {
        setError(
          'No se pudo abrir la cámara. Revisa los permisos del navegador (y que uses https o localhost).',
        )
        console.error(e)
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (scanner && iniciado) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
      }
    }
  }, [activo])

  if (!activo) return null
  return (
    <div className="scanner">
      <div id={idRef.current} className="scanner-view" />
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
