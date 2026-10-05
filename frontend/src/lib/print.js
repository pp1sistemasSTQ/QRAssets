import QRCode from 'qrcode'

export const qrDataUrl = (texto, size = 320) =>
  QRCode.toDataURL(texto, { width: size, margin: 1, errorCorrectionLevel: 'M' })

const esc = (s = '') =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
    : '—'

function imprimirHtml(titulo, cuerpo, css = '') {
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) {
    alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.')
    return
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0;padding:32px}
  ${css}
  @media print{body{padding:0}}
</style></head><body>${cuerpo}
<script>window.onload=()=>{setTimeout(()=>{window.print()},250)}<${'/'}script></body></html>`)
  w.document.close()
}

/** Etiqueta 50x30 mm pensada para térmica; en impresora estándar sale igual en una hoja. */
export async function imprimirEtiqueta(activo) {
  const img = await qrDataUrl(activo.codigo_qr, 400)
  imprimirHtml(
    `Etiqueta ${activo.codigo_qr}`,
    `<div class="et"><img src="${img}" alt=""/><div><b>${esc(activo.nombre)}</b><span>${esc(
      activo.categoria,
    )}</span><code>${esc(activo.codigo_qr)}</code></div></div>`,
    `@page{size:50mm 30mm;margin:0}
     body{padding:0}
     .et{width:50mm;height:30mm;display:flex;align-items:center;gap:2mm;padding:2mm;overflow:hidden}
     .et img{width:24mm;height:24mm}
     .et div{display:flex;flex-direction:column;gap:1mm;font-size:8pt;line-height:1.15;min-width:0}
     .et span{font-size:6.5pt;color:#444} .et code{font-size:6pt;word-break:break-all}`,
  )
}

/** Acta de entrega o devolución. tipo: 'entrega' | 'devolucion' */
export function imprimirActa({ tipo, usuario, items, fecha, faltantes = [] }) {
  const titulo = tipo === 'entrega' ? 'ACTA DE ENTREGA DE EQUIPOS' : 'ACTA DE DEVOLUCIÓN DE EQUIPOS'
  const filas = items
    .map(
      (a, i) =>
        `<tr><td>${i + 1}</td><td>${esc(a.nombre)}</td><td>${esc(a.categoria)}</td><td>${esc(
          a.numero_serial || 'N/A',
        )}</td><td>${esc(a.codigo_qr)}</td></tr>`,
    )
    .join('')
  const falt = faltantes.length
    ? `<h3>Artículos NO devueltos</h3><ul>${faltantes
        .map((a) => `<li>${esc(a.nombre)} — ${esc(a.codigo_qr)}</li>`)
        .join('')}</ul>`
    : ''
  const verbo = tipo === 'entrega' ? 'recibe' : 'devuelve'
  imprimirHtml(
    titulo,
    `<h1>${titulo}</h1>
     <p class="meta">Fecha: <b>${fmt(fecha)}</b><br/>Responsable: <b>${esc(usuario)}</b></p>
     <p>Quien suscribe ${verbo} los siguientes activos tecnológicos:</p>
    <table><thead><tr><th>#</th><th>Activo</th><th>Categoría</th><th>Número serial</th><th>Código QR</th></tr></thead><tbody>${filas}</tbody></table>
     ${falt}
     <div class="firmas"><div><hr/>Firma de quien ${verbo}<br/><small>${esc(usuario)}</small></div>
     <div><hr/>Firma de quien ${tipo === 'entrega' ? 'entrega' : 'recibe'}<br/><small>Área de sistemas</small></div></div>`,
    `h1{font-size:18pt;margin:0 0 16px} h3{margin-top:24px}
     .meta{line-height:1.7;margin-bottom:24px}
     table{width:100%;border-collapse:collapse;margin-top:12px}
     th,td{border:1px solid #999;padding:8px 10px;text-align:left;font-size:10.5pt}
     th{background:#f0f0f0}
     .firmas{display:flex;gap:48px;margin-top:96px}
     .firmas div{flex:1;text-align:center;font-size:10.5pt} hr{border:0;border-top:1px solid #111;margin-bottom:6px}`,
  )
}
