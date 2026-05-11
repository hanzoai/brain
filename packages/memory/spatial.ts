/**
 * Spatial helpers.
 *
 * The Postgres backend uses PostGIS; here we ship a pure-JS distance
 * function (Haversine) and a bounding-box helper so SQLite-only brains
 * still get coarse spatial filtering.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

/** Conservative bounding box around a center point of radius `radiusKm`. */
export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos(toRad(center.lat)));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

export function inBox(point: LatLng, box: BBox): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
