// Vercel serverless function — genera Excel (.xlsx) desde datos de presupuesto
// Recibe: { fuente_ingreso, nombre_entidad, anio, tipo_presupuesto, nombre_programa }
// Retorna: { xlsxBase64, filename, filas }

const XLSX = require("xlsx");
const SUPABASE_URL = "https://eyxgyeybvokvrkrarmzh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eGd5ZXlidm9rdnJrcmFybXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI5MTksImV4cCI6MjA4ODgwODkxOX0.gE49fWx6FbHjAka3YisRYY7pWhq5Q1P5hhPIYI2ZupE";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fuente_ingreso, nombre_entidad, anio, tipo_presupuesto, nombre_programa } = req.body || {};

  let rows;
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consultar_presupuesto_chat`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_fuente:   fuente_ingreso   || null,
        p_entidad:  nombre_entidad   || null,
        p_anio:     anio             || null,
        p_tipo:     tipo_presupuesto || null,
        p_programa: nombre_programa  || null
      })
    });
    if (!rpcRes.ok) throw new Error(`Supabase ${rpcRes.status}`);
    rows = await rpcRes.json();
  } catch (e) {
    return res.status(500).json({ error: `Error consultando datos: ${e.message}` });
  }

  if (!rows || rows.length === 0) {
    return res.status(200).json({ xlsxBase64: null, filas: 0, message: "Sin resultados para los filtros indicados." });
  }

  // Construir hoja de cálculo
  const wsData = [
    ["Entidad", "Fuente de Ingreso", "Año", "Tipo", "Ley (B/.)", "Modificado (B/.)", "Devengado (B/.)", "% Ejecución"],
    ...rows.map(r => [
      r.nombre_entidad   || "",
      r.fuente_ingreso   || "",
      r.anio             || "",
      r.tipo_presupuesto || "",
      Math.round(+(r.total_ley || 0)),
      Math.round(+(r.total_mod || 0)),
      Math.round(+(r.total_eje || 0)),
      parseFloat(r.pct_ejecucion || 0)
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch:40 },{ wch:30 },{ wch:8 },{ wch:18 },{ wch:18 },{ wch:18 },{ wch:18 },{ wch:12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");

  const xlsxBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

  // Nombre de archivo descriptivo
  const slug = [
    nombre_entidad   ? nombre_entidad.replace(/\s+/g, "_").slice(0, 30) : "Presupuesto",
    anio             || "todos",
    tipo_presupuesto ? tipo_presupuesto.slice(0, 4).toLowerCase()       : "total"
  ].join("_");
  const filename = `${slug}.xlsx`.replace(/[^a-zA-Z0-9_.\-]/g, "_");

  return res.status(200).json({ xlsxBase64, filename, filas: rows.length });
};
