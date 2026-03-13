export const GOLF_API_KEY =
  process.env.NEXT_PUBLIC_GOLF_API_KEY || "";

console.log("Golf API key loaded:", !!GOLF_API_KEY);
