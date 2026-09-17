import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.billerpe.captain",
  appName: "BillerPe Captain",
  webDir: "dist",
  server: {
    // The outlet's local server (billerpe-local-exe) is plain HTTP on the LAN.
    // Serving the app itself from http://localhost keeps every call same-scheme
    // (no mixed-content block), and localhost still counts as a secure
    // context for crypto.randomUUID etc.
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#faf8f5",
  },
  plugins: {
    StatusBar: { style: "LIGHT", backgroundColor: "#ffffff", overlaysWebView: false },
  },
};

export default config;
