/** Vitest E2E shim — forces web storage path in lib/supabaseStorage and skips native AppState wiring. */
export const Platform = { OS: "web" as const };

export const AppState = {
  addEventListener: (_type: string, _listener: (state: string) => void) => ({ remove: () => {} }),
};
