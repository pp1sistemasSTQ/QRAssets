import { supabase, BUCKET_ACTAS_RESPALDOS, BUCKET_FIRMAS } from './supabase'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

/* ---------- Activos ---------- */

export const listActivos = () =>
  supabase.from('activos').select('*').order('created_at', { ascending: false }).then(check)

export const createActivo = ({ nombre, categoria, numero_serial }) =>
  supabase
    .from('activos')
    .insert({ nombre, categoria, numero_serial: numero_serial.trim() || 'N/A' })
    .select()
    .single()
    .then(check)

export const updateActivoEstado = (id, estado) =>
  supabase.from('activos').update({ estado }).eq('id', id).select().single().then(check)

const ACTA_SELECT = `
  id, tipo, estado, persona_id, fecha_proceso, firma_url, acta_pdf_url, ciudad, observaciones,
  persona:personas(id, nombre_completo, documento_identidad, email, cargo, lugar_expedicion),
  detalles:acta_detalles(id, activo_id, estado_item, activo:activos(*))
`

const getActa = (id) =>
  supabase.from('actas').select(ACTA_SELECT).eq('id', id).single().then(check)

export async function getOrCreatePersona(persona) {
  const documento = persona.documento_identidad.trim()
  const existente = await supabase
    .from('personas')
    .select('*')
    .eq('documento_identidad', documento)
    .maybeSingle()
    .then(check)
  if (existente) {
    return supabase
      .from('personas')
      .update({
        nombre_completo: persona.nombre_completo.trim(),
        email: persona.email.trim(),
        cargo: persona.cargo.trim(),
        lugar_expedicion: persona.lugar_expedicion.trim().toUpperCase(),
      })
      .eq('id', existente.id)
      .select()
      .single()
      .then(check)
  }
  return supabase
    .from('personas')
    .insert({
      documento_identidad: documento,
      nombre_completo: persona.nombre_completo.trim(),
      email: persona.email.trim(),
      cargo: persona.cargo.trim(),
      lugar_expedicion: persona.lugar_expedicion.trim().toUpperCase(),
    })
    .select()
    .single()
    .then(check)
}

export const getActivoPorQr = async (codigo) => {
  const activo = await supabase
    .from('activos')
    .select('*')
    .eq('codigo_qr', codigo.trim())
    .maybeSingle()
    .then(check)
  if (!activo) return null
  const asignacion = (await listAsignacionesActivas()).find((fila) => fila.activo.id === activo.id) || null
  return { activo, asignacion }
}

/* ---------- Asignaciones ---------- */

export async function listAsignacionesActivas() {
  const [entregas, devoluciones] = await Promise.all([
    supabase.from('actas').select(ACTA_SELECT).eq('tipo', 'entrega').eq('estado', 'cerrada').then(check),
    supabase.from('actas').select(ACTA_SELECT).eq('tipo', 'devolucion').eq('estado', 'cerrada').then(check),
  ])
  const eventos = [
    ...entregas.map((acta) => ({ ...acta, movimiento: 'entrega' })),
    ...devoluciones.map((acta) => ({ ...acta, movimiento: 'devolucion' })),
  ].sort((a, b) => new Date(a.fecha_proceso) - new Date(b.fecha_proceso))
  const activosEnCustodia = new Map()

  eventos.forEach((acta) => {
    acta.detalles.forEach((detalle) => {
      const clave = `${acta.persona_id}:${detalle.activo_id}`
      if (acta.movimiento === 'entrega') {
        activosEnCustodia.set(clave, {
          id: detalle.id,
          acta_id: acta.id,
          persona_id: acta.persona_id,
          usuario_responsable: acta.persona?.nombre_completo || 'Persona sin nombre',
          documento_identidad: acta.persona?.documento_identidad || '',
          cargo: acta.persona?.cargo || '',
          lugar_expedicion: acta.persona?.lugar_expedicion || '',
          fecha_asignacion: acta.fecha_proceso,
          acta_url: acta.acta_pdf_url,
          activo: detalle.activo,
        })
      } else {
        activosEnCustodia.delete(clave)
      }
    })
  })

  return [...activosEnCustodia.values()].sort(
    (a, b) => new Date(b.fecha_asignacion) - new Date(a.fecha_asignacion),
  )
}

export async function listHistorialReciente(limit = 8) {
  const [actas, asignacionesActivas] = await Promise.all([
    supabase.from('actas').select(ACTA_SELECT).order('fecha_proceso', { ascending: false }).limit(limit).then(check),
    listAsignacionesActivas(),
  ])
  const detalleActivo = new Set(asignacionesActivas.map((fila) => fila.id))
  return actas.flatMap((acta) =>
    acta.detalles.map((detalle) => ({
      id: detalle.id,
      activo: detalle.activo,
      usuario_responsable: acta.persona?.nombre_completo || 'Persona sin nombre',
      fecha_asignacion: acta.fecha_proceso,
      estado_proceso: acta.tipo === 'entrega' && detalleActivo.has(detalle.id) ? 'activa' : 'cerrada',
    })),
  )
}

export async function registrarEntrega({ usuario, activoIds, ciudad, observaciones }) {
  const persona = await getOrCreatePersona(usuario)
  const actaId = await supabase.rpc('registrar_entrega', {
    p_persona_id: persona.id,
    p_activo_ids: activoIds,
    p_ciudad: ciudad.trim(),
    p_observaciones: observaciones.trim(),
  }).then(check)
  const acta = await getActa(actaId)
  return {
    actaId,
    usuario: acta.persona.nombre_completo,
    persona: acta.persona,
    documento_identidad: acta.persona.documento_identidad,
    cargo: acta.persona.cargo || '',
    ciudad: acta.ciudad,
    observaciones: acta.observaciones || '',
    fecha: acta.fecha_proceso,
    filas: acta.detalles,
  }
}

export async function registrarDevolucion({ personaId, activoIds, ciudad, observaciones }) {
  const actaId = await supabase.rpc('registrar_devolucion', {
    p_persona_id: personaId,
    p_activo_ids: activoIds,
    p_ciudad: ciudad.trim(),
    p_observaciones: observaciones.trim(),
  }).then(check)
  const acta = await getActa(actaId)
  return {
    actaId,
    fecha: acta.fecha_proceso,
    persona: acta.persona,
    usuario: acta.persona.nombre_completo,
    documento_identidad: acta.persona.documento_identidad,
    cargo: acta.persona.cargo || '',
    ciudad: acta.ciudad,
    observaciones: acta.observaciones || '',
    filas: acta.detalles,
  }
}

export const actualizarLugarExpedicion = (personaId, lugar) =>
  supabase
    .from('personas')
    .update({ lugar_expedicion: lugar.trim().toUpperCase() })
    .eq('id', personaId)
    .select('id')
    .single()
    .then(check)

async function subirArchivo({ archivo, actaId, bucket, columna }) {
  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'bin'
  const ruta = `${new Date().getFullYear()}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, {
    contentType: archivo.type,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(bucket).getPublicUrl(ruta)
  await supabase
    .from('actas')
    .update({ [columna]: data.publicUrl })
    .eq('id', actaId)
    .then(check)
  return data.publicUrl
}

export async function subirActaFirmada({ archivo, actaId }) {
  if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('El respaldo del acta debe ser un archivo PDF')
  }
  return subirArchivo({
    archivo,
    actaId,
    bucket: BUCKET_ACTAS_RESPALDOS,
    columna: 'acta_pdf_url',
  })
}

export async function subirFirma({ archivo, actaId }) {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('La firma debe ser una imagen')
  }
  return subirArchivo({ archivo, actaId, bucket: BUCKET_FIRMAS, columna: 'firma_url' })
}
