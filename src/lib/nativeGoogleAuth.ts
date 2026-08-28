import { isNative } from "@/lib/platform";

// Public OAuth client IDs (not secrets). NEXT_PUBLIC_ vars are inlined at
// Docker *build* time, not container runtime — see .env.production.example.
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_IOS;

let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.initialize({
        google: {
          webClientId: WEB_CLIENT_ID,
          iOSClientId: IOS_CLIENT_ID,
          mode: "online",
        },
      });
    })().catch((err) => {
      // Let the next attempt re-initialize rather than caching the failure.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Runs the native Google account picker (OS sheet on Android via Credential
 * Manager, ASWebAuthenticationSession on iOS) and returns the OIDC ID token.
 * Native only — callers must guard with isNative().
 */
export async function nativeGoogleSignIn(): Promise<{ idToken: string }> {
  if (!isNative()) throw new Error("nativeGoogleSignIn called on web");

  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInitialized();

  // No `scopes` here on purpose: the plugin always includes openid + email +
  // profile, which is all we need for the ID token. Passing a custom `scopes`
  // array switches to the AuthorizationClient flow, which requires modifying
  // MainActivity ("You CANNOT use scopes without modifying the main activity").
  const res = await SocialLogin.login({ provider: "google", options: {} });

  const result = res.result;
  if (result.responseType !== "online" || !result.idToken) {
    throw new Error("Google sign-in returned no ID token");
  }
  return { idToken: result.idToken };
}
