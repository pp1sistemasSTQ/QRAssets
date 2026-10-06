import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscarEmpleadoPorDocumento,
  getActivoPorQr,
  listActivos,
  registrarEntrega,
  subirActaFirmada,
  subirFirma,
} from '../lib/api'
import { descargarActaWord } from '../lib/docx'
import Scanner from '../components/Scanner'
import { PageHeader } from '../components/ui'

export default function Entrega({ ir, notify }) {
  const [disponibles, setDisponibles] = useState([])
  const [seleccion, setSeleccion] = useState([]) // activos
  const [usuario, setUsuario] = useState({
    documento_identidad: '',
    nombre_completo: '',
    email: '',
    cargo: '',
    lugar_expedicion: '',
  })
  const [ciudad, setCiudad] = useState('MEDELLIN')
  const [observaciones, setObservaciones] = useState('')
  const [camara, setCamara] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState(null) // { filas, usuario, fecha }
  const [subiendo, setSubiendo] = useState(false)
  const [firmada, setFirmada] = useState(false)
  const [subiendoFirma, setSubiendoFirma] = useState(false)
  const [firmaGuardada, setFirmaGuardada] = useState(false)
  const [generandoActa, setGenerandoActa] = useState(false)
  const [buscandoEmpleado, setBuscandoEmpleado] = useState(false)
  const [documentoConsultado, setDocumentoConsultado] = useState('')
  const solicitudEmpleadoRef = useRef(0)
  const seleccionRef = useRef([])
  seleccionRef.current = seleccion

  useEffect(() => {
    listActivos()
      .then((a) => setDisponibles(a.filter((x) => x.estado === 'disponible')))
      .catch((e) => notify(e.message, 'error'))
  }, [notify])

  const alternar = (a) =>
    setSeleccion((s) => (s.some((x) => x.id === a.id) ? s.filter((x) => x.id !== a.id) : [...s, a]))

  async function buscarEmpleado() {
    const documento = usuario.documento_identidad.trim()
    if (!documento || documento === documentoConsultado) return

    const solicitud = ++solicitudEmpleadoRef.current
    setBuscandoEmpleado(true)
    try {
      const empleado = await buscarEmpleadoPorDocumento(documento)
      if (solicitud !== solicitudEmpleadoRef.current) return
      setDocumentoConsultado(documento)
      if (!empleado) {
        notify('No se encontró ese documento en Odoo; puedes completar los datos manualmente', 'warn')
        return
      }
      setUsuario((actual) => ({
        ...actual,
        nombre_completo: empleado.nombre_completo,
        email: empleado.email,
        cargo: empleado.cargo,
      }))
      notify(`Datos encontrados para ${empleado.nombre_completo}`)
    } catch (error) {
      if (solicitud === solicitudEmpleadoRef.current) {
        notify(`No se pudo consultar Odoo: ${error.message}`, 'error')
      }
    } finally {
      if (solicitud === solicitudEmpleadoRef.current) setBuscandoEmpleado(false)
    }
  }

  const alEscanear = useCallback(
    async (codigo) => {
      try {
        const r = await getActivoPorQr(codigo)
        if (!r) return notify(`El código ${codigo} no está registrado`, 'error')
        if (r.activo.estado !== 'disponible')
          return notify(`${r.activo.nombre} no está disponible (${r.activo.estado})`, 'error')
        if (seleccionRef.current.some((x) => x.id === r.activo.id))
          return notify(`${r.activo.nombre} ya está en la lista`, 'warn')
        setSeleccion((s) => [...s, r.activo])
        notify(`Agregado: ${r.activo.nombre}`)
      } catch (e) {
        notify(e.message, 'error')
      }
    },
    [notify],
  )

  async function confirmar() {
    setGuardando(true)
    try {
      const entrega = await registrarEntrega({
        usuario,
        activoIds: seleccion.map((a) => a.id),
        ciudad,
        observaciones,
      })
      setResultado(entrega)
      setCamara(false)
      notify('Entrega registrada')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function descargarActa() {
    setGenerandoActa(true)
    try {
      await descargarActaWord({
        tipo: 'entrega',
        persona: resultado.persona,
        ciudad: resultado.ciudad,
        observaciones: resultado.observaciones,
        items: resultado.filas.map((fila) => fila.activo),
        fecha: resultado.fecha,
      })
      notify('Formato de entrega descargado')
    } catch (error) {
      notify(`No se pudo generar el formato: ${error.message}`, 'error')
    } finally {
      setGenerandoActa(false)
    }
  }

  async function subir(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendo(true)
    try {
      await subirActaFirmada({ archivo, actaId: resultado.actaId })
      setFirmada(true)
      notify('Acta firmada guardada como respaldo')
    } catch (err) {
      notify(`No se pudo subir: ${err.message}`, 'error')
    } finally {
      setSubiendo(false)
    }
  }

  async function subirImagenFirma(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendoFirma(true)
    try {
      await subirFirma({ archivo, actaId: resultado.actaId })
      setFirmaGuardada(true)
      notify('Firma guardada en Supabase Storage')
    } catch (err) {
      notify(`No se pudo subir la firma: ${err.message}`, 'error')
    } finally {
      setSubiendoFirma(false)
      e.target.value = ''
    }
  }

  /* ---------- Paso final: acta ---------- */
  if (resultado) {
    const items = resultado.filas.map((f) => f.activo)
    return (
      <>
        <PageHeader titulo="Entrega registrada" subtitulo={`${items.length} activo(s) para ${resultado.usuario}`} />
        <section className="card">
          <ol className="steps">
            <li className="done">Equipos asignados a {resultado.usuario}</li>
            <li className={firmada ? 'done' : ''}>
              Imprimir el acta y recoger la firma
              <div className="row">
                <button className="btn primary" disabled={generandoActa} onClick={descargarActa}>
                  {generandoActa ? 'Generando…' : 'Descargar formato de entrega'}
                </button>
              </div>
            </li>
            <li className={firmaGuardada ? 'done' : ''}>
              Guardar la imagen de la firma
              <div className="row">
                {firmaGuardada ? (
                  <span className="badge ok">Firma guardada</span>
                ) : (
                  <label className={`btn ${subiendoFirma ? 'disabled' : ''}`}>
                    {subiendoFirma ? 'Subiendo…' : 'Adjuntar firma'}
                    <input type="file" accept="image/*" hidden onChange={subirImagenFirma} disabled={subiendoFirma} />
                  </label>
                )}
              </div>
            </li>
            <li className={firmada ? 'done' : ''}>
              Guardar el acta firmada en PDF
              <div className="row">
                {firmada ? (
                  <span className="badge ok">Respaldo guardado</span>
                ) : (
                  <label className={`btn ${subiendo ? 'disabled' : ''}`}>
                    {subiendo ? 'Subiendo…' : 'Adjuntar PDF firmado'}
                    <input type="file" accept="application/pdf,.pdf" hidden onChange={subir} disabled={subiendo} />
                  </label>
                )}
              </div>
            </li>
          </ol>
          <div className="form-actions">
            <button className="btn" onClick={() => ir('inicio')}>Ir al inicio</button>
            <button className="btn primary" onClick={() => ir('entrega', { r: Date.now() })}>
              Nueva entrega
            </button>
          </div>
        </section>
      </>
    )
  }

  /* ---------- Formulario ---------- */
  return (
    <>
      <PageHeader titulo="Nueva entrega" subtitulo="Escanea o elige los equipos y vincúlalos a una persona" />

      <section className="card">
        <label>
          Documento de identidad
          <input
            required
            value={usuario.documento_identidad}
            onBlur={buscarEmpleado}
            onChange={(e) => {
              const documento = e.target.value
              solicitudEmpleadoRef.current += 1
              setBuscandoEmpleado(false)
              if (documento.trim() !== documentoConsultado) {
                setDocumentoConsultado('')
                setUsuario((actual) => ({
                  ...actual,
                  documento_identidad: documento,
                  nombre_completo: '',
                  email: '',
                  cargo: '',
                }))
              } else {
                setUsuario((actual) => ({ ...actual, documento_identidad: documento }))
              }
            }}
          />
          {buscandoEmpleado && <span className="muted small">Buscando empleado en Odoo…</span>}
        </label>
        <label>
          Lugar de expedición del documento
          <input
            required
            autoCapitalize="characters"
            value={usuario.lugar_expedicion}
            onChange={(e) => setUsuario((p) => ({
              ...p,
              lugar_expedicion: e.target.value.toUpperCase(),
            }))}
          />
        </label>
        <label>
          Persona que recibe
          <input
            required
            placeholder="Nombre completo"
            value={usuario.nombre_completo}
            onChange={(e) => setUsuario((p) => ({ ...p, nombre_completo: e.target.value }))}
          />
        </label>
        <label>
          Cargo
          <input
            required
            value={usuario.cargo}
            onChange={(e) => setUsuario((p) => ({ ...p, cargo: e.target.value }))}
          />
        </label>
        <label>
          Correo electrónico
          <input
            required
            type="email"
            value={usuario.email}
            onChange={(e) => setUsuario((p) => ({ ...p, email: e.target.value }))}
          />
        </label>
        <label>
          Ciudad
          <input required value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
        </label>
        <label>
          Observaciones del acta
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} />
        </label>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Equipos a entregar <span className="count">{seleccion.length}</span></h2>
          <button className="btn" onClick={() => setCamara((c) => !c)}>
            {camara ? 'Cerrar cámara' : 'Escanear con cámara'}
          </button>
        </div>
        <Scanner activo={camara} onScan={alEscanear} />

        {seleccion.length > 0 && (
          <ul className="chips">
            {seleccion.map((a) => (
              <li key={a.id} className="chip">
                {a.nombre}
                <button onClick={() => alternar(a)} aria-label={`Quitar ${a.nombre}`}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <h3>Disponibles</h3>
        {disponibles.length === 0 ? (
          <p className="muted">No hay activos disponibles.</p>
        ) : (
          <ul className="list selectable">
            {disponibles.map((a) => {
              const sel = seleccion.some((x) => x.id === a.id)
              return (
                <li key={a.id} className={sel ? 'selected' : ''} onClick={() => alternar(a)}>
                  <input type="checkbox" readOnly checked={sel} />
                  <div>
                    <strong>{a.nombre}</strong>
                    <div className="muted small">{a.categoria} · {a.codigo_qr}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="sticky-bar">
        <span className="muted">
          {seleccion.length} equipo(s){usuario.nombre_completo.trim() ? ` → ${usuario.nombre_completo.trim()}` : ''}
        </span>
        <button
          className="btn primary"
          disabled={
            !usuario.documento_identidad.trim() ||
            !usuario.lugar_expedicion.trim() ||
            !usuario.nombre_completo.trim() ||
            !usuario.cargo.trim() ||
            !usuario.email.trim() ||
            !ciudad.trim() ||
            seleccion.length === 0 ||
            guardando
          }
          onClick={confirmar}
        >
          {guardando ? 'Guardando…' : 'Registrar entrega'}
        </button>
      </div>
    </>
  )
}
