'use client';

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HORARIO_TEXTO, PUNTOS, distanciaKm, estadoActual, formatDistancia, type Punto, type TipoPunto } from '@/lib/agencias';
import { LocateIcon, PinIcon, SearchIcon } from './icons';

const TILES = {
  claro: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  oscuro: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};
const ATRIBUCION = {
  carto: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  esri: 'Tiles &copy; Esri',
};
const COLOR: Record<TipoPunto, string> = { AGENCIA: '#3f6be0', CAJERO: '#17a673' };
const ICONO_SVG: Record<TipoPunto, string> = {
  AGENCIA:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
  CAJERO:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/></svg>',
};

type Filtro = 'TODOS' | TipoPunto;
type Capa = 'mapa' | 'satelite';
type Altura = 'bajo' | 'medio' | 'alto';

/** Apple Maps-like: mapa a pantalla completa con hoja flotante (panel lateral en escritorio, hoja inferior en móvil). */
export default function AgenciasMap() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const capaBase = useRef<Leaflet.TileLayer | null>(null);
  const marcadores = useRef<Map<string, Leaflet.Marker>>(new Map());
  const yo = useRef<Leaflet.LayerGroup | null>(null);

  const [listo, setListo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [avisoGps, setAvisoGps] = useState('');
  const [capa, setCapa] = useState<Capa>('mapa');
  const [tema, setTema] = useState<'claro' | 'oscuro'>('oscuro');
  const [altura, setAltura] = useState<Altura>('medio');
  const [ahora, setAhora] = useState(() => new Date());

  // ---- tema (claro/oscuro) y reloj para "abierto/cerrado"
  useEffect(() => {
    const leer = () => setTema(document.documentElement.dataset.theme === 'light' ? 'claro' : 'oscuro');
    leer();
    window.addEventListener('bv-theme', leer);
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => {
      window.removeEventListener('bv-theme', leer);
      clearInterval(t);
    };
  }, []);

  // ---- lista filtrada y ordenada
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = PUNTOS.filter((p) => (filtro === 'TODOS' || p.tipo === filtro) && (!q || `${p.nombre} ${p.direccion} ${p.ciudad}`.toLowerCase().includes(q)));
    const conDist = lista.map((p) => ({ p, km: ubicacion ? distanciaKm(ubicacion, p) : null }));
    conDist.sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.p.nombre.localeCompare(b.p.nombre)));
    return conDist;
  }, [busqueda, filtro, ubicacion]);

  const seleccionado = PUNTOS.find((p) => p.id === seleccionId) ?? null;

  // ---- crear el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const leaflet = (await import('leaflet')).default;
      if (cancelado || !contenedor.current || mapa.current) return;
      L.current = leaflet;
      const m = leaflet.map(contenedor.current, { zoomControl: false, attributionControl: true, center: [14.6, -90.53], zoom: 12, zoomSnap: 0.25, worldCopyJump: true });
      m.attributionControl.setPrefix(false);
      mapa.current = m;
      yo.current = leaflet.layerGroup().addTo(m);
      setListo(true);
      // el contenedor puede cambiar de tamaño al cargar
      setTimeout(() => m.invalidateSize(), 50);
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      marcadores.current.clear();
    };
  }, []);

  // ---- capa base según tema / satélite
  useEffect(() => {
    if (!listo || !mapa.current || !L.current) return;
    capaBase.current?.remove();
    const url = capa === 'satelite' ? TILES.satelite : tema === 'claro' ? TILES.claro : TILES.oscuro;
    capaBase.current = L.current
      .tileLayer(url, { maxZoom: 19, subdomains: 'abcd', attribution: capa === 'satelite' ? ATRIBUCION.esri : ATRIBUCION.carto, detectRetina: false })
      .addTo(mapa.current);
    capaBase.current.bringToBack();
  }, [listo, capa, tema]);

  const html = useCallback(
    (p: Punto, activo: boolean) =>
      `<div class="bv-pin${activo ? ' bv-pin--activo' : ''}" style="--c:${COLOR[p.tipo]}"><span class="bv-pin__cuerpo">${ICONO_SVG[p.tipo]}</span><span class="bv-pin__punta"></span></div>`,
    [],
  );

  // ---- marcadores (según filtros)
  useEffect(() => {
    const lf = L.current;
    const m = mapa.current;
    if (!listo || !lf || !m) return;
    const visibles = new Set(resultados.map((r) => r.p.id));
    for (const [id, mk] of marcadores.current) {
      if (!visibles.has(id)) {
        mk.remove();
        marcadores.current.delete(id);
      }
    }
    for (const { p } of resultados) {
      if (marcadores.current.has(p.id)) continue;
      const mk = lf
        .marker([p.lat, p.lng], {
          icon: lf.divIcon({ className: 'bv-pin-wrap', html: html(p, false), iconSize: [38, 46], iconAnchor: [19, 44] }),
          title: p.nombre,
          keyboard: true,
          riseOnHover: true,
        })
        .addTo(m);
      mk.on('click', () => setSeleccionId(p.id));
      marcadores.current.set(p.id, mk);
    }
  }, [listo, resultados, html]);

  // ---- resaltar el seleccionado
  useEffect(() => {
    const lf = L.current;
    if (!lf) return;
    for (const p of PUNTOS) {
      const mk = marcadores.current.get(p.id);
      if (!mk) continue;
      const activo = p.id === seleccionId;
      mk.setIcon(lf.divIcon({ className: 'bv-pin-wrap', html: html(p, activo), iconSize: [38, 46], iconAnchor: [19, 44] }));
      mk.setZIndexOffset(activo ? 1000 : 0);
    }
  }, [seleccionId, resultados, html]);

  const volarA = useCallback((p: Punto) => {
    setSeleccionId(p.id);
    const m = mapa.current;
    if (!m) return;
    const esMovil = window.innerWidth < 1024;
    // En escritorio el panel tapa la izquierda; en móvil, la parte baja: se desplaza el centro para que el punto quede visible
    const destino = m.project([p.lat, p.lng], 16);
    const desplazado = esMovil ? destino.add([0, m.getSize().y * 0.2]) : destino.subtract([190, 0]);
    m.flyTo(m.unproject(desplazado, 16), 16, { duration: 0.9 });
    if (esMovil) setAltura('medio');
  }, []);

  // ---- ubicación del usuario (punto azul estilo Apple Maps)
  function localizar() {
    setAvisoGps('');
    if (!navigator.geolocation) return setAvisoGps('Tu navegador no permite obtener la ubicación.');
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUbicacion(u);
        setBuscandoGps(false);
        const lf = L.current;
        const m = mapa.current;
        if (!lf || !m || !yo.current) return;
        yo.current.clearLayers();
        lf.circle([u.lat, u.lng], { radius: pos.coords.accuracy, color: '#2f7bff', weight: 1, fillColor: '#2f7bff', fillOpacity: 0.12, interactive: false }).addTo(yo.current);
        lf.marker([u.lat, u.lng], { icon: lf.divIcon({ className: 'bv-yo-wrap', html: '<div class="bv-yo"><span></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, zIndexOffset: 2000 }).addTo(yo.current);
        m.flyTo([u.lat, u.lng], 14, { duration: 0.9 });
      },
      (err) => {
        setBuscandoGps(false);
        setAvisoGps(err.code === 1 ? 'Permite el acceso a tu ubicación para ver lo más cercano.' : 'No se pudo obtener tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // ---- hoja inferior arrastrable (móvil)
  const arrastre = useRef<{ y: number; h: number } | null>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const ALTURAS: Record<Altura, number> = { bajo: 0.17, medio: 0.46, alto: 0.88 };
  function iniciarArrastre(e: React.PointerEvent) {
    if (!hoja.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastre.current = { y: e.clientY, h: hoja.current.getBoundingClientRect().height };
    hoja.current.style.transition = 'none';
  }
  function moverArrastre(e: React.PointerEvent) {
    if (!arrastre.current || !hoja.current) return;
    const contenedorH = contenedor.current?.getBoundingClientRect().height ?? 600;
    const nueva = Math.min(contenedorH * 0.92, Math.max(contenedorH * 0.14, arrastre.current.h + (arrastre.current.y - e.clientY)));
    hoja.current.style.height = `${nueva}px`;
  }
  function terminarArrastre() {
    if (!arrastre.current || !hoja.current) return;
    const contenedorH = contenedor.current?.getBoundingClientRect().height ?? 600;
    const frac = hoja.current.getBoundingClientRect().height / contenedorH;
    hoja.current.style.transition = '';
    hoja.current.style.height = '';
    arrastre.current = null;
    const cerca = (Object.keys(ALTURAS) as Altura[]).reduce((a, b) => (Math.abs(ALTURAS[b] - frac) < Math.abs(ALTURAS[a] - frac) ? b : a));
    setAltura(cerca);
  }

  const zoom = (d: number) => mapa.current?.setZoom((mapa.current.getZoom() ?? 12) + d);
  const estado = seleccionado ? estadoActual(seleccionado, ahora) : null;

  return (
    <div className="bv-mapa relative h-[calc(100dvh-150px)] min-h-[520px] lg:h-[calc(100dvh-210px)] lg:min-h-[560px] overflow-hidden rounded-2xl border border-line shadow-card">
      <div ref={contenedor} className="absolute inset-0 z-0 bg-input" role="application" aria-label="Mapa de agencias y cajeros" />

      {/* Controles flotantes (arriba a la derecha) */}
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
        <div className="overflow-hidden rounded-xl border border-black/10 bg-card/85 shadow-lg backdrop-blur-xl">
          <button onClick={() => zoom(1)} className="grid h-10 w-10 place-items-center text-xl font-light text-ink hover:bg-brand-50" aria-label="Acercar">
            +
          </button>
          <div className="h-px bg-line" />
          <button onClick={() => zoom(-1)} className="grid h-10 w-10 place-items-center text-xl font-light text-ink hover:bg-brand-50" aria-label="Alejar">
            −
          </button>
        </div>
        <button
          onClick={localizar}
          disabled={buscandoGps}
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-card/85 text-[#2f7bff] shadow-lg backdrop-blur-xl hover:bg-brand-50 disabled:opacity-60"
          aria-label="Mi ubicación"
          title="Mi ubicación"
        >
          <LocateIcon width={20} height={20} className={buscandoGps ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={() => setCapa((c) => (c === 'mapa' ? 'satelite' : 'mapa'))}
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-card/85 text-[.7rem] font-bold text-ink shadow-lg backdrop-blur-xl hover:bg-brand-50"
          aria-label={capa === 'mapa' ? 'Ver satélite' : 'Ver mapa estándar'}
          title={capa === 'mapa' ? 'Satélite' : 'Mapa'}
        >
          {capa === 'mapa' ? 'SAT' : 'MAPA'}
        </button>
      </div>

      {avisoGps && (
        <div className="absolute left-1/2 top-3 z-[600] -translate-x-1/2 rounded-full border border-line bg-card/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-xl lg:left-[56%]">
          {avisoGps}
        </div>
      )}

      {/* Hoja: panel lateral (escritorio) / hoja inferior (móvil) */}
      <div
        ref={hoja}
        style={{ ['--h' as string]: `${ALTURAS[altura] * 100}%` }}
        className="absolute inset-x-0 bottom-0 z-[500] flex h-[var(--h)] flex-col overflow-hidden rounded-t-[22px] border border-black/10 bg-card/90 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-[height] duration-300 ease-out lg:inset-y-3 lg:bottom-3 lg:left-3 lg:right-auto lg:h-auto lg:w-[368px] lg:rounded-[22px] lg:shadow-[0_18px_50px_-14px_rgba(0,0,0,0.55)]"
      >
        {/* Asa de arrastre (solo móvil) */}
        <div
          className="grid cursor-grab touch-none place-items-center py-2.5 active:cursor-grabbing lg:hidden"
          onPointerDown={iniciarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          onClick={() => setAltura((a) => (a === 'bajo' ? 'medio' : a === 'medio' ? 'alto' : 'bajo'))}
          role="button"
          aria-label="Cambiar tamaño de la lista"
        >
          <span className="h-[5px] w-10 rounded-full bg-muted/50" />
        </div>

        {seleccionado && estado ? (
          <Detalle p={seleccionado} estado={estado} km={ubicacion ? distanciaKm(ubicacion, seleccionado) : null} onCerrar={() => setSeleccionId(null)} />
        ) : (
          <>
            <div className="space-y-3 px-4 pb-3 pt-1 lg:pt-4">
              <label className="relative block">
                <span className="sr-only">Buscar agencias y cajeros</span>
                <SearchIcon width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onFocus={() => window.innerWidth < 1024 && setAltura('alto')}
                  onKeyDown={(e) => e.key === 'Enter' && resultados[0] && volarA(resultados[0].p)}
                  placeholder="Buscar agencias y cajeros"
                  className="block w-full rounded-xl border-0 bg-input/90 py-2.5 pl-10 pr-9 text-[.95rem] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                />
                {busqueda && (
                  <button type="button" onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-muted/40 text-xs text-card" aria-label="Borrar búsqueda">
                    ×
                  </button>
                )}
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-input/90 p-[3px]" role="radiogroup" aria-label="Tipo de punto">
                {([['TODOS', 'Todos'], ['AGENCIA', 'Agencias'], ['CAJERO', 'Cajeros']] as const).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)} className={`rounded-[8px] px-2 py-1.5 text-[.82rem] font-semibold transition ${filtro === v ? 'bg-card text-ink shadow' : 'text-muted'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {resultados.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted">No encontramos resultados para «{busqueda}».</p>
              ) : (
                <>
                  <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{ubicacion ? 'Cerca de ti' : 'Resultados'} · {resultados.length}</p>
                  <ul>
                    {resultados.map(({ p, km }) => {
                      const e = estadoActual(p, ahora);
                      return (
                        <li key={p.id}>
                          <button onClick={() => volarA(p)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-brand-50">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: COLOR[p.tipo] }} dangerouslySetInnerHTML={{ __html: ICONO_SVG[p.tipo] }} />
                            <span className="min-w-0 flex-1 border-b border-line/60 pb-2.5">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-[.92rem] font-semibold">{p.nombre}</span>
                                {km !== null && <span className="shrink-0 text-xs text-muted">{formatDistancia(km)}</span>}
                              </span>
                              <span className="block truncate text-xs text-muted">{p.direccion}</span>
                              <span className={`text-xs font-medium ${e.abierto ? 'text-verde' : 'text-rojo'}`}>{e.texto}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <p className="px-3 pt-2 text-[.7rem] text-muted">Puntos de ejemplo para el proyecto académico.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Detalle({ p, estado, km, onCerrar }: { p: Punto; estado: { abierto: boolean; texto: string }; km: number | null; onCerrar: () => void }) {
  const dest = `${p.lat},${p.lng}`;
  const esApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS/i.test(navigator.userAgent);
  const rutaUrl = esApple ? `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(p.nombre)}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1 lg:pt-4">
        <div className="min-w-0">
          <h2 className="text-[1.2rem] font-bold leading-snug">{p.nombre}</h2>
          <p className="text-sm text-muted">
            {p.tipo === 'AGENCIA' ? 'Agencia' : 'Cajero automático'} · {p.ciudad}
            {km !== null && ` · ${formatDistancia(km)}`}
          </p>
        </div>
        <button onClick={onCerrar} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted/25 text-lg leading-none text-ink hover:bg-muted/40" aria-label="Cerrar detalle">
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          <a href={rutaUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-xl bg-[#2f7bff] px-3 py-2.5 text-center text-sm font-semibold text-white hover:brightness-110">
            <PinIcon width={20} height={20} />
            Cómo llegar
          </a>
          {p.telefono ? (
            <a href={`tel:${p.telefono.replace(/\D/g, '')}`} className="flex flex-col items-center gap-1 rounded-xl bg-input px-3 py-2.5 text-center text-sm font-semibold text-[#2f7bff] hover:bg-brand-50">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
              </svg>
              Llamar
            </a>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-xl bg-input px-3 py-2.5 text-center text-sm font-semibold text-muted">24 h</span>
          )}
        </div>

        <section className="rounded-xl bg-input/80 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Dirección</p>
          <p className="mt-0.5 text-sm">{p.direccion}</p>
          <p className="text-sm text-muted">{p.ciudad}, Guatemala</p>
        </section>

        <section className="rounded-xl bg-input/80 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Horario</p>
            <span className={`text-xs font-bold ${estado.abierto ? 'text-verde' : 'text-rojo'}`}>{estado.texto}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {HORARIO_TEXTO[p.horario].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        {p.telefono && (
          <section className="rounded-xl bg-input/80 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Teléfono</p>
            <p className="tabular mt-0.5 text-sm">{p.telefono}</p>
          </section>
        )}

        <section>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Servicios</p>
          <div className="flex flex-wrap gap-1.5">
            {p.servicios.map((s) => (
              <span key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">
                {s}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
