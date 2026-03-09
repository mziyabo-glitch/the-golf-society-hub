/**
 * App configuration for share links and distribution mode.
 * Switch APP_STAGE to control rivalry invite links during beta vs production.
 */

export type AppStage = "beta" | "production";

/** Set to "beta" during Vercel testing; "production" when apps are live. */
export const APP_STAGE: AppStage =
  (process.env.EXPO_PUBLIC_APP_STAGE?.toLowerCase().trim() as AppStage) || "beta";

/** Legacy alias for backward compatibility. */
export const APP_MODE = APP_STAGE;

const VERCEL_WEB_URL = "https://the-golf-society-hub.vercel.app";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.thegolfsocietyhub.app";
const APP_STORE_URL = "https://apps.apple.com/app/the-golf-society-hub/id6740041032";

/**
 * Returns the full rivalry invite URL for beta (Vercel + join-rivalry route).
 */
export function getRivalryInviteUrl(joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  return `${VERCEL_WEB_URL}/join-rivalry?code=${encodeURIComponent(code)}`;
}

/**
 * Returns the app link text for Sinbook rivalry share messages.
 * Beta: Vercel URL only (no App Store / Play Store).
 * Production: App Store and Play Store download links.
 */
export function getRivalryShareLinkText(joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  if (APP_STAGE === "beta") {
    return `Open here:\n${getRivalryInviteUrl(code)}\n\nOr use join code: ${code}`;
  }
  return `Download the app:\nAndroid: ${PLAY_STORE_URL}\niOS: ${APP_STORE_URL}\n\nOr use join code: ${code}`;
}

/** Beta invite message format — always uses Vercel link, never store links. */
export function getRivalryInviteMessage(title: string, joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  return `Join my rivalry "${title}" on The Golf Society Hub!\n\nOpen here:\n${getRivalryInviteUrl(code)}\n\nOr use join code: ${code}`;
}
