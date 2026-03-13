export const GOLF_API_KEY = process.env.NEXT_PUBLIC_GOLF_API_KEY ?? "";

if (!GOLF_API_KEY) {
  console.warn("Golf API key missing: NEXT_PUBLIC_GOLF_API_KEY");
}
