/**
 * Thin wrappers around Capacitor plugins when running as a native app.
 * Falls back to web APIs inside browser / PWA.
 * Capacitor packages are optional until `npm install` + cap sync.
 */

export async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function platform(): Promise<string> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/** Prefer Capacitor Geolocation on native; otherwise browser geolocation. */
export async function getCurrentPosition(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
} | null> {
  if (await isNative()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
      };
    } catch {
      /* fall through to web */
    }
  }
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}
