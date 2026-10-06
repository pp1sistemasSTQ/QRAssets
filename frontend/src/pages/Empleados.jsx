import { useEffect, useMemo, useState } from 'react'
import { listEmpleadosConAsignaciones } from '../lib/api'
import { PageHeader } from '../components/ui'

export default function Empleados({ notify }) {
  const [empleados, setEmpleados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    listEmpleadosConAsignaciones()
      .then(setEmpleados)
      .catch((error) => {
        setError(error.message)
        notify(error.message, 'error')
      })
      .finally(() => setCargando(false))
  }, [notify])

  const visibles = useMemo(() => {
    const query = busqueda.trim().toLowerCase()
    if (!query) return empleados

    return empleados.filter((empleado) =>
      [
        empleado.nombre_completo,
        empleado.documento_identidad,
        empleado.email,
        empleado.cargo,
        ...empleado.asignaciones.flatMap(({ activo }) => [
          activo?.nombre,
          activo?.categoria,
          activo?.numero_serial,
          activo?.codigo_qr,
        ]),
      ].some((valor) => valor?.toLowerCase().includes(query)),
    )
  }, [empleados, busqueda])

  const totalAsignados = empleados.reduce((total, empleado) => total + empleado.asignaciones.length, 0)

  return (
    <>
      <PageHeader
        titulo="Empleados"
        subtitulo={`${empleados.length} personas registradas · ${totalAsignados} activos en custodia`}
      />

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar empleado o activo…"
          aria-label="Buscar empleado o activo"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
      </div>

      {cargando ? (
        <section className="card"><p className="muted">Cargando empleados…</p></section>
      ) : error ? (
        <section className="card">
          <p className="error-text">No fue posible cargar los empleados: {error}</p>
        </section>
      ) : visibles.length === 0 ? (
        <section className="card">
          <p className="muted">
            {empleados.length === 0
              ? 'Aún no hay empleados registrados.'
              : 'No hay empleados que coincidan con la búsqueda.'}
          </p>
        </section>
      ) : (
        <section className="employee-list" aria-label="Empleados y activos asignados">
          {visibles.map((empleado) => (
            <article className="card employee-card" key={empleado.id}>
              <header className="employee-head">
                <div>
                  <h2>{empleado.nombre_completo}</h2>
                  <div className="muted small">
                    {empleado.cargo || 'Sin cargo registrado'}
                    {empleado.departamento ? ` · ${empleado.departamento}` : ''}
                    {empleado.documento_identidad ? ` · Documento: ${empleado.documento_identidad}` : ''}
                  </div>
                  {empleado.email && <div className="muted small">{empleado.email}</div>}
                </div>
                <span className="badge info">
                  {empleado.asignaciones.length}{' '}
                  {empleado.asignaciones.length === 1 ? 'activo' : 'activos'}
                </span>
              </header>

              {empleado.asignaciones.length === 0 ? (
                <p className="muted small employee-empty">No tiene activos asignados actualmente.</p>
              ) : (
                <ul className="employee-assets">
                  {empleado.asignaciones.map(({ id, activo, fecha_asignacion }) => (
                    <li key={id}>
                      <div>
                        <strong>{activo?.nombre || 'Activo sin nombre'}</strong>
                        <div className="muted small">
                          {activo?.categoria || 'Sin categoría'} · Serial:{' '}
                          {activo?.numero_serial || 'N/A'}
                        </div>
                      </div>
                      <div className="employee-asset-meta">
                        <code>{activo?.codigo_qr || 'Sin código'}</code>
                        <span className="muted small">
                          Desde {new Date(fecha_asignacion).toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  )
}
