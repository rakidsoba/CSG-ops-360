/**
 * Haversine distance in metres between two WGS84 points.
 */
function distanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns { ok, distance_m, radius_m, warning } 
 * If site has no coordinates, geofence is skipped (ok: true, warning).
 */
function checkGeofence(userLat, userLng, siteLat, siteLng, radiusM = 150) {
  if (userLat == null || userLng == null) {
    return { ok: false, reason: 'GPS coordinates required for check-in' };
  }
  if (siteLat == null || siteLng == null) {
    return { ok: true, warning: 'Site has no GPS coordinates — geofence skipped', distance_m: null, radius_m: radiusM };
  }
  const distance_m = distanceMetres(
    Number(userLat),
    Number(userLng),
    Number(siteLat),
    Number(siteLng)
  );
  const radius = Number(radiusM) || 150;
  if (distance_m > radius) {
    return {
      ok: false,
      reason: `Outside geofence (${Math.round(distance_m)}m from site, allowed ${radius}m)`,
      distance_m: Math.round(distance_m),
      radius_m: radius,
    };
  }
  return { ok: true, distance_m: Math.round(distance_m), radius_m: radius };
}

module.exports = { distanceMetres, checkGeofence };
