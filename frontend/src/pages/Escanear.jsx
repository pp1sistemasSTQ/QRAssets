import { useCallback, useState } from 'react'
import { getActivoPorQr } from '../lib/api'
import Scanner from '../components/Scanner'
import { Badge, PageHeader } from '../components/ui'
import { fechaCorta } from '../lib/format'

export default function Escanear({ ir, notify }) {
  const [camara, setCamara] = useState(true)
  const [ficha, setFicha] = useState(null)
  const [manual, setManual] = useState('')

  const buscar = useCallback(
    async (codigo) => {
      try {
        const r = await getActivoPorQr(codigo)
        if (!r) return notify(`El código ${codigo} no está registrado`, 'error')
        setFicha(r)
        setCamara(false)
      } catch (e) {
        notify(e.message, 'error')
      }
    },
    [notify],
  )

  const { activo, asignacion } = ficha || {}

  return (
    <>
      <PageHeader titulo="Escanear" subtitulo="Un escaneo revela quién tiene el equipo" />

      {!ficha && (
        <section className="card">
          <Scanner activo={camara} onScan={buscar} />
          {!camara && (
            <button className="btn primary" onClick={() => setCamara(true)}>Abrir cámara</button>
          )}
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (manual.trim()) buscar(manual)
            }}
          >
            <input
              placeholder="…o escribe el código del QR"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button className="btn">Buscar</button>
          </form>
        </section>
      )}

      {ficha && (
        <section className="card ficha">
          <div className="section-head">
            <h2>{activo.nombre}</h2>
            <Badge estado={activo.estado} />
          </div>
          <dl className="details">
            <div><dt>Código QR</dt><dd><code>{activo.codigo_qr}</code></dd></div>
            <div><dt>Categoría</dt><dd>{activo.categoria}</dd></div>
            <div><dt>Número serial</dt><dd><code>{activo.numero_serial || 'N/A'}</code></dd></div>
            <div><dt>Registrado</dt><dd>{fechaCorta(activo.created_at)}</dd></div>
          </dl>

          <div className={`custodia ${asignacion ? 'activa' : ''}`}>
            {asignacion ? (
              <>
                <span className="muted small">EN CUSTODIA DE</span>
                <strong className="custodio">{asignacion.usuario_responsable}</strong>
                <span className="muted small">Desde {fechaCorta(asignacion.fecha_asignacion)}</span>
                {asignacion.acta_url && (
                  <a href={asignacion.acta_url} target="_blank" rel="noreferrer">Ver acta firmada ↗</a>
                )}
              </>
            ) : (
              <span className="muted">Sin custodio: el equipo no está asignado a nadie.</span>
            )}
          </div>

          <div className="form-actions">
            <button
              className="btn"
              onClick={() => {
                setFicha(null)
                setCamara(true)
              }}
            >
              Escanear otro
            </button>
            {asignacion && (
              <button
                className="btn primary"
                onClick={() => ir('devolucion', {
                  personaId: asignacion.persona_id,
                  qr: activo.codigo_qr,
                })}
              >
                Iniciar devolución
              </button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
