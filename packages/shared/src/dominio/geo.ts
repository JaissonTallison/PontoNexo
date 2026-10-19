import type { GeoStatus, PositionOutcome } from './tipos.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DevicePosition extends LatLng {
  /** Raio de incerteza informado pelo aparelho, em metros. */
  accuracyM: number;
}

export interface Geofence extends LatLng {
  radiusM: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distância em metros pela fórmula de Haversine (suficiente para raios de dezenas a milhares de metros). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceEvaluation {
  status: GeoStatus;
  distanceM: number | null;
}

/**
 * Avalia a posição contra a cerca. A posição é um indício, não prova de presença:
 * "inside" significa apenas que o aparelho informou um ponto dentro do raio.
 *
 * - Precisão pior que o raio: só afirma "outside" quando nem a margem de erro alcança o raio.
 * - Precisão boa: compara a distância com o raio.
 */
export function evaluateGeofence(
  outcome: PositionOutcome,
  position: DevicePosition | null,
  fence: Geofence | null,
): GeofenceEvaluation {
  if (outcome === 'denied') return { status: 'denied', distanceM: null };
  if (outcome !== 'ok' || !position) return { status: 'unavailable', distanceM: null };
  if (!fence) return { status: 'no_geofence', distanceM: null };

  const distanceM = Math.round(haversineMeters(position, fence));
  if (position.accuracyM > fence.radiusM) {
    return { status: distanceM - position.accuracyM > fence.radiusM ? 'outside' : 'low_accuracy', distanceM };
  }
  return { status: distanceM <= fence.radiusM ? 'inside' : 'outside', distanceM };
}

export const DEFAULT_GEOFENCE_RADIUS_M = 100;
export const MIN_GEOFENCE_RADIUS_M = 25;
export const MAX_GEOFENCE_RADIUS_M = 5000;
