/**
 * App configuration for share links and distribution mode.
 * Switch APP_MODE to control rivalry invite links during beta vs production.
 */

export type AppMode = "beta" | "production";

/** Set to "beta" during Vercel testing; "production" when apps are live. */
export const APP_MODE: AppMode =
  (process.env.EXPO_PUBLIC_APP_MODE?.toLowerCase().trim() as AppMode) || "beta";

const VERCEL_WEB_URL = "https://the-golf-society-hub.vercel.app";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.thegolfsocietyhub.app";
const APP_STORE_URL = "https://apps.apple.com/app/the-golf-society-hub/id6740041032";

/**
 * Returns the app link text for rivalry share messages.
 * Beta: single Vercel web link.
 * Production: App Store and Play Store download links.
 */
export function getRivalryShareLinkText(): string {
  if (APP_MODE === "beta") {
    return `Open the app:\n${VERCEL_WEB_URL}`;
  }
  return `Download the app:\nAndroid: ${PLAY_STORE_URL}\niOS: ${APP_STORE_URL}`;
}
