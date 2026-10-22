'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type * as ML from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HORARIO_TEXTO, PUNTOS, distanciaKm, estadoActual, formatDistancia, type Punto, type TipoPunto } from '@/lib/agencias';
import { LocateIcon, PinIcon, SearchIcon } from './icons';

/**
 * Mapa vectorial (MapLibre GL + OpenFreeMap, sin llaves): nítido a cualquier zoom, con giro, inclinación y edificios en 3D.
 * Si el estilo vectorial no carga, cae a mosaicos de OpenStreetMap.
 */
const ESTILO_VECTORIAL = 'https://tiles.openfreemap.org/styles/liberty';
const raster = (tiles: string[], attribution: string): ML.StyleSpecification => ({
  version: 8,
  sources: { base: { type: 'raster', tiles, tileSize: 256, maxzoom: 19, attribution } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});
const ESTILO_OSM = raster(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], '&copy; OpenStreetMap');
const ESTILO_SATELITE = raster(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], 'Imágenes &copy; Esri');

const COLOR: Record<TipoPunto, string> = { AGENCIA: '#3f6be0', CAJERO: '#17a673' };
const ICONO_SVG: Record<TipoPunto, string> = {
  AGENCIA:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
  CAJERO:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/></svg>',
};

const SERVICIOS_FILTRO = ['Retiros', 'Depósitos', 'Créditos y tarjetas', 'Caja de seguridad', 'Banca empresarial'] as const;
type ModoRuta = 'auto' | 'pie';
interface RutaInfo {
  km: number;
  min: number;
  modo: ModoRuta;
}
const RUTA_URL: Record<ModoRuta, string> = {
  auto: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  pie: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

type Filtro = 'TODOS' | TipoPunto;
type Capa = 'mapa' | 'satelite';
type Altura = 'bajo' | 'medio' | 'alto';
type LngLat = [number, number];
type RutaFeature = { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'LineString'; coordinates: LngLat[] } };
const ALTURAS: Record<Altura, number> = { bajo: 0.17, medio: 0.46, alto: 0.88 };

/** Mapa a pantalla completa con hoja flotante (panel lateral en escritorio, hoja inferior arrastrable en móvil). */
export default function AgenciasMap() {
  const contenedor = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const mapa = useRef<ML.Map | null>(null);
  const ML_ = useRef<typeof ML | null>(null);
  const marcadores = useRef<ML.Marker[]>([]);
  const yo = useRef<ML.Marker | null>(null);
  const rutaGeo = useRef<RutaFeature | null>(null);
  const estiloOk = useRef(false);
  const primeraVista = useRef(true);

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
  const [soloAbiertos, setSoloAbiertos] = useState(false);
  const [servicioFiltro, setServicioFiltro] = useState<string | null>(null);
  const [vistaTick, setVistaTick] = useState(0);
  const [inclinado, setInclinado] = useState(false);
  const [ruta, setRuta] = useState<RutaInfo | null>(null);
  const [buscandoRuta, setBuscandoRuta] = useState(false);

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
    const lista = PUNTOS.filter(
      (p) =>
        (filtro === 'TODOS' || p.tipo === filtro) &&
        (!q || `${p.nombre} ${p.direccion} ${p.ciudad}`.toLowerCase().includes(q)) &&
        (!soloAbiertos || estadoActual(p, ahora).abierto) &&
        (!servicioFiltro || p.servicios.includes(servicioFiltro)),
    );
    const conDist = lista.map((p) => ({ p, km: ubicacion ? distanciaKm(ubicacion, p) : null }));
    conDist.sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.p.nombre.localeCompare(b.p.nombre)));
    return conDist;
  }, [busqueda, filtro, ubicacion, soloAbiertos, servicioFiltro, ahora]);

  const seleccionado = PUNTOS.find((p) => p.id === seleccionId) ?? null;

  /** Márgenes para que el punto quede visible fuera de la hoja (panel izquierdo en escritorio, hoja inferior en móvil). */
  const relleno = useCallback((): ML.PaddingOptions => {
    const alto = contenedor.current?.clientHeight ?? 600;
    return window.innerWidth >= 1024
      ? { top: 40, bottom: 40, left: 400, right: 60 }
      : { top: 70, bottom: Math.round(alto * ALTURAS[altura]) + 20, left: 30, right: 30 };
  }, [altura]);

  // ---- ruta dibujada (se vuelve a pintar si cambia el estilo del mapa)
  const pintarRuta = useCallback(() => {
    const m = mapa.current;
    if (!m || !m.isStyleLoaded()) return;
    const data = { type: 'FeatureCollection', features: rutaGeo.current ? [rutaGeo.current] : [] } as const;
    const src = m.getSource('ruta') as ML.GeoJSONSource | undefined;
    if (src) return void src.setData(data);
    m.addSource('ruta', { type: 'geojson', data });
    m.addLayer({ id: 'ruta-borde', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 } });
    m.addLayer({ id: 'ruta-linea', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2f7bff', 'line-width': 5.5 } });
  }, []);

  // ---- crear el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const ml = await import('maplibre-gl');
      if (cancelado || !contenedor.current || mapa.current) return;
      ML_.current = ml;
      // El worker se sirve desde /public (evita problemas de empaquetado con workers en Next)
      ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const m = new ml.Map({
        container: contenedor.current,
        style: ESTILO_VECTORIAL,
        center: [-90.53, 14.6],
        zoom: 12,
        maxPitch: 70,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      mapa.current = m;
      m.on('style.load', () => {
        estiloOk.current = true;
        pintarRuta();
      });
      // Si el estilo vectorial no se puede cargar, se usa OpenStreetMap
      m.on('error', () => {
        if (!estiloOk.current) {
          estiloOk.current = true;
          m.setStyle(ESTILO_OSM);
        }
      });
      const tick = () => setVistaTick((t) => t + 1);
      m.on('zoomend', tick);
      m.on('pitchend', tick);
      m.on('rotateend', tick);
      m.on('pitchend', () => setInclinado(m.getPitch() > 10));
      setListo(true);
    })();
    const obs = new ResizeObserver(() => mapa.current?.resize());
    if (marco.current) obs.observe(marco.current);
    return () => {
      cancelado = true;
      obs.disconnect();
      for (const mk of marcadores.current) mk.remove();
      marcadores.current = [];
      mapa.current?.remove();
      mapa.current = null;
      estiloOk.current = false;
    };
  }, [pintarRuta]);

  // ---- capa base: mapa vectorial / satélite
  const capaAnterior = useRef<Capa>('mapa');
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || capaAnterior.current === capa) return;
    capaAnterior.current = capa;
    estiloOk.current = capa === 'satelite';
    m.setStyle(capa === 'satelite' ? ESTILO_SATELITE : ESTILO_VECTORIAL);
  }, [listo, capa]);

  const htmlPin = useCallback(
    (p: Punto, activo: boolean) =>
      `<div class="bv-pin${activo ? ' bv-pin--activo' : ''}" style="--c:${COLOR[p.tipo]}"><span class="bv-pin__cuerpo">${ICONO_SVG[p.tipo]}</span><span class="bv-pin__punta"></span></div>`,
    [],
  );

  // ---- marcadores: agrupa los cercanos en burbujas con contador (al acercar se separan); el seleccionado nunca se agrupa
  useEffect(() => {
    const ml = ML_.current;
    const m = mapa.current;
    if (!listo || !ml || !m) return;
    for (const mk of marcadores.current) mk.remove();
    marcadores.current = [];

    const z = m.getZoom();
    const umbral = z >= 14 ? 0 : 50; // px entre puntos para agruparlos
    const grupos: { pts: Punto[]; x: number; y: number }[] = [];
    for (const { p } of resultados) {
      const pt = m.project([p.lng, p.lat]);
      const g = p.id === seleccionId || umbral === 0 ? null : grupos.find((g) => g.pts[0].id !== seleccionId && Math.hypot(g.x - pt.x, g.y - pt.y) < umbral);
      if (g) g.pts.push(p);
      else grupos.push({ pts: [p], x: pt.x, y: pt.y });
    }
    for (const g of grupos) {
      const el = document.createElement('div');
      el.className = 'bv-pin-wrap';
      if (g.pts.length === 1) {
        const p = g.pts[0];
        const activo = p.id === seleccionId;
        el.innerHTML = htmlPin(p, activo);
        el.style.zIndex = activo ? '10' : '1';
        el.title = p.nombre;
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSeleccionId(p.id);
        });
        el.addEventListener('keydown', (e) => e.key === 'Enter' && setSeleccionId(p.id));
        marcadores.current.push(new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m));
      } else {
        const lat = g.pts.reduce((a, p) => a + p.lat, 0) / g.pts.length;
        const lng = g.pts.reduce((a, p) => a + p.lng, 0) / g.pts.length;
        el.innerHTML = `<div class="bv-cluster" aria-label="${g.pts.length} puntos">${g.pts.length}</div>`;
        el.title = `${g.pts.length} puntos`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const b = new ml.LngLatBounds();
          g.pts.forEach((p) => b.extend([p.lng, p.lat]));
          m.fitBounds(b, { padding: 90, maxZoom: 16, duration: 700 });
        });
        marcadores.current.push(new ml.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(m));
      }
    }
  }, [listo, resultados, seleccionId, vistaTick, htmlPin]);

  // ---- al cambiar búsqueda o filtros, el mapa encuadra los resultados (no en la carga inicial)
  useEffect(() => {
    const m = mapa.current;
    const ml = ML_.current;
    if (!listo || !m || !ml) return;
    if (primeraVista.current) {
      primeraVista.current = false;
      return;
    }
    if (resultados.length === 0) return;
    if (resultados.length === 1) return void m.flyTo({ center: [resultados[0].p.lng, resultados[0].p.lat], zoom: 15, padding: relleno(), duration: 800 });
    const b = new ml.LngLatBounds();
    resultados.forEach(({ p }) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: relleno(), maxZoom: 15, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, filtro, soloAbiertos, servicioFiltro, busqueda]);

  // ---- la ruta se limpia al cambiar de punto
  useEffect(() => {
    rutaGeo.current = null;
    pintarRuta();
    setRuta(null);
  }, [seleccionId, pintarRuta]);

  const volarA = useCallback(
    (p: Punto) => {
      setSeleccionId(p.id);
      mapa.current?.flyTo({ center: [p.lng, p.lat], zoom: 16, padding: relleno(), duration: 900, essential: true });
      if (window.innerWidth < 1024) setAltura('medio');
    },
    [relleno],
  );

  // ---- ubicación del usuario (punto azul estilo Apple Maps)
  function pedirUbicacion(): Promise<{ lat: number; lng: number } | null> {
    setAvisoGps('');
    if (!navigator.geolocation) {
      setAvisoGps('Tu navegador no permite obtener la ubicación.');
      return Promise.resolve(null);
    }
    setBuscandoGps(true);
    return new Promise((resolver) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const u = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUbicacion(u);
          setBuscandoGps(false);
          const ml = ML_.current;
          const m = mapa.current;
          if (ml && m) {
            yo.current?.remove();
            const el = document.createElement('div');
            el.className = 'bv-yo-wrap';
            el.innerHTML = '<div class="bv-yo"><span></span></div>';
            el.style.zIndex = '5';
            yo.current = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([u.lng, u.lat]).addTo(m);
          }
          resolver(u);
        },
        (err) => {
          setBuscandoGps(false);
          setAvisoGps(err.code === 1 ? 'Permite el acceso a tu ubicación para ver lo más cercano.' : 'No se pudo obtener tu ubicación.');
          resolver(null);
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  }

  async function localizar() {
    const u = await pedirUbicacion();
    if (u) mapa.current?.flyTo({ center: [u.lng, u.lat], zoom: 14, duration: 900 });
  }

  /** Va al punto abierto más cercano (si hay ubicación; si no, la pide). */
  async function irAlMasCercano() {
    const u = ubicacion ?? (await pedirUbicacion());
    if (!u) return;
    const candidatos = PUNTOS.filter((p) => (filtro === 'TODOS' || p.tipo === filtro) && estadoActual(p, ahora).abierto);
    const mejor = (candidatos.length ? candidatos : PUNTOS).reduce((a, b) => (distanciaKm(u, a) <= distanciaKm(u, b) ? a : b));
    volarA(mejor);
  }

  /** Dibuja en el mapa la ruta desde la ubicación del usuario hasta el punto elegido (OSRM, datos de OpenStreetMap). */
  async function trazarRuta(p: Punto, modo: ModoRuta) {
    const ml = ML_.current;
    const m = mapa.current;
    if (!ml || !m) return;
    setAvisoGps('');
    const u = ubicacion ?? (await pedirUbicacion());
    if (!u) return;
    setBuscandoRuta(true);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12_000);
    try {
      const r = await fetch(`${RUTA_URL[modo]}/${u.lng},${u.lat};${p.lng},${p.lat}?overview=full&geometries=geojson`, { signal: ctl.signal });
      const d = await r.json();
      const best = d?.routes?.[0];
      if (!r.ok || !best) throw new Error('sin ruta');
      const coords = best.geometry.coordinates as LngLat[];
      rutaGeo.current = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
      pintarRuta();
      setRuta({ km: best.distance / 1000, min: Math.max(1, Math.round(best.duration / 60)), modo });
      const b = new ml.LngLatBounds();
      coords.forEach((c) => b.extend(c));
      m.fitBounds(b, { padding: relleno(), duration: 900 });
    } catch {
      setAvisoGps('No se pudo calcular la ruta. Usa «Abrir en Maps».');
    } finally {
      clearTimeout(t);
      setBuscandoRuta(false);
    }
  }

  // ---- hoja inferior arrastrable (móvil)
  const arrastre = useRef<{ y: number; h: number } | null>(null);
  const hoja = useRef<HTMLDivElement>(null);
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

  const zoom = (d: number) => (d > 0 ? mapa.current?.zoomIn() : mapa.current?.zoomOut());
  const alternarInclinacion = () => mapa.current?.easeTo(mapa.current.getPitch() > 10 ? { pitch: 0, bearing: 0, duration: 600 } : { pitch: 62, duration: 700 });
  const estado = seleccionado ? estadoActual(seleccionado, ahora) : null;

  return (
    <div ref={marco} className={`bv-mapa ${tema === 'oscuro' && capa === 'mapa' ? 'bv-mapa--oscuro' : ''} relative isolate h-[calc(100dvh-150px)] min-h-[520px] lg:h-[calc(100dvh-210px)] lg:min-h-[560px] overflow-hidden rounded-2xl border border-line shadow-card`}>
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
          onClick={alternarInclinacion}
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-card/85 text-[.7rem] font-bold text-ink shadow-lg backdrop-blur-xl hover:bg-brand-50"
          aria-label={inclinado ? 'Vista 2D' : 'Vista 3D'}
          title={inclinado ? 'Vista 2D' : 'Vista 3D'}
        >
          {inclinado ? '2D' : '3D'}
        </button>
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
          <Detalle
            p={seleccionado}
            estado={estado}
            km={ubicacion ? distanciaKm(ubicacion, seleccionado) : null}
            ruta={ruta}
            buscandoRuta={buscandoRuta}
            onRuta={(modo) => trazarRuta(seleccionado, modo)}
            onQuitarRuta={() => {
              rutaGeo.current = null;
              pintarRuta();
              setRuta(null);
            }}
            onCerrar={() => setSeleccionId(null)}
          />
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
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Filtros rápidos">
                <button type="button" aria-pressed={soloAbiertos} onClick={() => setSoloAbiertos((v) => !v)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${soloAbiertos ? 'border-verde bg-verde text-navy-900' : 'border-line text-muted hover:text-ink'}`}>
                  Abierto ahora
                </button>
                {SERVICIOS_FILTRO.map((sv) => (
                  <button key={sv} type="button" aria-pressed={servicioFiltro === sv} onClick={() => setServicioFiltro((a) => (a === sv ? null : sv))} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${servicioFiltro === sv ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-line text-muted hover:text-ink'}`}>
                    {sv}
                  </button>
                ))}
              </div>
              <button type="button" onClick={irAlMasCercano} disabled={buscandoGps} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f7bff] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
                <LocateIcon width={16} height={16} className={buscandoGps ? 'animate-pulse' : ''} />
                Ir al más cercano
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {resultados.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted">{busqueda ? `No encontramos resultados para «${busqueda}».` : 'Ningún punto cumple esos filtros.'}</p>
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

function Detalle({
  p,
  estado,
  km,
  ruta,
  buscandoRuta,
  onRuta,
  onQuitarRuta,
  onCerrar,
}: {
  p: Punto;
  estado: { abierto: boolean; texto: string };
  km: number | null;
  ruta: RutaInfo | null;
  buscandoRuta: boolean;
  onRuta: (modo: ModoRuta) => void;
  onQuitarRuta: () => void;
  onCerrar: () => void;
}) {
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
        {ruta ? (
          <section className="rounded-xl border border-[#2f7bff]/40 bg-[#2f7bff]/10 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#2f7bff]">Ruta {ruta.modo === 'auto' ? 'en auto' : 'a pie'}</p>
                <p className="tabular text-2xl font-extrabold">{ruta.min >= 60 ? `${Math.floor(ruta.min / 60)} h ${ruta.min % 60} min` : `${ruta.min} min`}</p>
                <p className="text-sm text-muted">{formatDistancia(ruta.km)}</p>
              </div>
              <button onClick={onQuitarRuta} className="rounded-full bg-muted/25 px-3 py-1 text-xs font-semibold hover:bg-muted/40">
                Quitar ruta
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['auto', 'pie'] as const).map((m) => (
                <button key={m} onClick={() => onRuta(m)} disabled={buscandoRuta} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${ruta.modo === m ? 'bg-[#2f7bff] text-white' : 'bg-input text-ink hover:bg-brand-50'}`}>
                  {m === 'auto' ? 'En auto' : 'A pie'}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onRuta('auto')} disabled={buscandoRuta} className="flex flex-col items-center gap-1 rounded-xl bg-[#2f7bff] px-3 py-2.5 text-center text-sm font-semibold text-white hover:brightness-110 disabled:opacity-70">
              <PinIcon width={20} height={20} className={buscandoRuta ? 'animate-pulse' : ''} />
              {buscandoRuta ? 'Calculando…' : 'Ver ruta'}
            </button>
            {p.telefono ? (
              <a href={`tel:${p.telefono.replace(/\D/g, '')}`} className="flex flex-col items-center gap-1 rounded-xl bg-input px-3 py-2.5 text-center text-sm font-semibold text-[#2f7bff] hover:bg-brand-50">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                </svg>
                Llamar
              </a>
            ) : (
              <span className="flex flex-col items-center gap-1 rounded-xl bg-input px-3 py-2.5 text-center text-sm font-semibold text-muted">Abierto 24 h</span>
            )}
          </div>
        )}
        <a href={rutaUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line px-3 py-2 text-center text-sm font-semibold text-muted hover:text-ink">
          Abrir en {esApple ? 'Apple Maps' : 'Google Maps'}
        </a>

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
