const RAW = import.meta.env.VITE_API_BASE;
console.log("[ENV] VITE_API_BASE =", RAW);

export const API_BASE = RAW || "http://localhost:3001";
console.log("[ENV] API_BASE USED =", API_BASE);

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
