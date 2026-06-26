// Server-side only — set BACKEND_URL on Netlify (runtime, no rebuild needed for changes).
// NEXT_PUBLIC_BACKEND_URL is a build-time fallback for older configs.
export const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:4000"
