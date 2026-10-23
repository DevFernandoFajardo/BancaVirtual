import type { Cuenta, EstadoDeCuenta } from '@/interfaces/cuenta.interface';
import type { Solicitud } from '@/interfaces/solicitud.interface';
import type { TransferenciaHistorial } from '@/interfaces/transferencia.interface';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { estadoCuentaService } from '@/services/banca.service';
import { solicitudesService } from '@/services/solicitudes/solicitudes.service';
import { transferenciasService } from '@/services/transferencias/transferencias.service';
import { getStoredUser } from './session';
import { ESTADO_SOLICITUD_LABEL } from './productos';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatFecha, formatMoney, hoyGT } from './format';

type RGB = [number, number, number];
const AZUL: RGB = [58, 127, 213];
const TURQUESA: RGB = [79, 192, 194];
const OSCURO: RGB = [13, 20, 37];
const NAVY: RGB = [17, 27, 50];
const GRIS: RGB = [110, 120, 145];
const FONDO: RGB = [243, 246, 252];
const VERDE: RGB = [18, 150, 96];
const ROJO: RGB = [208, 62, 62];
const AMBAR: RGB = [196, 132, 10];

export interface Periodo {
  desde: string;
  hasta: string;
  /** Texto para el PDF, p. ej. "Ultimos 15 dias" */
  etiqueta: string;
}

/** Opciones rápidas que elige el cliente (días hacia atrás desde hoy) */
export const OPCIONES_PERIODO = [
  { valor: '3', dias: 3, texto: 'Últimos 3 días' },
  { valor: '7', dias: 7, texto: 'Últimos 7 días' },
  { valor: '15', dias: 15, texto: 'Últimos 15 días' },
  { valor: '30', dias: 30, texto: 'Último mes' },
  { valor: '90', dias: 90, texto: 'Últimos 3 meses' },
  { valor: '180', dias: 180, texto: 'Últimos 6 meses' },
  { valor: '365', dias: 365, texto: 'Último año' },
] as const;

export function periodoDesdeOpcion(valor: string, personalizado?: { desde: string; hasta: string }): Periodo {
  if (valor === 'custom' && personalizado) {
    return { ...personalizado, etiqueta: `Del ${formatFecha(personalizado.desde)} al ${formatFecha(personalizado.hasta)}` };
  }
  const o = OPCIONES_PERIODO.find((x) => x.valor === valor) ?? OPCIONES_PERIODO[0];
  return { desde: hoyGT(-o.dias), hasta: hoyGT(0), etiqueta: o.texto.replace('Últimos', 'Ultimos').replace('Último', 'Ultimo').replace('días', 'dias').replace('año', 'ano') };
}

const limpio = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, '');
const dia = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(iso));
const enPeriodo = (iso: string, desde: string, hasta: string) => {
  const d = dia(iso);
  return d >= desde && d <= hasta;
};

type Doc = import('jspdf').jsPDF;

async function nuevoDoc() {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { doc: new jsPDF({ unit: 'pt', format: 'letter' }), autoTable: at.default };
}

/** Logo CP BancaVirtual dibujado con vectores */
function logo(doc: Doc, x: number, y: number, s: number) {
  doc.setFillColor(...AZUL);
  doc.roundedRect(x, y, s, s, s * 0.24, s * 0.24, 'F');
  // "brillo" turquesa en la esquina inferior derecha
  doc.setFillColor(...TURQUESA);
  doc.roundedRect(x + s * 0.45, y + s * 0.45, s * 0.55, s * 0.55, s * 0.2, s * 0.2, 'F');
  doc.setFillColor(...AZUL);
  doc.roundedRect(x, y, s * 0.78, s * 0.78, s * 0.24, s * 0.24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s * 0.4);
  doc.text('BV', x + s * 0.4, y + s * 0.5, { align: 'center' });
  doc.setDrawColor(52, 211, 153);
  doc.setLineWidth(s * 0.09);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.lines([[s * 0.13, s * 0.13], [s * 0.3, -s * 0.3]], x + s * 0.5, y + s * 0.74, [1, 1], 'S');
  doc.setLineWidth(1);
}

function portada(doc: Doc, titulo: string, subtitulo: string, icono: 'cuentas' | 'gestiones' | 'transferencias') {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 128, 'F');
  // franja de degradado simulada
  const pasos = 48;
  for (let i = 0; i < pasos; i++) {
    const t = i / (pasos - 1);
    doc.setFillColor(Math.round(AZUL[0] + (TURQUESA[0] - AZUL[0]) * t), Math.round(AZUL[1] + (TURQUESA[1] - AZUL[1]) * t), Math.round(AZUL[2] + (TURQUESA[2] - AZUL[2]) * t));
    doc.rect((w / pasos) * i, 128, w / pasos + 1, 5, 'F');
  }
  // círculos decorativos
  doc.setFillColor(24, 38, 68);
  doc.circle(w - 40, 20, 90, 'F');
  doc.setFillColor(20, 32, 58);
  doc.circle(w - 150, 92, 36, 'F');

  logo(doc, 40, 26, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CP BancaVirtual', 92, 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(150, 170, 205);
  doc.text('MIS REPORTES', 92, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text(limpio(titulo), 40, 106);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(170, 190, 225);
  doc.text(limpio(subtitulo), w - 40, 106, { align: 'right' });
  void icono;
}

function tarjetaCliente(doc: Doc, y: number, desde: string, hasta: string): number {
  const w = doc.internal.pageSize.getWidth();
  const u = getStoredUser();
  const nombre = u ? `${u.primerNombre} ${u.primerApellido}` : 'Cliente';
  doc.setFillColor(...FONDO);
  doc.roundedRect(40, y, w - 80, 56, 10, 10, 'F');
  doc.setFillColor(...AZUL);
  doc.roundedRect(40, y, 5, 56, 2, 2, 'F');
  const col = (x: number, k: string, v: string, right = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(k.toUpperCase(), x, y + 21, { align: right ? 'right' : 'left' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...OSCURO);
    doc.text(limpio(v), x, y + 38, { align: right ? 'right' : 'left' });
  };
  col(60, 'Cliente', nombre);
  col(250, 'Periodo', `${formatFecha(desde)} - ${formatFecha(hasta)}`);
  col(w - 56, 'Generado', formatDate(new Date().toISOString()), true);
  return y + 76;
}

function kpis(doc: Doc, y: number, items: { k: string; v: string; color: RGB }[]): number {
  const w = doc.internal.pageSize.getWidth();
  const gap = 10;
  const ancho = (w - 80 - gap * (items.length - 1)) / items.length;
  items.forEach((it, i) => {
    const x = 40 + i * (ancho + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 244);
    doc.roundedRect(x, y, ancho, 54, 8, 8, 'FD');
    doc.setFillColor(...it.color);
    doc.roundedRect(x, y + 10, 3.5, 34, 1.7, 1.7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(limpio(it.k).toUpperCase(), x + 14, y + 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...it.color);
    doc.text(limpio(it.v), x + 14, y + 41);
  });
  return y + 54 + 22;
}

function seccion(doc: Doc, y: number, texto: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...OSCURO);
  doc.text(limpio(texto), 40, y);
  doc.setDrawColor(...TURQUESA);
  doc.setLineWidth(1.6);
  doc.line(40, y + 6, 74, y + 6);
  doc.setLineWidth(1);
  return y + 18;
}

function pie(doc: Doc) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(222, 228, 240);
    doc.line(40, h - 44, w - 40, h - 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text('Documento generado electronicamente por CP BancaVirtual. Proyecto academico: no tiene validez bancaria real.', 40, h - 30);
    doc.text(`Pagina ${i} de ${n}`, w - 40, h - 30, { align: 'right' });
  }
}

function vacio(doc: Doc, y: number, texto: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...FONDO);
  doc.roundedRect(40, y, w - 80, 90, 12, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GRIS);
  doc.text(limpio(texto), w / 2, y + 48, { align: 'center' });
}

const ESTILO_TABLA = {
  styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 6, textColor: OSCURO, lineColor: [232, 237, 247] as RGB, lineWidth: 0.4 },
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' as const, fontSize: 8 },
  alternateRowStyles: { fillColor: [248, 250, 254] as RGB },
};

// ------------------------------------------------------------------ 1) Estados de cuenta

export async function reporteEstadosDeCuenta(per: Periodo) {
  const { desde, hasta } = per;
  const cuentas: Cuenta[] = await cuentasService.listar();
  const estados: EstadoDeCuenta[] = await Promise.all(cuentas.map((c) => estadoCuentaService.estado(c.id, desde, hasta)));
  const { doc, autoTable } = await nuevoDoc();
  const w = doc.internal.pageSize.getWidth();

  portada(doc, 'Estados de cuenta', per.etiqueta, 'cuentas');
  let y = tarjetaCliente(doc, 152, desde, hasta);

  const totalCred = estados.reduce((a, e) => a + Number(e.totalCreditos), 0);
  const totalDeb = estados.reduce((a, e) => a + Number(e.totalDebitos), 0);
  const patrimonio = estados.reduce((a, e) => a + Number(e.saldoFinal), 0);
  y = kpis(doc, y, [
    { k: 'Cuentas', v: String(estados.length), color: AZUL },
    { k: 'Total creditos', v: '+ ' + formatMoney(totalCred), color: VERDE },
    { k: 'Total debitos', v: '- ' + formatMoney(totalDeb), color: ROJO },
    { k: 'Saldo total', v: formatMoney(patrimonio), color: OSCURO },
  ]);

  y = seccion(doc, y, 'Resumen por cuenta');
  if (!estados.length) vacio(doc, y, 'Aun no tienes cuentas registradas.');
  else
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40, bottom: 60 },
      head: [['Cuenta', 'Saldo inicial', 'Creditos', 'Debitos', 'Saldo final']],
      body: estados.map((e) => [
        `${TIPO_CUENTA_LABEL[e.cuenta.tipo]}\n${formatCuenta(e.cuenta.numero)}`,
        formatMoney(e.saldoInicial, e.cuenta.moneda),
        formatMoney(e.totalCreditos, e.cuenta.moneda),
        formatMoney(e.totalDebitos, e.cuenta.moneda),
        formatMoney(e.saldoFinal, e.cuenta.moneda),
      ]),
      ...ESTILO_TABLA,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', textColor: VERDE }, 3: { halign: 'right', textColor: ROJO }, 4: { halign: 'right', fontStyle: 'bold' } },
    });

  for (const e of estados) {
    doc.addPage();
    const moneda = e.cuenta.moneda;
    // banda de cuenta
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, w, 74, 'F');
    doc.setFillColor(...AZUL);
    doc.rect(0, 74, w, 3, 'F');
    logo(doc, 40, 20, 34);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${TIPO_CUENTA_LABEL[e.cuenta.tipo]}`, 86, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(170, 190, 225);
    doc.text(`${formatCuenta(e.cuenta.numero)}  ·  ${limpio(e.titular)}`, 86, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${formatFecha(e.periodo.desde)} - ${formatFecha(e.periodo.hasta)}`, w - 40, 46, { align: 'right' });

    let yy = kpis(doc, 96, [
      { k: 'Saldo inicial', v: formatMoney(e.saldoInicial, moneda), color: OSCURO },
      { k: 'Creditos', v: '+ ' + formatMoney(e.totalCreditos, moneda), color: VERDE },
      { k: 'Debitos', v: '- ' + formatMoney(e.totalDebitos, moneda), color: ROJO },
      { k: 'Saldo final', v: formatMoney(e.saldoFinal, moneda), color: AZUL },
    ]);
    yy = seccion(doc, yy, `Movimientos (${e.movimientos.length})`);
    if (!e.movimientos.length) vacio(doc, yy, 'Sin movimientos en este periodo.');
    else
      autoTable(doc, {
        startY: yy,
        margin: { left: 40, right: 40, top: 40, bottom: 60 },
        head: [['Fecha', 'Descripcion', 'Referencia', 'Debito', 'Credito', 'Saldo']],
        body: e.movimientos.map((m) => [
          formatDate(m.createdAt),
          limpio(m.descripcion),
          m.referencia ?? '',
          m.tipo === 'DEBITO' ? formatMoney(m.monto, moneda) : '',
          m.tipo === 'CREDITO' ? formatMoney(m.monto, moneda) : '',
          formatMoney(m.saldoPosterior, moneda),
        ]),
        ...ESTILO_TABLA,
        columnStyles: {
          0: { cellWidth: 80 },
          2: { cellWidth: 76, fontSize: 7 },
          3: { halign: 'right', cellWidth: 62, textColor: ROJO },
          4: { halign: 'right', cellWidth: 62, textColor: VERDE },
          5: { halign: 'right', cellWidth: 66, fontStyle: 'bold' },
        },
      });
  }

  pie(doc);
  doc.save(`estados-de-cuenta_${desde}_${hasta}.pdf`);
  return estados.reduce((a, e) => a + e.movimientos.length, 0);
}

// ------------------------------------------------------------------ 2) Gestiones

const COLOR_ESTADO: Record<string, RGB> = {
  EN_EVALUACION: AMBAR,
  PENDIENTE_DECISION_CLIENTE: AMBAR,
  ACEPTADA: AZUL,
  EMITIDA: VERDE,
  RECHAZADA_POR_POLITICAS: ROJO,
  RECHAZADA_POR_CLIENTE: GRIS,
  CANCELADA: ROJO,
};
const TINTE = (c: RGB): RGB => [Math.round(255 - (255 - c[0]) * 0.14), Math.round(255 - (255 - c[1]) * 0.14), Math.round(255 - (255 - c[2]) * 0.14)];

export async function reporteGestiones(per: Periodo) {
  const { desde, hasta } = per;
  const todas: Solicitud[] = await solicitudesService.listar();
  const gestiones = todas.filter((g) => enPeriodo(g.createdAt, desde, hasta)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { doc, autoTable } = await nuevoDoc();

  portada(doc, 'Gestiones', per.etiqueta, 'gestiones');
  let y = tarjetaCliente(doc, 152, desde, hasta);
  const cuenta = (f: (g: Solicitud) => boolean) => String(gestiones.filter(f).length);
  y = kpis(doc, y, [
    { k: 'Gestiones', v: String(gestiones.length), color: AZUL },
    { k: 'En tramite', v: cuenta((g) => ['EN_EVALUACION', 'PENDIENTE_DECISION_CLIENTE', 'ACEPTADA'].includes(g.estado)), color: AMBAR },
    { k: 'Completadas', v: cuenta((g) => g.estado === 'EMITIDA'), color: VERDE },
    { k: 'No aprobadas', v: cuenta((g) => ['RECHAZADA_POR_POLITICAS', 'RECHAZADA_POR_CLIENTE', 'CANCELADA'].includes(g.estado)), color: ROJO },
  ]);
  y = seccion(doc, y, 'Detalle de gestiones');
  if (!gestiones.length) vacio(doc, y, 'No hiciste gestiones en este periodo.');
  else
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40, top: 40, bottom: 60 },
      head: [['Folio', 'Producto', 'Fecha', 'Resultado', 'Estado']],
      body: gestiones.map((g) => [
        g.id.slice(0, 8).toUpperCase(),
        limpio(g.productoNombre ?? g.productoCodigo),
        formatDate(g.createdAt),
        g.enEvaluacion ? 'En evaluacion' : g.aprobada ? 'Aprobada' : 'No aprobada',
        limpio(ESTADO_SOLICITUD_LABEL[g.estado] ?? g.estado),
      ]),
      ...ESTILO_TABLA,
      columnStyles: { 0: { cellWidth: 62, fontStyle: 'bold' }, 2: { cellWidth: 100 }, 3: { cellWidth: 74 } },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const g = gestiones[d.row.index];
        if ((d.column.index === 4 || d.column.index === 3) && g) {
          const c = d.column.index === 4 ? (COLOR_ESTADO[g.estado] ?? GRIS) : g.enEvaluacion ? AMBAR : g.aprobada ? VERDE : ROJO;
          d.cell.styles.textColor = c;
          d.cell.styles.fillColor = TINTE(c);
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });

  pie(doc);
  doc.save(`gestiones_${desde}_${hasta}.pdf`);
  return gestiones.length;
}

// ------------------------------------------------------------------ 3) Transferencias

export async function reporteTransferencias(per: Periodo) {
  const { desde, hasta } = per;
  const items: TransferenciaHistorial[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await transferenciasService.historial(page, 100);
    items.push(...r.items);
    // el historial viene de la mas reciente a la mas antigua: si la ultima ya es anterior al periodo, se termina
    const ultima = r.items[r.items.length - 1];
    if (!ultima || items.length >= r.total || dia(ultima.fecha) < desde) break;
  }
  const lista = items.filter((t) => enPeriodo(t.fecha, desde, hasta));
  const enviadas = lista.filter((t) => t.direccion === 'ENVIADA');
  const recibidas = lista.filter((t) => t.direccion === 'RECIBIDA');
  const suma = (a: TransferenciaHistorial[]) => a.reduce((s, t) => s + t.monto, 0);

  const { doc, autoTable } = await nuevoDoc();
  portada(doc, 'Transferencias', per.etiqueta, 'transferencias');
  let y = tarjetaCliente(doc, 152, desde, hasta);
  y = kpis(doc, y, [
    { k: 'Transferencias', v: String(lista.length), color: AZUL },
    { k: `Realizadas (${enviadas.length})`, v: '- ' + formatMoney(suma(enviadas)), color: ROJO },
    { k: `Recibidas (${recibidas.length})`, v: '+ ' + formatMoney(suma(recibidas)), color: VERDE },
    { k: 'Balance neto', v: formatMoney(suma(recibidas) - suma(enviadas)), color: OSCURO },
  ]);
  y = seccion(doc, y, 'Detalle de transferencias');
  if (!lista.length) vacio(doc, y, 'Sin transferencias en este periodo.');
  else
    autoTable(doc, {
      startY: y,
      margin: { left: 40, right: 40, top: 40, bottom: 60 },
      head: [['Fecha', 'Referencia', 'Tipo', 'Origen', 'Destino', 'Descripcion', 'Monto']],
      body: lista.map((t) => [
        formatDate(t.fecha),
        t.referencia,
        t.direccion === 'ENVIADA' ? 'Enviada' : 'Recibida',
        formatCuenta(t.cuentaOrigen),
        formatCuenta(t.cuentaDestino),
        limpio(t.descripcion),
        (t.direccion === 'ENVIADA' ? '- ' : '+ ') + formatMoney(t.monto, t.moneda),
      ]),
      ...ESTILO_TABLA,
      styles: { ...ESTILO_TABLA.styles, fontSize: 7.8, cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 70, fontSize: 6.8 }, 2: { cellWidth: 46 }, 6: { halign: 'right', fontStyle: 'bold', cellWidth: 66 } },
      didParseCell: (d) => {
        if (d.section !== 'body') return;
        const t = lista[d.row.index];
        if (!t) return;
        const c = t.direccion === 'ENVIADA' ? ROJO : VERDE;
        if (d.column.index === 2 || d.column.index === 6) {
          d.cell.styles.textColor = c;
          d.cell.styles.fontStyle = 'bold';
          if (d.column.index === 2) d.cell.styles.fillColor = TINTE(c);
        }
      },
    });

  pie(doc);
  doc.save(`transferencias_${desde}_${hasta}.pdf`);
  return lista.length;
}
