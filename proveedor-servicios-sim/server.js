'use strict';
/**
 * PROVEEDOR DE SERVICIOS (SIMULADO) — API externa a la que CP BancaVirtual le pide cobrar luz, agua, teléfono, etc.
 * Sin dependencias: solo Node.js. Contrato completo en ../docs/API-SERVICIOS-EXTERNA.md
 *
 *   GET  /health            sin llave
 *   GET  /servicios         catálogo de servicios que se pueden pagar
 *   POST /consultas         monto adeudado de un contrato
 *   POST /pagos             ejecuta el pago (idempotente por Idempotency-Key / referencia_banco)
 *   POST /pagos/reversa     anula un pago (idempotente)
 *   GET  /pagos             últimos pagos que recibió este proveedor (para comprobar la integración)
 *   GET  /panel             página web para ver esos pagos (pide la llave; no se guarda)
 *
 * Formatos: JSON (Content-Type: application/json) o XML (application/xml). La respuesta usa el mismo formato que el
 * pedido (o el que indique la cabecera Accept).
 *
 * Variables: PORT (4000), SIM_API_KEY (si se define, se exige Authorization: Bearer <llave> o X-Api-Key).
 *
 * Reglas de la simulación (sirven para demostrar errores):
 *   - contrato debe tener al menos 4 dígitos                → 422 "Contrato inválido"
 *   - contrato que termina en 000                            → 422 "Contrato no encontrado"
 *   - contrato que termina en 999                            → 503 (proveedor caído: el banco debe reversar y devolver el dinero)
 *   - monto <= 0 o > 50,000                                  → 422
 */
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4000);
const API_KEY = (process.env.SIM_API_KEY || '').trim();

const CATALOGO = [
  { codigo: 'LUZ_EEGSA', nombre: 'Energía eléctrica (EEGSA)', categoria: 'Energía', referencia_etiqueta: 'Número de contador (NIS)' },
  { codigo: 'LUZ_ENERGUATE', nombre: 'Energía eléctrica (Energuate)', categoria: 'Energía', referencia_etiqueta: 'Número de contador (NIS)' },
  { codigo: 'AGUA_EMPAGUA', nombre: 'Agua potable (EMPAGUA)', categoria: 'Agua', referencia_etiqueta: 'Número de servicio' },
  { codigo: 'TEL_TIGO', nombre: 'Telefonía móvil (Tigo)', categoria: 'Telefonía', referencia_etiqueta: 'Número de teléfono' },
  { codigo: 'TEL_CLARO', nombre: 'Telefonía móvil (Claro)', categoria: 'Telefonía', referencia_etiqueta: 'Número de teléfono' },
  { codigo: 'NET_CABLE', nombre: 'Internet y cable', categoria: 'Internet', referencia_etiqueta: 'Número de contrato' },
  { codigo: 'MUNI', nombre: 'Impuestos municipales', categoria: 'Gobierno', referencia_etiqueta: 'Número de boleta' },
];
const TITULARES = ['JUAN PEREZ', 'MARIA LOPEZ', 'CARLOS RAMIREZ', 'ANA GARCIA', 'LUIS MORALES', 'SOFIA HERNANDEZ', 'PEDRO CASTILLO', 'LUCIA MENDEZ'];

/** Libro de pagos de ESTE proveedor (en memoria: se pierde si el servicio se reinicia). referencia_banco -> pago */
const pagos = new Map();

// ------------------------------------------------------------------ utilidades de formato

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const unesc = (v) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

/** Objeto plano -> <raiz><campo>valor</campo>…</raiz> */
function xmlObj(raiz, o) {
  return `<${raiz}>` + Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('') + `</${raiz}>`;
}
/** Valor de <nombre>…</nombre> en un XML plano */
function xmlTag(xml, nombre) {
  const m = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, 'i').exec(xml);
  return m ? unesc(m[1].trim()) : undefined;
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 100_000) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); }
    });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

const esXml = (req) => /xml/i.test(req.headers['content-type'] || '');
const quiereXml = (req) => esXml(req) || /xml/i.test(req.headers['accept'] || '') && !/json/i.test(req.headers['accept'] || '');

function responder(req, res, status, json, xml) {
  if (quiereXml(req)) {
    res.writeHead(status, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(XML_HEAD + xml);
  } else {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(json));
  }
}
const error = (req, res, status, mensaje) => responder(req, res, status, { message: mensaje }, xmlObj('error', { mensaje }));

// ------------------------------------------------------------------ reglas de negocio simuladas

const digitos = (c) => String(c || '').replace(/\D/g, '');
function validarContrato(contrato) {
  const d = digitos(contrato);
  if (d.length < 4) return { status: 422, mensaje: 'Contrato inválido: debe tener al menos 4 dígitos' };
  if (d.endsWith('000')) return { status: 422, mensaje: 'Contrato no encontrado' };
  if (d.endsWith('999')) return { status: 503, mensaje: 'Proveedor no disponible (falla simulada)' };
  return null;
}
function deuda(contrato) {
  const n = Number(digitos(contrato).slice(-6)) || 1;
  return { titular: TITULARES[n % TITULARES.length], monto_adeudado: Number((50 + ((n * 7919) % 45_000) / 100).toFixed(2)), detalle: 'Factura del mes en curso' };
}
const pausa = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 280)); // latencia de red simulada

// ------------------------------------------------------------------ servidor

const PANEL = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proveedor de Servicios · Panel</title>
<style>body{font:15px system-ui,sans-serif;margin:0;background:#0b1020;color:#e8ecf8}main{max-width:900px;margin:0 auto;padding:24px 16px}
h1{font-size:1.3rem;margin:0 0 4px}p{color:#9aa6c8;margin:4px 0 16px}input,button{font:inherit;padding:9px 12px;border-radius:8px;border:1px solid #2a3558;background:#121a33;color:inherit}
button{background:#4f86ff;border-color:#4f86ff;cursor:pointer}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #1f2a4d;font-size:14px}
th{color:#9aa6c8;font-weight:600}.ok{color:#3ddc97}.rev{color:#f87171}.err{color:#f87171;margin-top:12px}</style></head><body><main>
<h1>Proveedor de Servicios (simulado)</h1><p>Pagos que este proveedor recibió de CP BancaVirtual. Escribe la llave de API para verlos; no se guarda.</p>
<form id="f"><input id="k" type="password" placeholder="Llave de API" autocomplete="off" size="32"> <button>Ver pagos</button></form>
<div id="e" class="err"></div><table id="t" hidden><thead><tr><th>Fecha</th><th>Servicio</th><th>Contrato</th><th>Monto</th><th>Estado</th><th>Autorización</th><th>Ref. banco</th></tr></thead><tbody></tbody></table>
<script>
const $=(i)=>document.getElementById(i);let llave='',timer;
async function cargar(){try{const r=await fetch('/pagos',{headers:{Authorization:'Bearer '+llave,Accept:'application/json'}});
if(!r.ok){$('e').textContent=r.status===401?'Llave inválida':'Error '+r.status;$('t').hidden=true;clearInterval(timer);return}
$('e').textContent='';const d=await r.json();const tb=$('t').querySelector('tbody');tb.innerHTML='';
if(!d.length){$('e').textContent='Aún no hay pagos (la lista se borra cuando el servicio se reinicia o duerme).'}
for(const p of d){const tr=document.createElement('tr');
const c=[new Date(p.fecha).toLocaleString('es-GT'),p.servicio,p.contrato,'Q'+p.monto,p.estado,p.autorizacion,p.referencia_banco];
c.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===4)td.className=v==='APROBADO'?'ok':'rev';tr.appendChild(td)});tb.appendChild(tr)}
$('t').hidden=false}catch(e){$('e').textContent='No se pudo consultar'}}
$('f').addEventListener('submit',(e)=>{e.preventDefault();llave=$('k').value.trim();clearInterval(timer);cargar();timer=setInterval(cargar,5000)});
</script></main></body></html>`;

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (req.url !== '/health') console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - inicio} ms) ${esXml(req) ? 'XML' : 'JSON'}`);
  });
  try {
    const url = new URL(req.url, 'http://x');
    const ruta = url.pathname.replace(/^\/api\/v\d+/, '').replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && ruta === '/panel') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PANEL);
    }

    if (req.method === 'GET' && (ruta === '/health' || ruta === '/')) {
      return responder(req, res, 200, { ok: true, servicio: 'proveedor-servicios-sim', formatos: ['json', 'xml'] }, xmlObj('estado', { ok: 'true', servicio: 'proveedor-servicios-sim', formatos: 'json,xml' }));
    }

    if (API_KEY) {
      const bearer = /^Bearer\s+(.+)$/i.exec(req.headers['authorization'] || '')?.[1];
      const llave = bearer || req.headers['x-api-key'];
      const a = Buffer.from(String(llave || '')), b = Buffer.from(API_KEY);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return error(req, res, 401, 'Llave de API inválida');
    }
    await pausa();

    if (req.method === 'GET' && ruta === '/servicios') {
      return responder(req, res, 200, CATALOGO, '<servicios>' + CATALOGO.map((s) => xmlObj('servicio', s)).join('') + '</servicios>');
    }

    if (req.method === 'GET' && ruta === '/pagos') {
      const lista = [...pagos.values()].slice(-50).reverse();
      return responder(req, res, 200, lista, '<pagos>' + lista.map((p) => xmlObj('pago', p)).join('') + '</pagos>');
    }

    if (req.method === 'POST' && ['/consultas', '/pagos', '/pagos/reversa'].includes(ruta)) {
      const crudo = await leerCuerpo(req);
      let b;
      if (esXml(req)) {
        b = {};
        for (const k of ['servicio', 'contrato', 'monto', 'referencia_banco']) b[k] = xmlTag(crudo, k);
      } else {
        try { b = JSON.parse(crudo || '{}'); } catch { return error(req, res, 400, 'JSON inválido'); }
      }

      if (ruta === '/consultas') {
        if (!CATALOGO.some((s) => s.codigo === b.servicio)) return error(req, res, 404, 'El servicio no existe');
        const bad = validarContrato(b.contrato);
        if (bad) return error(req, res, bad.status, bad.mensaje);
        const d = deuda(b.contrato);
        return responder(req, res, 200, d, xmlObj('consulta', d));
      }

      if (ruta === '/pagos') {
        const ref = String(b.referencia_banco || req.headers['idempotency-key'] || '').trim();
        if (!ref) return error(req, res, 422, 'Falta referencia_banco');
        const previo = pagos.get(ref);
        if (previo && previo.estado === 'APROBADO') {
          return responder(req, res, 200, { estado: 'APROBADO', autorizacion: previo.autorizacion, duplicado: true }, xmlObj('respuesta', { estado: 'APROBADO', autorizacion: previo.autorizacion, duplicado: 'true' }));
        }
        if (!CATALOGO.some((s) => s.codigo === b.servicio)) return error(req, res, 404, 'El servicio no existe');
        const monto = Number(b.monto);
        if (!Number.isFinite(monto) || monto <= 0 || monto > 50_000) return error(req, res, 422, 'Monto inválido');
        const bad = validarContrato(b.contrato);
        if (bad) return error(req, res, bad.status, bad.mensaje);
        const autorizacion = 'AUT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        pagos.set(ref, { referencia_banco: ref, servicio: b.servicio, contrato: String(b.contrato), monto: monto.toFixed(2), estado: 'APROBADO', autorizacion, fecha: new Date().toISOString() });
        return responder(req, res, 200, { estado: 'APROBADO', autorizacion }, xmlObj('respuesta', { estado: 'APROBADO', autorizacion }));
      }

      // /pagos/reversa: idempotente y nunca falla si el pago no existe
      const ref = String(b.referencia_banco || req.headers['idempotency-key'] || '').replace(/^rev-/, '').trim();
      const p = pagos.get(ref);
      if (p) p.estado = 'REVERSADO';
      return responder(req, res, 200, { estado: p ? 'REVERSADO' : 'SIN_PAGO' }, xmlObj('respuesta', { estado: p ? 'REVERSADO' : 'SIN_PAGO' }));
    }

    return error(req, res, 404, 'Ruta no encontrada');
  } catch (e) {
    return error(req, res, 500, 'Error interno del proveedor simulado');
  }
});

server.listen(PORT, () => {
  console.log(`Proveedor de servicios (simulado) escuchando en el puerto ${PORT} · llave ${API_KEY ? 'exigida' : 'NO exigida (define SIM_API_KEY)'}`);
});
