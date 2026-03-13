// Vercel serverless function — genera PPTX a partir de Excel DIPRENA
// Recibe: { codigo, excelBase64, contexto? }
// Retorna: { pptxBase64, filename }

const fs   = require("fs");
const path = require("path");

const { parseExcelDIPRENA } = require("../reports/parse_diprena");
const { generatePPTXBase64, getEntidad } = require("../reports/gen_informe");

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(n) { return Math.round(n).toLocaleString("en-US"); }

// ── Generador de narrativas con Claude API ────────────────────────────────────

async function generateNarratives(ent, data, apiKey, contexto, periodo) {
  const f   = data.funcionamiento;
  const inv = data.inversion;

  const gruposText = (f.grupos || [])
    .map(g => `  ${g.nombre}: Mod ${fmtM(g.mod)}, Dev ${fmtM(g.eje)}, ${g.pct}%`)
    .join("\n");

  const progFunText = (f.programas || []).slice(0, 8)
    .map(p => `  ${p.nombre}: Mod ${fmtM(p.mod)}, Dev ${fmtM(p.eje)}, ${p.pct}%`)
    .join("\n");

  const progInvText = inv.mod > 0
    ? (inv.programas || []).slice(0, 6)
        .map(p => `  ${p.nombre}: Mod ${fmtM(p.mod)}, Dev ${fmtM(p.eje)}, ${p.pct}%`)
        .join("\n")
    : "No aplica (entidad sin presupuesto de inversión)";

  const contextoSection = contexto
    ? `\nCONTEXTO ADICIONAL DEL ANALISTA:\n${contexto}\n`
    : "";

  // Determinar etiqueta y rango del período
  function getPeriodoInfo(p) {
    if (!p) return { label: "Cierre 2025", rango: "Enero–Diciembre 2025" };
    const { tipo, opcion, anio } = p;
    const labelsT = { T1: "T1", T2: "T2", T3: "T3", T4: "T4" };
    const labelsS = { "1S": "1er Semestre", "2S": "2do Semestre" };
    const rangos  = { T1: "Enero–Marzo", T2: "Abril–Junio", T3: "Julio–Septiembre", T4: "Octubre–Diciembre", "1S": "Enero–Junio", "2S": "Julio–Diciembre" };
    const label = tipo === "trimestral" ? `${labelsT[opcion]} ${anio}` : `${labelsS[opcion]} ${anio}`;
    return { label, rango: `${rangos[opcion] || "Enero–Diciembre"} ${anio}` };
  }
  const periodoInfo = getPeriodoInfo(periodo);

  const prompt = `Eres un analista presupuestario del MEF de Panamá. Redacta en español formal, con enfoque técnico y objetivo. Los montos son en miles de balboas (B/.).

ENTIDAD: ${ent.nombre} (${ent.siglas}) — Código ${ent.codigo}
SECTOR: ${ent.sector || "Gobierno Central"}
PERÍODO: ${periodoInfo.rango}
${contextoSection}
RESUMEN DE EJECUCIÓN:
- Total:          Ley ${fmtM(data.total.ley)}, Mod ${fmtM(data.total.mod)}, Dev ${fmtM(data.total.eje)}, Ejec ${data.total.pct}%
- Funcionamiento: Ley ${fmtM(f.ley)}, Mod ${fmtM(f.mod)}, Dev ${fmtM(f.eje)}, Ejec ${f.pct}% (${f.dist}% del total)
- Inversión:      Ley ${fmtM(inv.ley)}, Mod ${fmtM(inv.mod)}, Dev ${fmtM(inv.eje)}, Ejec ${inv.pct}% (${inv.dist}% del total)

GRUPOS DE GASTO (Funcionamiento):
${gruposText || "  No disponible"}

PROGRAMAS DE FUNCIONAMIENTO:
${progFunText || "  No disponible"}

PROGRAMAS DE INVERSIÓN:
${progInvText}

PARTIDA CRÍTICA: ${data.partidaCritica.nombre} (${data.partidaCritica.pct}%)

Devuelve ÚNICAMENTE un JSON válido, sin markdown, sin texto adicional, con exactamente esta estructura:
{
  "narrativaFun": "2-3 párrafos detallados analizando el funcionamiento del período ${periodoInfo.rango}: resumen general con montos y % total, luego análisis de cada grupo de gasto con cifras específicas (Modificado, Devengado, %), y finalmente análisis por programa con los de mayor y menor ejecución. Menciona partidas críticas y fortalezas.",
  "narrativaInv": ${inv.mod > 0 ? `"2-3 párrafos analizando la inversión del período ${periodoInfo.rango}: resumen general, análisis por programa con cifras específicas, subprogramas y proyectos destacados o rezagados, y alertas sobre ejecuciones bajas."` : "null"},
  "aspectos": [
    { "texto": "Aspecto relevante positivo o neutral con cifras específicas.", "esCritico": false },
    { "texto": "Aspecto de atención o bajo rendimiento con cifras específicas.", "esCritico": true }
  ],
  "recomendaciones": [
    "Recomendación 1 accionable y específica para la entidad basada en datos reales.",
    "Recomendación 2.",
    "Recomendación 3.",
    "Recomendación 4."
  ],
  "conclusion1": "Párrafo conclusivo sobre el desempeño general y de funcionamiento en el período ${periodoInfo.rango}, con cifras clave.",
  "conclusion2": ${inv.mod > 0 ? `"Párrafo conclusivo sobre la inversión en el período ${periodoInfo.rango}, perspectivas y áreas de mejora."` : "null"}
}
Incluye entre 3 y 4 aspectos y entre 3 y 4 recomendaciones. Sé muy específico: menciona nombres reales de grupos, programas y cifras concretas del presupuesto.`;

  console.log("[narr] Llamando Claude API para narrativas...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeout);
    console.warn("[narr] Fetch error:", fetchErr.name, fetchErr.message);
    return null;
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errText = await response.text();
    console.warn("[narr] Claude API error:", response.status, errText.slice(0, 200));
    return null;
  }

  const apiData = await response.json();
  const raw = apiData.content?.[0]?.text || "";
  console.log("[narr] Respuesta recibida, longitud:", raw.length);

  try {
    const parsed = JSON.parse(raw);
    console.log("[narr] JSON parseado OK");
    return parsed;
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        console.log("[narr] JSON extraído con regex OK");
        return parsed;
      } catch (__) {}
    }
    console.warn("[narr] Failed to parse JSON:", raw.slice(0, 300));
    return null;
  }
}

// ── AI Fallback Parser ────────────────────────────────────────────────────────
// Cuando el parser nativo no puede interpretar el formato del Excel,
// usa Claude Haiku para analizar las filas crudas y retornar datos estructurados.

async function parseExcelWithAI(filePath, apiKey) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find(n =>
      n.toLowerCase().includes("resultado") ||
      n.toLowerCase().includes("consulta")
    ) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Tomar hasta 200 filas para no exceder el contexto
  const sample = rows.slice(0, 200).map((r, i) =>
    `${i + 1}: [${r.slice(0, 9).map(c => JSON.stringify(c)).join(", ")}]`
  ).join("\n");

  const prompt = `Eres un experto en parsear exports Excel del sistema DIPRENA (MEF Panamá).
Las columnas son: [0]=Descripción, [1]=Tipo, [2]=Partida, [3]=Detalle/Nombre, [4]=Ley, [5]=Modificado, [6]=Devengado, [7]=% Ejecución, [8]=Distribución

Analiza estas filas del Excel y extrae la estructura presupuestaria:

${sample}

Retorna ÚNICAMENTE un JSON válido con esta estructura exacta (montos en miles de balboas como números):
{
  "total": { "ley": 0, "mod": 0, "eje": 0, "pct": 0 },
  "funcionamiento": {
    "ley": 0, "mod": 0, "eje": 0, "pct": 0, "dist": 0,
    "grupos": [
      { "nombre": "SERVICIOS PERSONALES", "codigo": "1", "ley": 0, "mod": 0, "eje": 0, "pct": 0 }
    ],
    "programas": [
      { "nombre": "Nombre programa", "ley": 0, "mod": 0, "eje": 0, "pct": 0 }
    ]
  },
  "inversion": {
    "ley": 0, "mod": 0, "eje": 0, "pct": 0, "dist": 0,
    "programas": [
      { "nombre": "Nombre programa", "ley": 0, "mod": 0, "eje": 0, "pct": 0, "subprogramas": [
        { "nombre": "Nombre sub", "ley": 0, "mod": 0, "eje": 0, "pct": 0 }
      ]}
    ]
  },
  "partidaCritica": { "nombre": "Grupo con menor ejecución", "pct": 0 }
}

Reglas:
- dist = porcentaje del total presupuestario (Funcionamiento + Inversión = 100%)
- Si no hay inversión, inversion.mod = 0 y programas = []
- pct = porcentaje de ejecución (0-100, entero)
- Incluye todos los grupos de gasto y programas que encuentres`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    console.warn("AI parser error:", response.status, await response.text());
    return null;
  }

  const apiData = await response.json();
  const raw = apiData.content?.[0]?.text || "";

  try {
    const parsed = JSON.parse(raw);
    // Agregar colores a grupos si no los tiene
    const DONUT_COLORS = ["1B2F4E","2E5F96","5B93C7","A8C8E8","7AA5C8","4B7FAE","C0D8EE","8BAED4"];
    const totalModFun = parsed.funcionamiento?.mod || 1;
    if (parsed.funcionamiento?.grupos) {
      parsed.funcionamiento.grupos = parsed.funcionamiento.grupos.map((g, i) => ({
        ...g,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        distPct: totalModFun > 0 ? Math.round((g.mod / totalModFun) * 100) : 0
      }));
    }
    // Asegurar subprogramas en programas de inversión
    if (parsed.inversion?.programas) {
      parsed.inversion.programas = parsed.inversion.programas.map(p => ({
        ...p,
        subprogramas: p.subprogramas || []
      }));
    }
    return parsed;
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (__) {}
    }
    console.warn("AI parser failed to parse JSON:", raw.slice(0, 200));
    return null;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { codigo, excelBase64, contexto, extraSlides, periodo } = req.body || {};

  if (!codigo || !excelBase64) {
    return res.status(400).json({ error: "codigo y excelBase64 son requeridos" });
  }

  // Buscar entidad en catálogo
  const entRaw = getEntidad(codigo);
  if (!entRaw) {
    return res.status(404).json({ error: `Entidad ${codigo} no encontrada en el catálogo` });
  }
  const ent = { codigo, ...entRaw };

  // Guardar Excel en /tmp (se borra después del parse + fallback IA)
  const tmpPath = path.join("/tmp", `diprena_${Date.now()}.xlsx`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(excelBase64, "base64"));
  } catch (e) {
    return res.status(500).json({ error: `No se pudo guardar el archivo temporal: ${e.message}` });
  }

  const apiKey = process.env.ANTHROPIC_KEY;

  let data;
  try {
    data = parseExcelDIPRENA(tmpPath);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return res.status(422).json({ error: `Error al parsear el Excel: ${e.message}` });
  }

  // ── Fallback IA: si el parser nativo no extrajo datos, usar Claude ──────────
  if (data.total.mod === 0 && apiKey) {
    console.log("Parser nativo retornó 0 — intentando fallback con IA...");
    try {
      const aiData = await parseExcelWithAI(tmpPath, apiKey);
      if (aiData && aiData.total && aiData.total.mod > 0) {
        console.log("Fallback IA exitoso:", JSON.stringify({ total: aiData.total, grupos: aiData.funcionamiento?.grupos?.length }));
        data = {
          total:          aiData.total          || data.total,
          funcionamiento: aiData.funcionamiento || data.funcionamiento,
          inversion:      aiData.inversion      || data.inversion,
          partidaCritica: aiData.partidaCritica  || data.partidaCritica
        };
      }
    } catch (e) {
      console.warn("AI fallback error:", e.message);
    }
  }

  // Borrar archivo temporal
  try { fs.unlinkSync(tmpPath); } catch (_) {}

  // Generar narrativas con Claude (silencia si falla — usa plantillas de fallback)
  let narr = null;
  let narrError = null;
  if (!apiKey) {
    console.warn("ANTHROPIC_KEY no configurada — narrativas IA no disponibles");
    narrError = "ANTHROPIC_KEY no configurada en el servidor";
  } else {
    try {
      narr = await generateNarratives(ent, data, apiKey, contexto || null, periodo || null);
      if (!narr) narrError = "Claude no retornó JSON válido";
    } catch (e) {
      console.warn("Error generando narrativas:", e.message);
      narrError = e.message;
    }
  }

  let pptxBase64;
  try {
    pptxBase64 = await generatePPTXBase64(ent, data, narr, extraSlides || [], periodo || null);
  } catch (e) {
    return res.status(500).json({ error: `Error al generar el PPTX: ${e.message}` });
  }

  const periodoSlug = periodo
    ? `${periodo.opcion}_${periodo.anio}`.replace(/[^a-zA-Z0-9]/g, "_")
    : "Cierre2025";
  const outFilename = `${ent.siglas.replace(/[^a-zA-Z0-9]/g, "_")}_${periodoSlug}.pptx`;

  // Construir preview por slide para mostrar en la UI antes de descargar
  const hasInv = data.inversion.mod > 0;
  const preview = {
    entidad: ent.nombre,
    siglas: ent.siglas,
    objetivo: ent.objetivo || null,
    slides: [
      {
        num: 1,
        type: "portada",
        titulo: "Portada / Resumen Ejecutivo",
        kpis: {
          total: { pct: data.total.pct, eje: fmtM(data.total.eje), mod: fmtM(data.total.mod), ley: fmtM(data.total.ley) },
          fun:   { pct: data.funcionamiento.pct, eje: fmtM(data.funcionamiento.eje), mod: fmtM(data.funcionamiento.mod), ley: fmtM(data.funcionamiento.ley), dist: data.funcionamiento.dist },
          inv:   { pct: data.inversion.pct, eje: fmtM(data.inversion.eje), mod: fmtM(data.inversion.mod), ley: fmtM(data.inversion.ley), dist: data.inversion.dist }
        }
      },
      {
        num: 2,
        type: "funcionamiento",
        titulo: "Funcionamiento — Grupos y Programas",
        narrativa: narr?.narrativaFun || `Funcionamiento: B/. ${fmtM(data.funcionamiento.eje)} miles devengados (${data.funcionamiento.pct}%).`,
        grupos: (data.funcionamiento.grupos || []).slice(0, 5).map(g => ({ nombre: g.nombre, pct: g.pct, distPct: g.distPct || 0, color: g.color || "1B2F4E" })),
        programas: (data.funcionamiento.programas || []).slice(0, 6).map(p => ({ nombre: p.nombre, pct: p.pct }))
      },
      ...(hasInv ? [{
        num: 3,
        type: "inversion",
        titulo: "Inversión — Programas y Subprogramas",
        narrativa: narr?.narrativaInv || `Inversión: B/. ${fmtM(data.inversion.eje)} miles devengados (${data.inversion.pct}%).`,
        programas: (data.inversion.programas || []).slice(0, 6).map(p => ({ nombre: p.nombre, pct: p.pct }))
      }] : []),
      {
        num: hasInv ? 4 : 3,
        type: "conclusiones",
        titulo: "Resumen Ejecutivo y Conclusiones",
        kpis: {
          total:   { pct: data.total.pct,           eje: fmtM(data.total.eje) },
          fun:     { pct: data.funcionamiento.pct,  eje: fmtM(data.funcionamiento.eje) },
          inv:     { pct: data.inversion.pct,        eje: fmtM(data.inversion.eje) },
          critica: { nombre: data.partidaCritica.nombre, pct: data.partidaCritica.pct }
        },
        aspectos: narr?.aspectos
          ? narr.aspectos.slice(0, 4)
          : [
              { texto: `Ejecución total del ${data.total.pct}% con B/. ${fmtM(data.total.eje)} miles devengados sobre B/. ${fmtM(data.total.mod)} modificados.`, esCritico: false },
              { texto: `Funcionamiento (${data.funcionamiento.dist}% del total) ejecutó ${data.funcionamiento.pct}%.`, esCritico: data.funcionamiento.pct < 60 },
              ...(data.inversion.mod > 0 ? [{ texto: `Inversión (${data.inversion.dist}% del total) ejecutó ${data.inversion.pct}%.`, esCritico: data.inversion.pct < 60 }] : []),
              { texto: `Partida crítica: ${data.partidaCritica.nombre} con ${data.partidaCritica.pct}% de ejecución.`, esCritico: data.partidaCritica.pct < 60 }
            ],
        recomendaciones: narr?.recomendaciones
          ? narr.recomendaciones.slice(0, 4)
          : [
              `Revisar asignaciones de ${data.partidaCritica.nombre} (${data.partidaCritica.pct}%) e identificar partidas sin ejecución para redistribución oportuna.`,
              `Implementar seguimiento quincenal de ejecución por programa para detectar rezagos a tiempo.`,
              `Fortalecer la coordinación entre unidades ejecutoras para acelerar compromisos presupuestarios pendientes.`,
              `Realizar evaluación de metas físicas vs. financieras para asegurar coherencia en la ejecución.`
            ],
        conclusion1: narr?.conclusion1 || `${ent.nombre} registró una ejecución presupuestaria del ${data.total.pct}% al cierre del período, con B/. ${fmtM(data.total.eje)} miles devengados de B/. ${fmtM(data.total.mod)} miles modificados. El componente de funcionamiento alcanzó ${data.funcionamiento.pct}%.`,
        conclusion2: narr?.conclusion2 || (hasInv ? `La inversión representó el ${data.inversion.dist}% del presupuesto total, con una ejecución del ${data.inversion.pct}%, totalizando B/. ${fmtM(data.inversion.eje)} miles devengados.` : null)
      },
      ...(extraSlides || []).map((s, i) => ({
        num: (hasInv ? 5 : 4) + i,
        titulo: s.titulo || "Slide Adicional",
        secciones: (s.secciones || []).map(sec => sec.titulo)
      }))
    ]
  };

  return res.status(200).json({ pptxBase64, filename: outFilename, aiNarratives: !!narr, narrError: narrError || null, preview });
};
