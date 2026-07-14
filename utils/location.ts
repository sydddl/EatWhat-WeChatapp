export type LocationPoint = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export function normalizeLocation(value: any): LocationPoint | null {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    name: String(value.name || '').trim(),
    address: String(value.address || '').trim(),
    latitude,
    longitude
  };
}

export function distanceMeters(from: LocationPoint | null, to: LocationPoint | null): number | null {
  if (!from || !to) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lngDelta = radians(to.longitude - from.longitude);
  const fromLat = radians(from.latitude);
  const toLat = radians(to.latitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function openLocation(point: LocationPoint) {
  wx.openLocation({
    latitude: point.latitude,
    longitude: point.longitude,
    name: point.name,
    address: point.address,
    scale: 18
  });
}
