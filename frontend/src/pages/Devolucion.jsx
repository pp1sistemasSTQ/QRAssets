import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  actualizarLugarExpedicion,
  buscarEmpleadoPorDocumento,
  listAsignacionesActivas,
  registrarDevolucion,
  subirActaFirmada,
  subirFirma,
} from '../lib/api'
import { descargarActaWord } from '../lib/docx'
import Scanner from '../components/Scanner'
import { PageHeader } from '../components/ui'

export default function Devolucion({ ir, notify, params }) {
  const [activas, setActivas] = useState(null)
  const [personaId, setPersonaId] = useState(params.personaId || '')
  const [documentoIdentidad, setDocumentoIdentidad] = useState('')
  const [buscandoEmpleado, setBuscandoEmpleado] = useState(false)
  const [documentoConsultado, setDocumentoConsultado] = useState('')
  const solicitudEmpleadoRef = useRef(0)
  const [lugarExpedicion, setLugarExpedicion] = useState('')
  const [ciudad, setCiudad] = useState('MEDELLIN')
  const [observaciones, setObservaciones] = useState('')
  const [recibidos, setRecibidos] = useState(() => new Set()) // ids de historial
  const [camara, setCamara] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cierre, setCierre] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [firmada, setFirmada] = useState(false)
  const [subiendoFirma, setSubiendoFirma] = useState(false)
  const [firmaGuardada, setFirmaGuardada] = useState(false)
  const [generandoActa, setGenerandoActa] = useState(false)
  const preQr = useRef(params.qr)

  useEffect(() => {
    listAsignacionesActivas()
      .then(setActivas)
      .catch((e) => notify(e.message, 'error'))
  }, [notify])

  // Personas con equipos en custodia
  const personas = useMemo(() => {
    const m = new Map()
    ;(activas || []).forEach((h) => {
      const persona = m.get(h.persona_id) || {
        nombre: h.usuario_responsable,
        lugarExpedicion: h.lugar_expedicion,
        documentoIdentidad: h.documento_identidad,
        cantidad: 0,
      }
      persona.cantidad += 1
      m.set(h.persona_id, persona)
    })
    return [...m.entries()]
  }, [activas])

  const usuario = personas.find(([id]) => id === personaId)?.[1]?.nombre || ''

  useEffect(() => {
    const persona = personas.find(([id]) => id === personaId)?.[1]
    if (persona) setDocumentoIdentidad(persona.documentoIdentidad || '')
  }, [personaId, personas])

  async function buscarEmpleado() {
    const documento = documentoIdentidad.trim()
    if (!documento || documento === documentoConsultado) return

    const solicitud = ++solicitudEmpleadoRef.current
    setBuscandoEmpleado(true)
    try {
      const empleado = await buscarEmpleadoPorDocumento(documento)
      if (solicitud !== solicitudEmpleadoRef.current) return
      setDocumentoConsultado(documento)
      if (!empleado) {
        notify('No se encontró ese documento en Odoo', 'warn')
        return
      }

      const coincidencia = personas.find(
        ([, persona]) => persona.documentoIdentidad?.trim() === empleado.documento_identidad?.trim(),
      )
      if (!coincidencia) {
        notify(`${empleado.nombre_completo} no tiene activos pendientes de devolución`, 'warn')
        return
      }

      setPersonaId(coincidencia[0])
      setDocumentoIdentidad(empleado.documento_identidad)
      notify(`Seleccionado: ${empleado.nombre_completo}`)
    } catch (error) {
      if (solicitud === solicitudEmpleadoRef.current) {
        notify(`No se pudo consultar Odoo: ${error.message}`, 'error')
      }
    } finally {
      if (solicitud === solicitudEmpleadoRef.current) setBuscandoEmpleado(false)
    }
  }

  useEffect(() => {
    const persona = personas.find(([id]) => id === personaId)?.[1]
    if (persona) setLugarExpedicion((persona.lugarExpedicion || '').toUpperCase())
  }, [personaId, personas])

  // Lo que fue entregado a la persona elegida (historial)
  const esperados = useMemo(
    () => (activas || []).filter((h) => h.persona_id === personaId),
    [activas, personaId],
  )
  const esperadosRef = useRef(esperados)
  esperadosRef.current = esperados

  // Si venimos de "Iniciar devolución" desde la ficha, marcamos ese equipo como recibido
  useEffect(() => {
    if (!preQr.current || esperados.length === 0) return
    const h = esperados.find((x) => x.activo.codigo_qr === preQr.current)
    if (h) setRecibidos(new Set([h.id]))
    preQr.current = null
  }, [esperados])

  const alternar = (id) =>
    setRecibidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const alEscanear = useCallback(
    (codigo) => {
      const h = esperadosRef.current.find((x) => x.activo.codigo_qr === codigo.trim())
      if (!h) return notify(`${codigo} no figura en la entrega de esta persona`, 'error')
      setRecibidos((s) => {
        if (s.has(h.id)) {
          notify(`${h.activo.nombre} ya estaba verificado`, 'warn')
          return s
        }
        notify(`Verificado: ${h.activo.nombre}`)
        return new Set(s).add(h.id)
      })
    },
    [notify],
  )

  const faltantes = esperados.filter((h) => !recibidos.has(h.id))
  const verificados = esperados.filter((h) => recibidos.has(h.id))

  async function confirmar() {
    if (
      faltantes.length > 0 &&
      !window.confirm(
        `Faltan ${faltantes.length} artículo(s) por recibir. Se cerrará la devolución solo con los verificados y los faltantes seguirán a nombre de ${usuario}. ¿Continuar?`,
      )
    )
      return
    setGuardando(true)
    try {
      await actualizarLugarExpedicion(personaId, lugarExpedicion)
      const actaDevolucion = await registrarDevolucion({
        personaId,
        activoIds: verificados.map((h) => h.activo.id),
        ciudad,
        observaciones,
      })
      setCierre({
        actaId: actaDevolucion.actaId,
        persona: actaDevolucion.persona,
        usuario,
        ciudad: actaDevolucion.ciudad,
        observaciones: actaDevolucion.observaciones,
        fecha: actaDevolucion.fecha,
        items: actaDevolucion.filas.map((fila) => fila.activo),
        faltantes: faltantes.map((h) => h.activo),
      })
      setCamara(false)
      notify('Devolución cerrada: los equipos vuelven a estar disponibles')
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
        tipo: 'devolucion',
        persona: cierre.persona,
        ciudad: cierre.ciudad,
        observaciones: cierre.observaciones,
        items: cierre.items,
        fecha: cierre.fecha,
      })
      notify('Formato de devolución descargado')
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
      await subirActaFirmada({ archivo, actaId: cierre.actaId })
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
      await subirFirma({ archivo, actaId: cierre.actaId })
      setFirmaGuardada(true)
      notify('Firma guardada en Supabase Storage')
    } catch (err) {
      notify(`No se pudo subir la firma: ${err.message}`, 'error')
    } finally {
      setSubiendoFirma(false)
      e.target.value = ''
    }
  }

  /* ---------- Cierre ---------- */
  if (cierre) {
    return (
      <>
        <PageHeader titulo="Devolución cerrada" subtitulo={`${cierre.items.length} activo(s) de ${cierre.usuario} vuelven a estar disponibles`} />
        <section className="card">
          <ol className="steps">
            <li className="done">Inventario actualizado: equipos en estado “Disponible”</li>
            <li className={firmada ? 'done' : ''}>
                Descargar el formato de devolución para firmarlo
              <div className="row">
                <button className="btn primary" disabled={generandoActa} onClick={descargarActa}>
                  {generandoActa ? 'Generando…' : 'Descargar formato de devolución'}
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
          {cierre.faltantes.length > 0 && (
            <p className="alert warn">
              Quedan {cierre.faltantes.length} artículo(s) pendientes a nombre de {cierre.usuario}.
            </p>
          )}
          <div className="form-actions">
            <button className="btn primary" onClick={() => ir('inicio')}>Ir al inicio</button>
          </div>
        </section>
      </>
    )
  }

  /* ---------- Validación ---------- */
  return (
    <>
      <PageHeader titulo="Devolución" subtitulo="Lo esperado y lo recibido se cruzan antes de generar el acta" />

      <section className="card">
        <label>
          Documento de identidad
          <input
            value={documentoIdentidad}
            onChange={(event) => {
              solicitudEmpleadoRef.current += 1
              setBuscandoEmpleado(false)
              setDocumentoIdentidad(event.target.value)
              setDocumentoConsultado('')
            }}
            onBlur={buscarEmpleado}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                buscarEmpleado()
              }
            }}
            placeholder="Escribe la cédula y sal del campo para buscar"
          />
          {buscandoEmpleado && <span className="muted small">Buscando empleado en Odoo…</span>}
        </label>
        <label>
          ¿Quién devuelve?
          <select
            value={personaId}
            onChange={(e) => {
              setPersonaId(e.target.value)
              setDocumentoConsultado('')
              setLugarExpedicion('')
              setRecibidos(new Set())
            }}
          >
            <option value="">Selecciona una persona…</option>
            {personas.map(([id, persona]) => (
              <option key={id} value={id}>{persona.nombre} · {persona.cantidad} equipo(s)</option>
            ))}
          </select>
        </label>
        {activas && personas.length === 0 && <p className="muted">Nadie tiene equipos en custodia.</p>}
      </section>

      {personaId && (
        <>
          <section className="card form-grid">
            <label>
              Lugar de expedición del documento
              <input
                required
                autoCapitalize="characters"
                value={lugarExpedicion}
                onChange={(e) => setLugarExpedicion(e.target.value.toUpperCase())}
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
              <h2>Verificación <span className="count">{verificados.length}/{esperados.length}</span></h2>
              <button className="btn" onClick={() => setCamara((c) => !c)}>
                {camara ? 'Cerrar cámara' : 'Escanear con cámara'}
              </button>
            </div>
            <Scanner activo={camara} onScan={alEscanear} />

            <div className="compare">
              <div>
                <h3>Entregado</h3>
                <ul className="list">
                  {esperados.map((h) => (
                    <li key={h.id}>
                      <div>
                        <strong>{h.activo.nombre}</strong>
                        <div className="muted small">{h.activo.codigo_qr}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Recibido</h3>
                <ul className="list selectable">
                  {esperados.map((h) => {
                    const ok = recibidos.has(h.id)
                    return (
                      <li key={h.id} className={ok ? 'selected' : 'pending'} onClick={() => alternar(h.id)}>
                        <input type="checkbox" readOnly checked={ok} />
                        <span>{ok ? 'Verificado' : 'Pendiente'}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
            <p className="muted small">Escanea cada artículo o márcalo a mano si el QR no se puede leer.</p>
          </section>

          <div className="sticky-bar">
            <span className="muted">
              {verificados.length} de {esperados.length} verificados
              {faltantes.length > 0 && ` · faltan ${faltantes.length}`}
            </span>
            <button
              className="btn primary"
              disabled={verificados.length === 0 || !lugarExpedicion.trim() || guardando}
              onClick={confirmar}
            >
              {guardando ? 'Cerrando…' : 'Confirmar devolución'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
