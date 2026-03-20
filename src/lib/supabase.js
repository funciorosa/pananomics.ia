// Shared Supabase helpers for components outside App.jsx
export const SUPABASE_URL = "https://eyxgyeybvokvrkrarmzh.supabase.co";
export const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eGd5ZXlidm9rdnJrcmFybXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI5MTksImV4cCI6MjA4ODgwODkxOX0.gE49fWx6FbHjAka3YisRYY7pWhq5Q1P5hhPIYI2ZupE";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export async function sbQuery(tabla, params = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${params}`, {
    headers: HEADERS,
  });
  if (!res.ok) return [];
  return res.json();
}

export async function sbRpc(fn, body = {}) {
  const hasParams = Object.keys(body).length > 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: hasParams ? "POST" : "GET",
    headers: HEADERS,
    ...(hasParams ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) return [];
  return res.json();
}
