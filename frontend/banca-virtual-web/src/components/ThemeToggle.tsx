'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from './icons';

type Tema = 'dark' | 'light';

/** Alterna entre modo oscuro y claro y recuerda la elección. */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>('dark');

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function alternar() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try {
      localStorage.setItem('bv_theme', nuevo);
    } catch {
      /* almacenamiento no disponible */
    }
    setTema(nuevo);
    window.dispatchEvent(new Event('bv-theme'));
  }

  return (
    <button
      onClick={alternar}
      className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line bg-input text-ink transition-colors hover:border-brand-600"
      aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {tema === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
    </button>
  );
}
