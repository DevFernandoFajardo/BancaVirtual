import type { ComprobanteGuardado, ComprobantePago } from '@/interfaces/banca.interface';
import type { EstadoDeCuenta } from '@/interfaces/cuenta.interface';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatFecha, formatMoney } from './format';

const AZUL: [number, number, number] = [63, 107, 224];
const OSCURO: [number, number, number] = [13, 20, 37];
const GRIS: [number, number, number] = [110, 120, 145];

/** jsPDF usa la fuente Helvetica: se evitan caracteres fuera de Latin-1. */
const limpio = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, '');

async function nuevoDoc() {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  return { doc, autoTable: autoTableMod.default };
}

function encabezado(doc: import('jspdf').jsPDF, titulo: string, subtitulo: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...OSCURO);
  doc.rect(0, 0, w, 82, 'F');
  doc.setFillColor(...AZUL);
  doc.roundedRect(40, 22, 38, 38, 8, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('BV', 59, 46, { align: 'center' });
  doc.setFontSize(16);
  doc.text('BancaVirtual', 90, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(170, 182, 210);
  doc.text(limpio(subtitulo), 90, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(limpio(titulo), w - 40, 46, { align: 'right' });
}

function pie(doc: import('jspdf').jsPDF) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 226, 238);
    doc.line(40, h - 44, w - 40, h - 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text('Documento generado electronicamente por BancaVirtual. Proyecto academico: no tiene validez bancaria real.', 40, h - 30);
    doc.text(`Pagina ${i} de ${n}`, w - 40, h - 30, { align: 'right' });
  }
}

function par(doc: import('jspdf').jsPDF, x: number, y: number, k: string, v: string, alignRight = false, w = 0) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(limpio(k).toUpperCase(), alignRight ? x + w : x, y, { align: alignRight ? 'right' : 'left' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...OSCURO);
  doc.text(limpio(v), alignRight ? x + w : x, y + 15, { align: alignRight ? 'right' : 'left' });
}

export async function descargarEstadoDeCuenta(e: EstadoDeCuenta) {
  const { doc, autoTable } = await nuevoDoc();
  const w = doc.internal.pageSize.getWidth();
  const moneda = e.cuenta.moneda;
  encabezado(doc, 'Estado de cuenta', `Periodo del ${formatFecha(e.periodo.desde)} al ${formatFecha(e.periodo.hasta)}`);

  par(doc, 40, 112, 'Titular', e.titular);
  par(doc, 250, 112, 'Cuenta', `${TIPO_CUENTA_LABEL[e.cuenta.tipo]} ${formatCuenta(e.cuenta.numero)}`);
  par(doc, 40, 112, 'Generado', formatDate(e.generadoEn), true, w - 80);

  // Resumen
  const cajas: [string, string, [number, number, number]][] = [
    ['Saldo inicial', formatMoney(e.saldoInicial, moneda), OSCURO],
    ['Total creditos', '+ ' + formatMoney(e.totalCreditos, moneda), [13, 143, 88]],
    ['Total debitos', '- ' + formatMoney(e.totalDebitos, moneda), [211, 58, 58]],
    ['Saldo final', formatMoney(e.saldoFinal, moneda), AZUL],
  ];
  const ancho = (w - 80 - 3 * 10) / 4;
  cajas.forEach(([k, v, c], i) => {
    const x = 40 + i * (ancho + 10);
    doc.setFillColor(243, 245, 250);
    doc.roundedRect(x, 150, ancho, 50, 6, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(k.toUpperCase(), x + 10, 166);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...c);
    doc.text(limpio(v), x + 10, 187);
  });

  autoTable(doc, {
    startY: 218,
    margin: { left: 40, right: 40, bottom: 60 },
    head: [['Fecha', 'Descripcion', 'Referencia', 'Debito', 'Credito', 'Saldo']],
    body: e.movimientos.length
      ? e.movimientos.map((m) => [
          formatDate(m.createdAt),
          limpio(m.descripcion),
          m.referencia ?? '',
          m.tipo === 'DEBITO' ? formatMoney(m.monto, moneda) : '',
          m.tipo === 'CREDITO' ? formatMoney(m.monto, moneda) : '',
          formatMoney(m.saldoPosterior, moneda),
        ])
      : [[{ content: 'Sin movimientos en este periodo.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: OSCURO },
    headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: {
      0: { cellWidth: 82 },
      2: { cellWidth: 78, fontSize: 7.5 },
      3: { halign: 'right', cellWidth: 62 },
      4: { halign: 'right', cellWidth: 62 },
      5: { halign: 'right', cellWidth: 66 },
    },
  });

  pie(doc);
  doc.save(`estado-de-cuenta-${e.cuenta.numero}-${e.periodo.desde}_${e.periodo.hasta}.pdf`);
}

/** Comprobante de transferencia o de pago de servicio. */
export async function descargarComprobante(
  datos:
    | { tipo: 'TRANSFERENCIA'; c: ComprobanteGuardado }
    | { tipo: 'PAGO'; c: ComprobantePago },
) {
  const { doc } = await nuevoDoc();
  const w = doc.internal.pageSize.getWidth();
  const esTransf = datos.tipo === 'TRANSFERENCIA';
  encabezado(doc, esTransf ? 'Comprobante de transferencia' : 'Comprobante de pago', esTransf ? 'Transferencia entre cuentas' : 'Pago de servicios');

  const monto = datos.c.monto;
  const fecha = datos.c.fecha;
  doc.setFillColor(243, 245, 250);
  doc.roundedRect(40, 110, w - 80, 86, 10, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text('MONTO', w / 2, 136, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...OSCURO);
  doc.text(formatMoney(monto, 'GTQ'), w / 2, 172, { align: 'center' });

  const filas: [string, string][] = esTransf
    ? [
        ['Referencia', datos.c.referencia],
        ['Estado', datos.c.estado === 'COMPLETADA' ? 'Completada' : datos.c.estado],
        ['Fecha y hora', formatDate(fecha)],
        ['Cuenta origen', `${formatCuenta(datos.c.cuentaOrigen)}  ${datos.c.titularOrigen}`],
        ['Cuenta destino', `${formatCuenta(datos.c.cuentaDestino)}  ${datos.c.titularDestino}`],
        ['Descripcion', datos.c.descripcion],
      ]
    : [
        ['Referencia', datos.c.referencia],
        ['Servicio', datos.c.servicio],
        ['Contrato / referencia', datos.c.contrato],
        ['Fecha y hora', formatDate(fecha)],
        ['Cuenta de cargo', formatCuenta(datos.c.cuentaOrigen)],
      ];

  let y = 236;
  for (const [k, v] of filas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(limpio(k), 48, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...OSCURO);
    doc.text(limpio(v), w - 48, y, { align: 'right', maxWidth: w - 220 });
    doc.setDrawColor(228, 232, 242);
    doc.line(48, y + 10, w - 48, y + 10);
    y += 34;
  }

  pie(doc);
  doc.save(`comprobante-${datos.c.referencia}.pdf`);
}
