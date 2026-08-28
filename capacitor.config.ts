/// <reference types="@capacitor-firebase/messaging" />
import type { CapacitorConfig } from "@capacitor/cli";

// Points the native shell's WebView at the deployed production origin (this app
// uses SSR + live API routes + proxy.ts auth, so a bundled static export isn't
// possible — see AGENTS.md / next.config.ts `output: "standalone"`).
const PROD_ORIGIN = "https://doconclick.co.in";

// For local device/emulator testing against `next dev`, set this to your
// machine's LAN IP, e.g. CAP_DEV_SERVER_URL=http://192.168.1.50:3000
const DEV_ORIGIN = process.env.CAP_DEV_SERVER_URL;

const ORIGIN = DEV_ORIGIN ?? PROD_ORIGIN;

const config: CapacitorConfig = {
  appId: "com.doconclick.app",
  appName: "DocOnClick",
  webDir: "public",
  server: {
    // Loading /login directly is intentional: proxy.ts already redirects an
    // authenticated user's persisted cookie session to their dashboard, so
    // this is correct for both logged-in and logged-out entry.
    url: `${ORIGIN}/login`,
    cleartext: !!DEV_ORIGIN,
    // Cashfree hosted checkout (`cashfree.checkout({ redirectTarget: "_self" })`)
    // navigates the WebView to *.cashfree.com and then back to our return_url
    // (which is on ORIGIN, already allowed). Without this the WebView would
    // punt that navigation to the system browser and strand the user there.
    // NOTE: full-page 3-D-Secure bank redirects land on arbitrary bank
    // domains — those still need Cashfree's native SDK; card/UPI-collect and
    // Cashfree-hosted UPI work with this.
    // `*.cashfree.com`: keep hosted checkout in the WebView (see above).
    // `doconclick.co.in`: our own origin — lets the error.html "Try again"
    // button reload the app in-place instead of bouncing to the browser.
    allowNavigation: ["*.cashfree.com", "doconclick.co.in"],
    // If the WebView can't load the server at all (site down, DNS/connectivity
    // failure), show this bundled page instead of the raw browser error.
    errorPath: "error.html",
  },
  android: {
    allowMixedContent: false,
  },
  experimental: {
    ios: {
      spm: {
        // @capacitor-firebase/messaging pulls the Firebase iOS SDK over
        // SwiftPM; symlinking its checkout avoids a SwiftPM package-identity
        // collision (capawesome-team/capacitor-firebase#959). Capacitor CLI 8.4+.
        packageOptions: {
          "@capacitor-firebase/messaging": {
            symlink: true,
          },
        },
      },
    },
  },
  plugins: {
    SocialLogin: {
      // Only "Continue with Google" is used. Disabling the rest keeps the
      // Facebook / Twitter SDKs out of the build (smaller app, no Facebook
      // App ID required, no privacy-scanner false positives).
      providers: {
        google: true,
        facebook: false,
        twitter: false,
        apple: false,
      },
    },
    SplashScreen: {
      // Auto-hide natively so a first paint is never gated on JS running
      // inside the WebView; NativeBootstrap also calls hide() as a backup.
      launchAutoHide: true,
      launchShowDuration: 2000,
      launchFadeOutDuration: 200,
      backgroundColor: "#F8FAFC",
    },
    FirebaseMessaging: {
      // iOS: show heads-up alerts even while the app is foregrounded.
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // iOS: shrink the WebView so a focused input (chat composer, forms)
      // isn't hidden behind the keyboard.
      resize: "native",
      // Android: the StatusBar/edge-to-edge setup puts the app in a
      // full-screen-ish mode where the WebView doesn't resize on keyboard
      // show by default — this works around that.
      resizeOnFullScreen: true,
    },
  },
};

export default config;
