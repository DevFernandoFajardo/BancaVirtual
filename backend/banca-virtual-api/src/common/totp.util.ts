import { createHmac, randomBytes } from 'crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Secreto aleatorio de 160 bits en base32 (compatible con Google Authenticator, Authy, Microsoft Authenticator...). */
export function generarSecretoTotp(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALFABETO[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function base32ABytes(secreto: string): Buffer {
  let bits = '';
  for (const c of secreto.replace(/=+$/, '').toUpperCase()) {
    const i = ALFABETO.indexOf(c);
    if (i >= 0) bits += i.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secreto: string, contador: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const h = createHmac('sha1', base32ABytes(secreto)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** RFC 6238: códigos de 6 dígitos cada 30 segundos; acepta ±1 ventana por desfase de reloj. */
export function verificarTotp(secreto: string, codigo: string, ahora = Date.now()): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  const paso = Math.floor(ahora / 30_000);
  for (const d of [-1, 0, 1]) if (hotp(secreto, paso + d) === codigo) return true;
  return false;
}

export function codigoTotp(secreto: string, ahora = Date.now()): string {
  return hotp(secreto, Math.floor(ahora / 30_000));
}

export function otpauthUrl(secreto: string, cuenta: string, emisor = 'BancaVirtual'): string {
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}
