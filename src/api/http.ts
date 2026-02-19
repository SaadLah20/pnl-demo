const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

console.log("VITE_API_BASE =", import.meta.env.VITE_API_BASE);
console.log("API_BASE USED =", API_BASE);

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
