import { describe, expect, it } from 'vitest';
import { evaluateGeofence, haversineMeters } from './geo.js';

const fence = { lat: -23.55052, lng: -46.633308, radiusM: 100 };

describe('geocerca', () => {
  it('mede distâncias conhecidas', () => {
    // 0,001° de latitude ≈ 111 m
    expect(Math.round(haversineMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }))).toBe(111);
  });
  it('classifica dentro e fora', () => {
    expect(evaluateGeofence('ok', { lat: -23.5506, lng: -46.6334, accuracyM: 15 }, fence).status).toBe('inside');
    expect(evaluateGeofence('ok', { lat: -23.553, lng: -46.6334, accuracyM: 15 }, fence).status).toBe('outside');
  });
  it('não conclui nada com precisão ruim, salvo quando a margem não alcança o raio', () => {
    expect(evaluateGeofence('ok', { lat: -23.5515, lng: -46.6334, accuracyM: 300 }, fence).status).toBe('low_accuracy');
    expect(evaluateGeofence('ok', { lat: -23.58, lng: -46.6334, accuracyM: 300 }, fence).status).toBe('outside');
  });
  it('trata permissão negada, GPS indisponível e local sem cerca', () => {
    expect(evaluateGeofence('denied', null, fence).status).toBe('denied');
    expect(evaluateGeofence('timeout', null, fence).status).toBe('unavailable');
    expect(evaluateGeofence('ok', { lat: 0, lng: 0, accuracyM: 5 }, null).status).toBe('no_geofence');
  });
});
