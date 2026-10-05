/** Puntos de atención de BancaVirtual. Datos de EJEMPLO para el proyecto académico (direcciones ilustrativas). */
export type TipoPunto = 'AGENCIA' | 'CAJERO';

export interface Punto {
  id: string;
  tipo: TipoPunto;
  nombre: string;
  direccion: string;
  ciudad: string;
  lat: number;
  lng: number;
  /** estándar = L-V 9-17 y sáb 9-13 · centro comercial = L-D 10-20 · 24h */
  horario: 'ESTANDAR' | 'CENTRO_COMERCIAL' | '24H';
  telefono?: string;
  servicios: string[];
}

const SERV_AGENCIA = ['Cajas', 'Atención personalizada', 'Apertura de cuentas', 'Créditos y tarjetas'];

export const PUNTOS: Punto[] = [
  { id: 'a-centro', tipo: 'AGENCIA', nombre: 'Agencia Centro Histórico', direccion: '6a. Avenida 9-21, Zona 1', ciudad: 'Ciudad de Guatemala', lat: 14.6407, lng: -90.5133, horario: 'ESTANDAR', telefono: '2200-1001', servicios: [...SERV_AGENCIA, 'Caja de seguridad'] },
  { id: 'a-z4', tipo: 'AGENCIA', nombre: 'Agencia Zona 4 · 4 Grados Norte', direccion: '6a. Avenida 12-51, Zona 4', ciudad: 'Ciudad de Guatemala', lat: 14.6228, lng: -90.5136, horario: 'ESTANDAR', telefono: '2200-1004', servicios: SERV_AGENCIA },
  { id: 'a-z9', tipo: 'AGENCIA', nombre: 'Agencia Reforma', direccion: 'Avenida La Reforma 9-55, Zona 9', ciudad: 'Ciudad de Guatemala', lat: 14.6017, lng: -90.5121, horario: 'ESTANDAR', telefono: '2200-1009', servicios: [...SERV_AGENCIA, 'Banca empresarial'] },
  { id: 'a-z10', tipo: 'AGENCIA', nombre: 'Agencia Oakland · Zona 10', direccion: '18 Calle 5-56, Zona 10', ciudad: 'Ciudad de Guatemala', lat: 14.6058, lng: -90.4975, horario: 'CENTRO_COMERCIAL', telefono: '2200-1010', servicios: SERV_AGENCIA },
  { id: 'a-z11', tipo: 'AGENCIA', nombre: 'Agencia Miraflores', direccion: 'Calzada Roosevelt 21-55, Zona 11', ciudad: 'Ciudad de Guatemala', lat: 14.6118, lng: -90.5483, horario: 'CENTRO_COMERCIAL', telefono: '2200-1011', servicios: SERV_AGENCIA },
  { id: 'a-z15', tipo: 'AGENCIA', nombre: 'Agencia Vista Hermosa', direccion: '2a. Avenida 15-45, Zona 15', ciudad: 'Ciudad de Guatemala', lat: 14.5873, lng: -90.4966, horario: 'ESTANDAR', telefono: '2200-1015', servicios: SERV_AGENCIA },
  { id: 'a-mixco', tipo: 'AGENCIA', nombre: 'Agencia Mixco', direccion: 'Calzada San Juan 3-20, Zona 1, Mixco', ciudad: 'Mixco', lat: 14.6331, lng: -90.6065, horario: 'ESTANDAR', telefono: '2200-1020', servicios: SERV_AGENCIA },
  { id: 'a-villa', tipo: 'AGENCIA', nombre: 'Agencia Villa Nueva', direccion: 'Calzada Justo Rufino Barrios 4-10, Zona 1', ciudad: 'Villa Nueva', lat: 14.5269, lng: -90.5875, horario: 'ESTANDAR', telefono: '2200-1030', servicios: SERV_AGENCIA },
  { id: 'a-antigua', tipo: 'AGENCIA', nombre: 'Agencia Antigua Guatemala', direccion: '5a. Avenida Norte 12, Centro', ciudad: 'Antigua Guatemala', lat: 14.5586, lng: -90.7345, horario: 'ESTANDAR', telefono: '7800-1040', servicios: SERV_AGENCIA },
  { id: 'a-xela', tipo: 'AGENCIA', nombre: 'Agencia Quetzaltenango', direccion: '4a. Calle 12-35, Zona 1', ciudad: 'Quetzaltenango', lat: 14.8347, lng: -91.5181, horario: 'ESTANDAR', telefono: '7700-1050', servicios: [...SERV_AGENCIA, 'Banca empresarial'] },
  { id: 'a-escuintla', tipo: 'AGENCIA', nombre: 'Agencia Escuintla', direccion: '4a. Avenida 6-10, Zona 1', ciudad: 'Escuintla', lat: 14.3050, lng: -90.7850, horario: 'ESTANDAR', telefono: '7800-1060', servicios: SERV_AGENCIA },
  { id: 'a-coban', tipo: 'AGENCIA', nombre: 'Agencia Cobán', direccion: '1a. Calle 3-15, Zona 1', ciudad: 'Cobán', lat: 15.4708, lng: -90.3708, horario: 'ESTANDAR', telefono: '7900-1070', servicios: SERV_AGENCIA },

  { id: 'c-plaza', tipo: 'CAJERO', nombre: 'Cajero Plaza Mayor', direccion: 'Parque Central, Zona 1', ciudad: 'Ciudad de Guatemala', lat: 14.6417, lng: -90.5133, horario: '24H', servicios: ['Retiros', 'Consulta de saldo', 'Depósitos'] },
  { id: 'c-z4', tipo: 'CAJERO', nombre: 'Cajero Cuatro Grados Norte', direccion: '4 Grados Norte, Zona 4', ciudad: 'Ciudad de Guatemala', lat: 14.6236, lng: -90.5155, horario: '24H', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-z9', tipo: 'CAJERO', nombre: 'Cajero Zona Viva', direccion: '6a. Avenida 12-00, Zona 10', ciudad: 'Ciudad de Guatemala', lat: 14.5995, lng: -90.5099, horario: '24H', servicios: ['Retiros', 'Consulta de saldo', 'Depósitos'] },
  { id: 'c-oakland', tipo: 'CAJERO', nombre: 'Cajero Oakland Mall', direccion: 'Diagonal 6 13-01, Zona 10', ciudad: 'Ciudad de Guatemala', lat: 14.6038, lng: -90.4995, horario: 'CENTRO_COMERCIAL', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-miraflores', tipo: 'CAJERO', nombre: 'Cajero Miraflores', direccion: '21 Avenida 4-32, Zona 11', ciudad: 'Ciudad de Guatemala', lat: 14.6093, lng: -90.5510, horario: 'CENTRO_COMERCIAL', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-usac', tipo: 'CAJERO', nombre: 'Cajero Ciudad Universitaria', direccion: 'Ciudad Universitaria, Zona 12', ciudad: 'Ciudad de Guatemala', lat: 14.5890, lng: -90.5530, horario: '24H', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-z15', tipo: 'CAJERO', nombre: 'Cajero Paseo Cayalá', direccion: 'Ciudad Cayalá, Zona 16', ciudad: 'Ciudad de Guatemala', lat: 14.6080, lng: -90.4690, horario: 'CENTRO_COMERCIAL', servicios: ['Retiros', 'Consulta de saldo', 'Depósitos'] },
  { id: 'c-mixco', tipo: 'CAJERO', nombre: 'Cajero Metronorte', direccion: 'Calzada Atanasio Tzul, Zona 3', ciudad: 'Ciudad de Guatemala', lat: 14.6560, lng: -90.5090, horario: 'CENTRO_COMERCIAL', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-antigua', tipo: 'CAJERO', nombre: 'Cajero Antigua · Parque', direccion: 'Parque Central, Antigua Guatemala', ciudad: 'Antigua Guatemala', lat: 14.5568, lng: -90.7333, horario: '24H', servicios: ['Retiros', 'Consulta de saldo'] },
  { id: 'c-xela', tipo: 'CAJERO', nombre: 'Cajero Parque Central Xela', direccion: 'Parque Centroamérica, Zona 1', ciudad: 'Quetzaltenango', lat: 14.8443, lng: -91.5186, horario: '24H', servicios: ['Retiros', 'Consulta de saldo'] },
];

type Tramos = Record<'lv' | 'sab' | 'dom', [number, number] | null>;
const HORARIOS: Record<Punto['horario'], Tramos> = {
  ESTANDAR: { lv: [9, 17], sab: [9, 13], dom: null },
  CENTRO_COMERCIAL: { lv: [10, 20], sab: [10, 20], dom: [10, 20] },
  '24H': { lv: [0, 24], sab: [0, 24], dom: [0, 24] },
};

export const HORARIO_TEXTO: Record<Punto['horario'], string[]> = {
  ESTANDAR: ['Lunes a viernes: 9:00 – 17:00', 'Sábado: 9:00 – 13:00', 'Domingo: cerrado'],
  CENTRO_COMERCIAL: ['Todos los días: 10:00 – 20:00'],
  '24H': ['Abierto las 24 horas'],
};

const hh = (h: number) => `${h === 24 ? 0 : h}:00`;

/** Estado actual (hora de Guatemala): abierto/cerrado y hasta cuándo. */
export function estadoActual(p: Punto, ahora = new Date()): { abierto: boolean; texto: string } {
  if (p.horario === '24H') return { abierto: true, texto: 'Abierto 24 horas' };
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ahora);
  const dia = f.find((x) => x.type === 'weekday')!.value;
  const hora = Number(f.find((x) => x.type === 'hour')!.value) + Number(f.find((x) => x.type === 'minute')!.value) / 60;
  const t = HORARIOS[p.horario][dia === 'Sun' ? 'dom' : dia === 'Sat' ? 'sab' : 'lv'];
  if (t && hora >= t[0] && hora < t[1]) return { abierto: true, texto: `Abierto · cierra a las ${hh(t[1])}` };
  return { abierto: false, texto: 'Cerrado ahora' };
}

/** Distancia en km (haversine) */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const formatDistancia = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);
