import { useEffect, useState } from 'react'
import { listActivos, listHistorialReciente } from '../lib/api'
import { PageHeader } from '../components/ui'
import { fechaCorta } from '../lib/format'
import { IconReturn, IconScan, IconSend } from '../components/Icons'

export default function Dashboard({ ir, notify }) {
  const [activos, setActivos] = useState(null)
  const [historial, setHistorial] = useState([])

  useEffect(() => {
    Promise.all([listActivos(), listHistorialReciente()])
      .then(([a, h]) => {
        setActivos(a)
        setHistorial(h)
      })
      .catch((e) => notify(e.message, 'error'))
  }, [notify])

  const cuenta = (estado) => (activos || []).filter((a) => a.estado === estado).length
  const stats = [
    { label: 'Total de activos', valor: activos?.length, cls: '' },
    { label: 'Disponibles', valor: activos && cuenta('disponible'), cls: 'ok' },
    { label: 'Asignados', valor: activos && cuenta('asignado'), cls: 'info' },
    { label: 'En mantenimiento', valor: activos && cuenta('en_mantenimiento'), cls: 'warn' },
  ]

  return (
    <>
      <PageHeader titulo="Inicio" subtitulo="Estado del inventario en tiempo real" />

      <section className="stats">
        {stats.map((s) => (
          <div key={s.label} className={`card stat ${s.cls}`}>
            <span className="stat-num">{s.valor ?? '–'}</span>
            <span className="muted">{s.label}</span>
          </div>
        ))}
      </section>

      <section className="quick">
        <button className="card quick-item" onClick={() => ir('escanear')}>
          <IconScan /> <strong>Escanear un QR</strong>
          <span className="muted">Ver quién tiene el equipo</span>
        </button>
        <button className="card quick-item" onClick={() => ir('entrega')}>
          <IconSend /> <strong>Nueva entrega</strong>
          <span className="muted">Asignar y generar acta</span>
        </button>
        <button className="card quick-item" onClick={() => ir('devolucion')}>
          <IconReturn /> <strong>Registrar devolución</strong>
          <span className="muted">Validar contra el historial</span>
        </button>
      </section>

      <section className="card">
        <h2>Movimientos recientes</h2>
        {historial.length === 0 ? (
          <p className="muted">Aún no hay movimientos.</p>
        ) : (
          <ul className="list">
            {historial.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.activo?.nombre}</strong>
                  <div className="muted small">
                    {h.usuario_responsable} · {fechaCorta(h.fecha_asignacion)}
                  </div>
                </div>
                <span className={`badge ${h.estado_proceso === 'activa' ? 'info' : 'ok'}`}>
                  {h.estado_proceso === 'activa' ? 'En custodia' : 'Devuelto'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
