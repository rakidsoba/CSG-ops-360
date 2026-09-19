# Capacitor — Android & iOS

CharteredOps 360 is a PWA first. Use Capacitor to package the same `dist/` build for Play Store and App Store.

## Prerequisites

- Node 18+
- **Android**: Android Studio + SDK 34+, JDK 17
- **iOS**: macOS + Xcode 15+ (CocoaPods)

## One-time setup

```bash
cd frontend
npm install
npm run build

# Add native projects (creates android/ and ios/ folders)
npx cap add android
npx cap add ios

# Copy web assets + plugins into native projects
npx cap sync
```

## Daily workflow

```bash
# After frontend changes
npm run build
npx cap sync

# Open in IDE
npx cap open android
npx cap open ios
```

Or use scripts:

```bash
npm run cap:android
npm run cap:ios
```

## Permissions

### Android (`android/app/src/main/AndroidManifest.xml`)

After `cap add android`, ensure:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS (`ios/App/App/Info.plist`)

```xml
<key>NSCameraUsageDescription</key>
<string>Live check-in photos for site attendance verification</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>GPS is used to verify you are at the client site</string>
```

## API base URL on device

Set `VITE_API_URL` at build time to your production API, e.g.:

```bash
VITE_API_URL=https://api.charteredsecurity.ug/api npm run build
npx cap sync
```

For local device testing against your laptop API, use your LAN IP and cleartext HTTP on Android (debug only).

## App identity

| Key | Value |
|-----|--------|
| appId | `ug.charteredsecurity.ops360` |
| appName | CharteredOps 360 |
| webDir | `dist` |

## Plugins included

- `@capacitor/app` — lifecycle
- `@capacitor/camera` — native camera (optional upgrade from web getUserMedia)
- `@capacitor/geolocation` — native GPS

Field Check-In currently uses browser APIs (works in WebView). You can switch to Capacitor Camera/Geolocation plugins later for deeper native behaviour.
