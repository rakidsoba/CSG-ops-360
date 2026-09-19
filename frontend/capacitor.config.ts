import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ug.charteredsecurity.ops360',
  appName: 'CharteredOps 360',
  webDir: 'dist',
  server: {
    // For local dev against machine API, set androidScheme and cleartext if needed
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      // Prefer rear camera for field check-in
      permissionType: 'camera',
    },
    Geolocation: {
      // High accuracy for geofence
    },
  },
};

export default config;
