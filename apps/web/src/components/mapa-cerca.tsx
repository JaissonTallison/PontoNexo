'use client';
import 'leaflet/dist/leaflet.css';
import type { Circle, LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input } from './ui';

interface Fence {
  lat: string;
  lng: string;
  radiusM: string;
}

const BRASIL: [number, number] = [-15.78, -47.93];
const COR = '#1d3a80';

/**
 * Mapa para escolher a área (cerca) do local: toque no mapa ou arraste o marcador para o centro e
 * ajuste o raio. Os mapas vêm do OpenStreetMap; a busca de endereço usa o Nominatim (só quando o usuário pesquisa).
 */
export function FenceMap({ value, onChange }: { value: Fence; onChange: (v: Fence) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const circle = useRef<Circle | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const radius = Number(value.radiusM) || 100;
  const hasPoint = value.lat !== '' && value.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng);

  // cria o mapa uma vez (o Leaflet só roda no navegador)
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      const m = L.map(box.current, { center: BRASIL, zoom: 4, scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      const icon = L.divIcon({ className: 'pn-pino', iconSize: [22, 22], iconAnchor: [11, 11] });
      const mk = L.marker(BRASIL, { draggable: true, icon, keyboard: true, title: 'Centro da área' });
      const c = L.circle(BRASIL, { radius: 100, color: COR, weight: 2, fillColor: COR, fillOpacity: 0.12 });
      const set = (p: { lat: number; lng: number }) => {
        const { value: v, onChange: on } = latest.current;
        on({ ...v, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
      };
      mk.on('dragend', () => set(mk.getLatLng()));
      m.on('click', (e: LeafletMouseEvent) => set(e.latlng));
      // dentro de janela modal o tamanho final só existe depois de aberta
      window.setTimeout(() => m.invalidateSize(), 150);
      map.current = m;
      marker.current = mk;
      circle.current = c;
      const { value: v } = latest.current;
      if (v.lat !== '' && v.lng !== '') {
        const p: [number, number] = [Number(v.lat), Number(v.lng)];
        mk.setLatLng(p).addTo(m);
        c.setLatLng(p).setRadius(Number(v.radiusM) || 100).addTo(m);
        m.fitBounds(c.getBounds(), { padding: [24, 24] });
      }
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // acompanha o que foi digitado ou escolhido
  useEffect(() => {
    const m = map.current;
    if (!m || !marker.current || !circle.current) return;
    if (!hasPoint) return;
    const first = !m.hasLayer(marker.current);
    marker.current.setLatLng([lat, lng]).addTo(m);
    circle.current.setLatLng([lat, lng]).setRadius(radius).addTo(m);
    if (first) m.fitBounds(circle.current.getBounds(), { padding: [24, 24] });
  }, [lat, lng, radius, hasPoint]);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 5) return;
    setSearching(true);
    setSearchMsg(null);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'pt-BR' } });
      const list = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const hit = list[0];
      if (!hit) {
        setSearchMsg('Endereço não encontrado. Tente com rua, número e cidade.');
        return;
      }
      onChange({ ...value, lat: Number(hit.lat).toFixed(6), lng: Number(hit.lon).toFixed(6) });
      if (map.current) map.current.setView([Number(hit.lat), Number(hit.lon)], 17);
      setSearchMsg(`Encontrado: ${hit.display_name}. Confira o marcador e arraste se precisar.`);
    } catch {
      setSearchMsg('Não foi possível buscar agora. Toque no mapa para marcar o local.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input label="Buscar endereço no mapa" placeholder="Rua, número, bairro e cidade" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" busy={searching}>
          <Search size={18} aria-hidden /> Buscar
        </Button>
      </form>
      {searchMsg ? <p className="text-sm text-texto-2">{searchMsg}</p> : null}
      <div ref={box} className="h-72 w-full overflow-hidden rounded-[8px] border border-borda" role="application" aria-label="Mapa: toque para marcar o centro da área" />
      <p className="text-xs text-texto-3">Toque no mapa ou arraste o marcador até a casa. O círculo mostra onde a marcação conta como dentro do local.</p>
    </div>
  );
}
