import { useEffect, useMemo, useRef, useState } from 'react'
import { listActasCerradas } from '../lib/api'
import { descargarActaWord, generarActaWord } from '../lib/docx'
import { PageHeader } from '../components/ui'
import { fechaCorta } from '../lib/format'
import { Modal } from '../components/ui'
import { renderAsync } from 'docx-preview'

const TIPO_ACTA = {
  entrega: 'Entrega',
  devolucion: 'Devolución',
}

export default function Actas({ notify }) {
  const [actas, setActas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [descargandoId, setDescargandoId] = useState(null)
  const [actaVistaPrevia, setActaVistaPrevia] = useState(null)
  const [cargandoVistaPrevia, setCargandoVistaPrevia] = useState(false)
  const [errorVistaPrevia, setErrorVistaPrevia] = useState(null)
  const vistaPreviaRef = useRef(null)

  function imprimirActa() {
    const vista = vistaPreviaRef.current?.querySelector('.docx-wrapper')
    const plantilla = vista?.querySelector('section.docx')
    if (!plantilla) return
    const esDevolucion = actaVistaPrevia.tipo === 'devolucion'

    const raizImpresion = document.createElement('div')
    raizImpresion.className = 'acta-print-root'
    document.body.append(raizImpresion)
    const contenedorImpresion = document.createElement('div')
    contenedorImpresion.className = 'docx-wrapper'
    raizImpresion.append(contenedorImpresion)
    const paginas = []

    const crearPagina = () => {
      const pagina = plantilla.cloneNode(true)
      const encabezado = pagina.querySelector(':scope > header')
      const cuerpo = pagina.querySelector(':scope > article')
      const pie = pagina.querySelector(':scope > footer')
      pagina.classList.add('acta-print-page')
      Object.assign(pagina.style, {
        boxSizing: 'border-box',
        display: 'block',
        position: 'relative',
        width: '792pt',
        height: '612pt',
        minHeight: '612pt',
        padding: '0',
        margin: '0',
        overflow: 'hidden',
        transform: 'none',
        lineHeight: 'normal',
      })
      Object.assign(encabezado.style, {
        position: 'absolute',
        top: '0',
        left: '70.9pt',
        width: '636.05pt',
        minHeight: '0',
        margin: '0',
      })
      encabezado.querySelectorAll('img').forEach((imagen) => {
        imagen.style.top = '11.34pt'
      })
      Object.assign(cuerpo.style, {
        position: 'absolute',
        top: esDevolucion ? '150pt' : '160pt',
        right: '85.05pt',
        bottom: esDevolucion ? '22pt' : '50pt',
        left: '70.9pt',
        width: 'auto',
        height: 'auto',
        minHeight: '0',
        margin: '0',
        overflow: 'hidden',
      })
      Object.assign(pie.style, {
        position: 'absolute',
        right: '85.05pt',
        bottom: '22pt',
        left: '70.9pt',
        width: 'auto',
        minHeight: '0',
        margin: '0',
      })
      cuerpo.replaceChildren()
      contenedorImpresion.append(pagina)
      const nuevaPagina = { pagina, cuerpo }
      paginas.push(nuevaPagina)
      return nuevaPagina
    }

    let paginaActual = crearPagina()
    let contenido = [...plantilla.querySelector(':scope > article').children].filter(
      (elemento) => !esDevolucion || elemento.textContent.trim() || elemento.tagName !== 'P',
    )
    if (esDevolucion) {
      const titulo = contenido.find((elemento) => elemento.textContent.trim() === 'DEVOLUCIÓN DE EQUIPOS')
      const tablaEmpleado = contenido.find((elemento) => elemento.matches('.docx_table1'))
      const tablaActivos = contenido.find((elemento) => elemento.matches('.docx_table2'))
      const textoRecepcion = contenido.find((elemento) =>
        elemento.textContent.trim().startsWith('En la fecha se reciben los elementos'),
      )
      const observaciones = contenido.find((elemento) =>
        elemento.textContent.trim().startsWith('OBSERVACIONES:'),
      )
      const declaracion = contenido.find((elemento) => elemento.textContent.trim().startsWith('Yo '))
      const tablaFirma = contenido.find((elemento) => elemento.matches('.docx_table3'))
      const etiquetaFirma = contenido.find(
        (elemento) => elemento.textContent.trim() === 'Firma del Empleado',
      )

      if (titulo && tablaEmpleado && tablaActivos && textoRecepcion && observaciones && declaracion && tablaFirma && etiquetaFirma) {
        Object.assign(titulo.style, { margin: '0 0 8pt' })
        Object.assign(tablaEmpleado.style, { float: 'none', margin: '0' })
        Object.assign(tablaActivos.style, { margin: '18pt 0 0' })
        Object.assign(textoRecepcion.style, { margin: '10pt 0 0' })
        Object.assign(observaciones.style, { margin: '28pt 0 0' })
        Object.assign(declaracion.style, { margin: '8pt 0 0' })
        Object.assign(tablaFirma.style, { margin: '32pt 0 0' })
        Object.assign(etiquetaFirma.style, { margin: '4pt 0 0' })
        contenido = [
          titulo,
          tablaEmpleado,
          tablaActivos,
          textoRecepcion,
          observaciones,
          declaracion,
          tablaFirma,
          etiquetaFirma,
        ]
      }
    }

    contenido.forEach((elemento) => {
      if (!esDevolucion && elemento.textContent.trim().startsWith('Yo ')) {
        paginaActual = crearPagina()
      }

      let copia = elemento.cloneNode(true)
      if (copia.matches('.docx_table1')) {
        copia.style.float = 'none'
        copia.style.margin = '0'
      }
      paginaActual.cuerpo.append(copia)
      if (paginaActual.cuerpo.scrollHeight > paginaActual.cuerpo.clientHeight && paginaActual.cuerpo.children.length > 1) {
        copia.remove()
        paginaActual = crearPagina()
        copia = elemento.cloneNode(true)
        paginaActual.cuerpo.append(copia)
      }
    })

    const ultimaPagina = paginas.at(-1)
    const articuloFinal = ultimaPagina?.cuerpo
    if (
      paginas.length > 1 &&
      articuloFinal.children.length === 1 &&
      articuloFinal.firstElementChild.textContent.trim() === 'Firma del Empleado'
    ) {
      const articuloAnterior = paginas.at(-2).cuerpo
      const hijosAnteriores = [...articuloAnterior.children]
      let inicioBloque = -1
      for (let index = hijosAnteriores.length - 1; index >= 0; index -= 1) {
        if (hijosAnteriores[index].textContent.trim()) {
          inicioBloque = index
          break
        }
      }
      if (inicioBloque >= 0) {
        const bloque = hijosAnteriores.slice(inicioBloque)
        const etiquetaFirma = articuloFinal.firstElementChild
        bloque.forEach((elemento) => elemento.remove())
        articuloFinal.prepend(...bloque)
        articuloFinal.append(etiquetaFirma)
      }
    }

    document.body.classList.add('printing-acta')
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('printing-acta')
        raizImpresion.remove()
      },
      { once: true },
    )
    window.print()
  }

  useEffect(() => {
    listActasCerradas()
      .then(setActas)
      .catch((err) => {
        setError(err.message)
        notify(err.message, 'error')
      })
      .finally(() => setCargando(false))
  }, [notify])

  const visibles = useMemo(() => {
    const query = busqueda.trim().toLowerCase()
    if (!query) return actas
    return actas.filter((acta) =>
      [
        TIPO_ACTA[acta.tipo],
        acta.persona?.nombre_completo,
        acta.persona?.documento_identidad,
        acta.persona?.email,
        acta.fecha_proceso,
        ...acta.detalles.map(({ activo }) =>
          [activo?.nombre, activo?.codigo_qr, activo?.numero_serial].filter(Boolean).join(' '),
        ),
      ].some((valor) => valor?.toLowerCase().includes(query)),
    )
  }, [actas, busqueda])

  useEffect(() => {
    if (!actaVistaPrevia || !vistaPreviaRef.current) return undefined
    let vigente = true
    const contenedor = vistaPreviaRef.current
    contenedor.replaceChildren()
    setCargandoVistaPrevia(true)
    setErrorVistaPrevia(null)

    let observador
    generarActaWord({
      tipo: actaVistaPrevia.tipo,
      persona: actaVistaPrevia.persona,
      ciudad: actaVistaPrevia.ciudad,
      observaciones: actaVistaPrevia.observaciones,
      items: actaVistaPrevia.detalles.map((detalle) => detalle.activo).filter(Boolean),
      fecha: actaVistaPrevia.fecha_proceso,
    })
      .then(async (documento) => {
        await renderAsync(documento, contenedor, contenedor, {
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
        })
        if (!vigente) return

        contenedor.querySelectorAll('section.docx > header').forEach((encabezado) => {
          encabezado.style.minHeight = '0'
          encabezado.querySelectorAll('img').forEach((imagen) => {
            imagen.style.height = '160pt'
            imagen.style.objectFit = 'cover'
            imagen.style.objectPosition = 'top'
          })
        })
        contenedor.querySelectorAll('section.docx article > table:last-of-type td').forEach((celda) => {
          celda.style.borderBottom = 'none'
        })

        const ajustarEscala = () => {
          const anchoDisponible = contenedor.clientWidth - 32
          const paginas = [...contenedor.querySelectorAll('section.docx')]

          paginas.forEach((pagina) => {
            pagina.style.transform = 'none'
            pagina.style.transformOrigin = 'top left'
            pagina.style.marginBottom = ''
          })

          paginas.forEach((pagina) => {
            const ancho = pagina.offsetWidth
            const alto = pagina.offsetHeight
            if (!ancho || !alto || !anchoDisponible) return

            const escala = Math.min(1, anchoDisponible / ancho)
            pagina.style.transform = `scale(${escala})`
            pagina.style.transformOrigin = 'top left'
            pagina.style.marginBottom = `${(alto + 30) * escala - alto}px`
          })
        }

        ajustarEscala()
        observador = new ResizeObserver(ajustarEscala)
        observador.observe(contenedor)
      })
      .catch((err) => {
        if (vigente) setErrorVistaPrevia(err.message)
      })
      .finally(() => {
        if (vigente) setCargandoVistaPrevia(false)
      })

    return () => {
      vigente = false
      observador?.disconnect()
      contenedor.replaceChildren()
    }
  }, [actaVistaPrevia])

  async function descargar(acta) {
    setDescargandoId(acta.id)
    try {
      await descargarActaWord({
        tipo: acta.tipo,
        persona: acta.persona,
        ciudad: acta.ciudad,
        observaciones: acta.observaciones,
        items: acta.detalles.map((detalle) => detalle.activo).filter(Boolean),
        fecha: acta.fecha_proceso,
      })
      notify('Formato del acta descargado')
    } catch (err) {
      notify(`No se pudo generar el formato: ${err.message}`, 'error')
    } finally {
      setDescargandoId(null)
    }
  }

  return (
    <>
      <PageHeader
        titulo="Actas"
        subtitulo={`${actas.length} actas finalizadas guardadas`}
      />

      <div className="toolbar">
        <input
          type="search"
          aria-label="Buscar actas"
          placeholder="Buscar por empleado, documento o equipo…"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
      </div>

      {cargando ? (
        <section className="card"><p className="muted">Cargando actas…</p></section>
      ) : error ? (
        <section className="card">
          <p className="error-text">No fue posible cargar las actas: {error}</p>
        </section>
      ) : visibles.length === 0 ? (
        <section className="card">
          <p className="muted">
            {actas.length === 0 ? 'Aún no hay actas finalizadas.' : 'No hay actas que coincidan con la búsqueda.'}
          </p>
        </section>
      ) : (
        <section className="acta-list" aria-label="Actas finalizadas">
          {visibles.map((acta) => (
            <article className="card acta-card" key={acta.id}>
              <div className="acta-info">
                <div>
                  <span className={`badge ${acta.tipo === 'entrega' ? 'info' : 'ok'}`}>
                    {TIPO_ACTA[acta.tipo] || acta.tipo}
                  </span>
                  <strong>{acta.persona?.nombre_completo || 'Persona sin nombre'}</strong>
                  <span className="muted small">
                    Documento: {acta.persona?.documento_identidad || 'N/A'} · {fechaCorta(acta.fecha_proceso)}
                  </span>
                  <span className="muted small">
                    {acta.detalles.length} {acta.detalles.length === 1 ? 'activo' : 'activos'}
                    {acta.detalles.length > 0 &&
                      ` · ${acta.detalles.map(({ activo }) => activo?.nombre || 'Activo').join(', ')}`}
                  </span>
                </div>
                <div className="acta-actions">
                  <button className="btn" onClick={() => setActaVistaPrevia(acta)}>
                    Previsualizar
                  </button>
                  {acta.acta_pdf_url && (
                    <a
                      className="btn"
                      href={acta.acta_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver PDF firmado
                    </a>
                  )}
                  <button
                    className="btn primary"
                    disabled={descargandoId === acta.id}
                    onClick={() => descargar(acta)}
                  >
                    {descargandoId === acta.id ? 'Generando…' : 'Descargar formato Word'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {actaVistaPrevia && (
        <Modal
          titulo={`Vista previa · Acta de ${TIPO_ACTA[actaVistaPrevia.tipo] || actaVistaPrevia.tipo}`}
          onClose={() => setActaVistaPrevia(null)}
          className="acta-preview-modal"
        >
          {cargandoVistaPrevia && <p className="muted">Preparando vista del formato oficial…</p>}
          {errorVistaPrevia && (
            <p className="error-text">No se pudo previsualizar el formato: {errorVistaPrevia}</p>
          )}
          <div
            ref={vistaPreviaRef}
            className="docx-preview-container"
            aria-label="Vista previa del formato Word"
          />
          <div className="acta-preview-actions">
            <button
              className="btn"
              disabled={cargandoVistaPrevia || !!errorVistaPrevia}
              onClick={imprimirActa}
            >
              Imprimir acta
            </button>
            {actaVistaPrevia.acta_pdf_url && (
              <a className="btn" href={actaVistaPrevia.acta_pdf_url} target="_blank" rel="noreferrer">
                Ver PDF firmado
              </a>
            )}
            <button
              className="btn primary"
              disabled={descargandoId === actaVistaPrevia.id}
              onClick={() => descargar(actaVistaPrevia)}
            >
              {descargandoId === actaVistaPrevia.id ? 'Generando…' : 'Descargar formato Word'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
