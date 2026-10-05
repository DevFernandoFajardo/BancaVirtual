'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getStoredUser } from '@/lib/session';
import { authService } from '@/services/auth/auth.service';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import {
  BoltIcon,
  CalcIcon,
  CardIcon,
  ClipboardIcon,
  ExchangeIcon,
  HomeIcon,
  PinIcon,
  SendIcon,
  ShieldIcon,
  UserIcon,
  WalletIcon,
} from './icons';

const GRUPOS = [
  {
    etiqueta: 'Mi banca',
    links: [
      { href: '/dashboard', label: 'Inicio', Icon: HomeIcon },
      { href: '/transferencias', label: 'Transferir', Icon: SendIcon },
      { href: '/servicios', label: 'Pagar servicios', Icon: BoltIcon },
      { href: '/tarjetas', label: 'Mis tarjetas', Icon: WalletIcon },
    ],
  },
  {
    etiqueta: 'Servicios',
    links: [
      { href: '/productos', label: 'Productos', Icon: CardIcon },
      { href: '/gestiones', label: 'Gestiones en línea', Icon: ClipboardIcon },
    ],
  },
  {
    etiqueta: 'Herramientas',
    links: [
      { href: '/prestamos', label: 'Préstamos', Icon: CalcIcon },
      { href: '/tipo-cambio', label: 'Tipo de cambio', Icon: ExchangeIcon },
      { href: '/agencias', label: 'Agencias y cajeros', Icon: PinIcon },
    ],
  },
  {
    etiqueta: 'Cuenta',
    links: [
      { href: '/perfil', label: 'Mi perfil', Icon: UserIcon },
      { href: '/seguridad', label: 'Seguridad', Icon: ShieldIcon },
    ],
  },
];

const TITULOS: { prefijo: string; titulo: string; subtitulo: string }[] = [
  { prefijo: '/dashboard', titulo: 'Inicio', subtitulo: 'Resumen de tus cuentas y saldos.' },
  { prefijo: '/cuentas', titulo: 'Detalle de cuenta', subtitulo: 'Estado de cuenta, movimientos y operaciones.' },
  { prefijo: '/transferencias', titulo: 'Transferir', subtitulo: 'Envía dinero, guarda beneficiarios y programa pagos.' },
  { prefijo: '/servicios', titulo: 'Pagar servicios', subtitulo: 'Luz, agua, teléfono e internet desde tu cuenta.' },
  { prefijo: '/tarjetas', titulo: 'Mis tarjetas', subtitulo: 'Límite, saldo, bloqueo y pagos de tus tarjetas.' },
  { prefijo: '/gestiones', titulo: 'Gestiones en línea', subtitulo: 'Da seguimiento a tus solicitudes y trámites paso a paso.' },
  { prefijo: '/productos', titulo: 'Productos', subtitulo: 'Solicita tarjetas y créditos y conoce el resultado de tu evaluación.' },
  { prefijo: '/prestamos', titulo: 'Simulador de préstamos', subtitulo: 'Calcula tu cuota y revisa la tabla de amortización.' },
  { prefijo: '/tipo-cambio', titulo: 'Tipo de cambio', subtitulo: 'Tasas de referencia y conversor de monedas.' },
  { prefijo: '/agencias', titulo: 'Agencias y cajeros', subtitulo: 'Encuentra el punto de atención más cercano.' },
  { prefijo: '/notificaciones', titulo: 'Notificaciones', subtitulo: 'Avisos de tus gestiones, movimientos y mensajes del banco.' },
  { prefijo: '/seguridad', titulo: 'Seguridad', subtitulo: 'Contraseña, verificación en dos pasos y sesiones.' },
  { prefijo: '/perfil', titulo: 'Mi perfil', subtitulo: 'Tus datos personales y financieros.' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (u) setNombre(`${u.primerNombre} ${u.primerApellido}`);
  }, []);

  // Cierra el menú lateral al navegar (pantallas angostas)
  useEffect(() => setAbierto(false), [pathname]);

  const activo = (href: string) =>
    pathname === href || pathname.startsWith(href + '/') || (href === '/dashboard' && pathname.startsWith('/cuentas'));
  const titulo = TITULOS.find((t) => pathname.startsWith(t.prefijo)) ?? TITULOS[0];

  function salir() {
    void authService.logout().finally(() => router.replace('/login'));
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[268px_1fr]">
      {/* Fondo oscuro del menú en pantallas angostas */}
      <div
        className={`fixed inset-0 z-40 bg-[rgba(3,6,12,0.62)] transition-opacity lg:hidden ${abierto ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setAbierto(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-y-auto border-r border-white/[0.08] bg-gradient-to-b from-navy-900 to-navy-800 px-[18px] py-6 text-[#cfd8ea] transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${abierto ? 'translate-x-0 shadow-[10px_0_32px_rgba(0,0,0,0.5)]' : '-translate-x-full'}`}
      >
        <Link href="/dashboard" className="flex items-center gap-[11px] px-2 pb-[26px] pt-1">
          <span className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-brand-600 text-[.9rem] font-extrabold text-white shadow-[0_4px_14px_-4px_rgba(91,141,255,0.6)]">
            BV
          </span>
          <span className="text-[1.15rem] font-extrabold tracking-tight text-white">BancaVirtual</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-[3px]" aria-label="Principal">
          {GRUPOS.map((g) => (
            <div key={g.etiqueta} className="flex flex-col gap-[3px]">
              <p className="mx-3 mb-1.5 mt-[18px] text-[.72rem] uppercase tracking-[0.08em] text-[#7c88a3]">{g.etiqueta}</p>
              {g.links.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={activo(href) ? 'page' : undefined}
                  className={`flex items-center gap-[11px] rounded-[10px] px-[13px] py-2.5 transition-colors ${activo(href) ? 'bg-brand-600 text-white' : 'hover:bg-white/[0.07]'}`}
                >
                  <Icon width={18} height={18} className="opacity-90" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <p className="mt-3.5 border-t border-white/[0.08] px-2 pt-3.5 text-[.76rem] text-[#6c7996]">
          © 2026 Fernando Fajardo
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-card px-[18px] py-3.5 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-4">
            <button
              className="flex h-[38px] w-[38px] shrink-0 flex-col items-center justify-center gap-1 rounded-[9px] border border-line bg-input hover:border-brand-600 lg:hidden"
              onClick={() => setAbierto(true)}
              aria-label="Abrir menú"
              aria-expanded={abierto}
            >
              <span className="h-0.5 w-[18px] rounded bg-ink" />
              <span className="h-0.5 w-[18px] rounded bg-ink" />
              <span className="h-0.5 w-[18px] rounded bg-ink" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[1.5rem] font-bold sm:text-[1.95rem]">{titulo.titulo}</h1>
              <p className="hidden truncate text-muted sm:block">{titulo.subtitulo}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 text-[.9rem] sm:gap-3">
            <ThemeToggle />
            <NotificationBell />
            {nombre && <span className="hidden font-bold sm:inline">{nombre}</span>}
            <span className="hidden rounded-full border border-line bg-input px-2.5 py-[3px] text-[.78rem] text-muted sm:inline">Cliente</span>
            <button
              onClick={salir}
              className="rounded-[9px] border border-line bg-transparent px-[13px] py-[7px] text-[.86rem] transition-colors hover:border-rojo hover:text-rojo"
            >
              Salir
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-[18px] pb-14 pt-[22px] sm:px-8 sm:pt-[30px]">{children}</main>
      </div>
    </div>
  );
}
