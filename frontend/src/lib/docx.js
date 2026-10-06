import PizZip from 'pizzip'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const TEMPLATE_FILES = {
  entrega: 'Formato Entrega Equipos STQ-FE-V002.docx',
  devolucion: 'Formato Devolucion Equipos STQ-FD-V002.docx',
}

const directChildren = (node, name) =>
  Array.from(node.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === name)

const textNodes = (node) => Array.from(node.getElementsByTagNameNS(WORD_NS, 't'))

function setText(nodes, value) {
  if (nodes.length === 0) return false
  nodes[0].textContent = value
  if (value.startsWith(' ') || value.endsWith(' ')) {
    nodes[0].setAttributeNS(XML_NS, 'xml:space', 'preserve')
  }
  nodes.slice(1).forEach((node) => { node.textContent = '' })
  return true
}

function setCellText(cell, value, documentXml) {
  if (setText(textNodes(cell), value)) return
  const paragraph = cell.getElementsByTagNameNS(WORD_NS, 'p')[0]
  if (!paragraph) throw new Error('El formato contiene una celda sin párrafo')
  const run = documentXml.createElementNS(WORD_NS, 'w:r')
  const text = documentXml.createElementNS(WORD_NS, 'w:t')
  text.textContent = value
  if (value.startsWith(' ') || value.endsWith(' ')) text.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  run.appendChild(text)
  paragraph.appendChild(run)
}

function setParagraphText(paragraph, value) {
  if (!setText(textNodes(paragraph), value)) throw new Error('El formato contiene un párrafo vacío inesperado')
}

function fechaActa(value) {
  const date = value ? new Date(value) : new Date()
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(date).replaceAll('/', '-')
}

function completarCabecera(table, data, documentXml) {
  const rows = directChildren(table, 'tr')
  const values = [data.ciudad, data.nombre, data.cargo, data.fecha]
  if (rows.length < values.length) throw new Error('No se reconoce la cabecera del formato Word')
  values.forEach((value, index) => {
    const cells = directChildren(rows[index], 'tc')
    if (cells.length < 2) throw new Error('No se reconoce un campo de la cabecera del formato Word')
    setCellText(cells[1], value || 'N/A', documentXml)
  })
}

function completarObservaciones(documentXml, tipo, observaciones, data) {
  const paragraphs = Array.from(documentXml.getElementsByTagNameNS(WORD_NS, 'p'))
  const observationParagraph = paragraphs.find((paragraph) =>
    textNodes(paragraph).map((node) => node.textContent).join('').startsWith('OBSERVACIONES:'),
  )
  if (observationParagraph) {
    setParagraphText(observationParagraph, `OBSERVACIONES: ${observaciones || 'Ninguna'}`)
  }

  const declaration = paragraphs.find((paragraph) => {
    const text = textNodes(paragraph).map((node) => node.textContent).join('')
    return text.startsWith('Yo ') && text.includes('identificado') && text.includes('C.C.')
  })
  if (!declaration) throw new Error('No se encontró la declaración de responsabilidad en el formato')

  const identity = data.documento_identidad || 'N/A'
  const lugarExpedicion = data.lugar_expedicion || 'N/A'
  if (tipo === 'entrega') {
    setParagraphText(
      declaration,
      `Yo ${data.nombre} identificado con C.C. ${identity} de ${lugarExpedicion}, declaro haber recibido los elementos según relación adjunta, en perfecto estado y entera satisfacción y me hago responsable de la pérdida o deterioro, salvo el que sea natural por uso normal. Además, me comprometo a utilizarlos únicamente en el desempeño de mis funciones como trabajador de STQ S.A.S.`,
    )
  } else {
    setParagraphText(
      declaration,
      `Yo ${data.nombre} identificado (a) con C.C. ${identity} de ${lugarExpedicion} declaro haber entregado los elementos según relación adjunta, para regresarlos al responsable técnico de TI, quien será responsable de dichos elementos a partir de su entrega.`,
    )
  }
}

function completarArticulos(table, items, tipo, date, documentXml) {
  const rows = directChildren(table, 'tr')
  if (rows.length < 2) throw new Error('No se encontró la fila de artículos del formato Word')
  const properties = directChildren(table, 'tblPr')[0]
  const positioning = properties && directChildren(properties, 'tblpPr')[0]
  if (positioning) properties.removeChild(positioning)

  const prototype = rows[1]
  const columns = directChildren(prototype, 'tc').length
  const expectedColumns = tipo === 'devolucion' ? 5 : 4
  if (columns !== expectedColumns) throw new Error('La tabla de artículos no coincide con el formato esperado')

  rows.slice(1).forEach((row) => table.removeChild(row))
  items.forEach((item) => {
    const row = prototype.cloneNode(true)
    const cells = directChildren(row, 'tc')
    const values = [date, item.categoria || 'Activo', item.nombre || 'N/A', item.numero_serial || 'N/A']
    if (tipo === 'devolucion') values.push('')
    values.forEach((value, index) => setCellText(cells[index], value, documentXml))
    table.appendChild(row)
  })
}

function compactarEspacioAntesDelDetalle(documentXml) {
  const paragraphs = Array.from(documentXml.getElementsByTagNameNS(WORD_NS, 'p'))
  const target = paragraphs.find((paragraph) =>
    textNodes(paragraph).map((node) => node.textContent).join('').startsWith('STQ S.A.S con NIT'),
  )
  if (!target) return

  const emptyParagraphs = []
  let previous = target.previousElementSibling
  while (
    previous?.namespaceURI === WORD_NS &&
    previous.localName === 'p' &&
    textNodes(previous).every((node) => !node.textContent.trim())
  ) {
    emptyParagraphs.push(previous)
    previous = previous.previousElementSibling
  }

  emptyParagraphs.slice(1).forEach((paragraph) => paragraph.parentNode.removeChild(paragraph))
}

const nombreArchivo = (value) => value
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

export async function generarActaWord({ tipo, persona, ciudad, observaciones, items, fecha }) {
  if (!TEMPLATE_FILES[tipo]) throw new Error('Tipo de acta no soportado')
  if (!items?.length) throw new Error('El acta debe incluir al menos un activo')
  if (!persona.lugar_expedicion?.trim()) {
    throw new Error('Completa el lugar de expedición del documento antes de generar el acta')
  }

  const response = await fetch(`/plantillas/${encodeURIComponent(TEMPLATE_FILES[tipo])}`)
  if (!response.ok) throw new Error('No se pudo cargar el formato Word')
  const zip = new PizZip(await response.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('El documento Word no contiene su archivo principal')

  const parser = new DOMParser()
  const documentXml = parser.parseFromString(entry.asText(), 'application/xml')
  if (documentXml.getElementsByTagName('parsererror').length) {
    throw new Error('No se pudo leer el contenido del formato Word')
  }

  const body = documentXml.getElementsByTagNameNS(WORD_NS, 'body')[0]
  const tables = directChildren(body, 'tbl')
  if (tables.length < 2) throw new Error('El formato Word no contiene las tablas esperadas')

  const date = fechaActa(fecha)
  const data = {
    nombre: persona.nombre_completo,
    documento_identidad: persona.documento_identidad,
    lugar_expedicion: (persona.lugar_expedicion || 'N/A').toUpperCase(),
    cargo: persona.cargo || 'N/A',
    ciudad: ciudad || 'MEDELLIN',
    fecha: date,
  }
  completarCabecera(tables[0], data, documentXml)
  completarArticulos(tables[1], items, tipo, date, documentXml)
  completarObservaciones(documentXml, tipo, observaciones, data)
  if (tipo === 'entrega') compactarEspacioAntesDelDetalle(documentXml)

  zip.file('word/document.xml', new XMLSerializer().serializeToString(documentXml))
  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}

export async function descargarActaWord(datos) {
  const { tipo, persona } = datos
  const blob = await generarActaWord(datos)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const tipoActa = tipo === 'entrega' ? 'Entrega' : 'Devolución'
  const codigoFormato = tipo === 'entrega' ? 'STQ-FE-V002' : 'STQ-FD-V002'
  const nombrePersona = nombreArchivo(persona.nombre_completo || 'Sin nombre')
  const documento = nombreArchivo(persona.documento_identidad || 'Sin documento')
  link.download = nombreArchivo(
    `Formato Acta de ${tipoActa} - ${nombrePersona} - ${documento} - ${codigoFormato}`,
  ) + '.docx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}