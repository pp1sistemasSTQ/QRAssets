import { useEffect, useMemo, useState } from 'react'
import { createActivo, listActivos, updateActivoEstado } from '../lib/api'
import { imprimirEtiqueta, qrDataUrl } from '../lib/print'
import { Modal, PageHeader } from '../components/ui'

const CATEGORIAS = [
  'Portátil',
  'Cargador',
  'Base refrigerante',
  'Mouse',
  'Teclado',
  'Micrófono',
  'Monitor',
  'Celular',
  'Otro',
]

export default function Activos({ notify }) {
  const [activos, setActivos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [form, setForm] = useState(null) // null = oculto
  const [etiqueta, setEtiqueta] = useState(null) // { activo, img }
  const [actualizandoId, setActualizandoId] = useState(null)

  const cargar = () =>
    listActivos()
      .then(setActivos)
      .catch((e) => notify(e.message, 'error'))
      .finally(() => setCargando(false))

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return activos.filter(
      (a) =>
        (filtro === 'todos' || a.estado === filtro) &&
        (!q ||
          a.nombre.toLowerCase().includes(q) ||
          a.codigo_qr.toLowerCase().includes(q) ||
          a.numero_serial.toLowerCase().includes(q)),
    )
  }, [activos, busqueda, filtro])

  async function guardar(e) {
    e.preventDefault()
    try {
      const creado = await createActivo({
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        numero_serial: form.numero_serial,
      })
      notify('Activo registrado')
      setForm(null)
      await cargar()
      verEtiqueta(creado)
    } catch (err) {
      notify(
        err.message.includes('duplicate') ? 'Ese código QR ya existe' : err.message,
        'error',
      )
    }
  }

  async function verEtiqueta(activo) {
    setEtiqueta({ activo, img: await qrDataUrl(activo.codigo_qr) })
  }

  async function cambiarEstado(activo, estado) {
    setActualizandoId(activo.id)
    try {
      const actualizado = await updateActivoEstado(activo.id, estado)
      setActivos((actuales) => actuales.map((item) => item.id === activo.id ? actualizado : item))
      notify('Estado actualizado')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setActualizandoId(null)
    }
  }

  return (
    <>
      <PageHeader titulo="Activos" subtitulo={`${activos.length} equipos registrados`}>
        <button
          className="btn primary"
          onClick={() => setForm({ nombre: '', categoria: 'Portátil', numero_serial: 'N/A' })}
        >
          + Nuevo activo
        </button>
      </PageHeader>

      {form && (
        <form className="card form-grid" onSubmit={guardar}>
          <label>
            Nombre del equipo
            <input
              required
              autoFocus
              placeholder="Ej. Dell Latitude 5440 – SN 8H2K"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </label>
          <label>
            Categoría
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Número serial
            <input
              required
              placeholder="Número serial o N/A"
              value={form.numero_serial}
              onChange={(e) => setForm({ ...form, numero_serial: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn primary">Registrar y generar etiqueta</button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre o código…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="disponible">Disponibles</option>
          <option value="asignado">Asignados</option>
          <option value="en_mantenimiento">En mantenimiento</option>
        </select>
      </div>

      <section className="card table-wrap">
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="muted">No hay activos que coincidan.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Activo</th>
                <th className="hide-sm">Categoría</th>
                <th className="hide-sm">Número serial</th>
                <th>Código</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.nombre}</strong></td>
                  <td className="hide-sm">{a.categoria}</td>
                  <td className="hide-sm"><code>{a.numero_serial || 'N/A'}</code></td>
                  <td><code>{a.codigo_qr}</code></td>
                  <td>
                    <select
                      aria-label={`Estado de ${a.nombre}`}
                      value={a.estado}
                      disabled={actualizandoId === a.id}
                      onChange={(e) => cambiarEstado(a, e.target.value)}
                    >
                      <option value="disponible">Disponible</option>
                      <option value="asignado">Asignado</option>
                      <option value="en_mantenimiento">En mantenimiento</option>
                    </select>
                  </td>
                  <td className="right">
                    <button className="btn small" onClick={() => verEtiqueta(a)}>
                      Etiqueta
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {etiqueta && (
        <Modal titulo="Etiqueta QR" onClose={() => setEtiqueta(null)}>
          <div className="label-preview">
            <img src={etiqueta.img} alt={`QR ${etiqueta.activo.codigo_qr}`} />
            <div>
              <strong>{etiqueta.activo.nombre}</strong>
              <div className="muted">{etiqueta.activo.categoria}</div>
              <code>{etiqueta.activo.codigo_qr}</code>
            </div>
          </div>
          <p className="muted small">Formato 50 × 30 mm, listo para impresora térmica o estándar.</p>
          <button className="btn primary block" onClick={() => imprimirEtiqueta(etiqueta.activo)}>
            Imprimir etiqueta
          </button>
        </Modal>
      )}
    </>
  )
}
