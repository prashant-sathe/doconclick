import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The Capacitor app's WebView loads the dev server from a different origin
  // (Android emulator → 10.0.2.2, a physical device → the Mac's LAN IP), so
  // Next's dev-resource cross-origin guard has to allow those hosts or the
  // client bundle / HMR socket is refused and the page never hydrates.
  allowedDevOrigins: ["10.0.2.2", "192.168.1.218"],
};

export default nextConfig;
