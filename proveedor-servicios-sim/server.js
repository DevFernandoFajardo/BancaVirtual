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
 *   GET  /panel             lo mismo que GET /pagos pero como JSON legible desde el navegador (pide la llave como contraseña)
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
    res.end(JSON.stringify(json, null, req._bonito ? 2 : 0));
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

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (req.url !== '/health') console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - inicio} ms) ${esXml(req) ? 'XML' : 'JSON'}`);
  });
  try {
    const url = new URL(req.url, 'http://x');
    const ruta0 = url.pathname.replace(/^\/api\/v\d+/, '').replace(/\/+$/, '') || '/';

    // /panel: los pagos recibidos como JSON legible; el navegador pide la llave en su cuadro de usuario/contraseña (usuario: cualquiera)
    let ruta = ruta0;
    if (req.method === 'GET' && ruta0 === '/panel') {
      ruta = '/pagos';
      req.headers['accept'] = 'application/json';
      req._bonito = true;
    }

    if (req.method === 'GET' && (ruta === '/health' || ruta === '/')) {
      return responder(req, res, 200, { ok: true, servicio: 'proveedor-servicios-sim', formatos: ['json', 'xml'] }, xmlObj('estado', { ok: 'true', servicio: 'proveedor-servicios-sim', formatos: 'json,xml' }));
    }

    if (API_KEY) {
      const auth = req.headers['authorization'] || '';
      const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
      const basicRaw = /^Basic\s+(.+)$/i.exec(auth)?.[1];
      const basic = basicRaw ? Buffer.from(basicRaw, 'base64').toString('utf8').split(':').slice(1).join(':') : undefined;
      const llave = bearer || basic || req.headers['x-api-key'];
      const a = Buffer.from(String(llave || '')), b = Buffer.from(API_KEY);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Proveedor de Servicios - usa la llave de API como password"');
        return error(req, res, 401, 'Llave de API inválida');
      }
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
