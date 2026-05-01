import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fernandomartinez.contabilidadm4pro',
  appName: 'Contabilidad M4 Pro',
  webDir: 'dist',
  backgroundColor: '#0a0f1d',
  server: {
    // Use https scheme on Android (Capacitor 5+ default) to avoid mixed-content
    // issues and ensure cookies/localStorage work consistently across API levels.
    androidScheme: 'https',
  },
  android: {
    // Enforce HTTPS-only content in the WebView (no HTTP resources allowed)
    // so the app's security posture is consistent with the https androidScheme.
    allowMixedContent: false,
  },
};

export default config;
