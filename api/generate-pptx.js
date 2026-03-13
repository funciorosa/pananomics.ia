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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn("Claude API error:", response.status, errText);
    return null;
  }

  const apiData = await response.json();
  const raw = apiData.content?.[0]?.text || "";

  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (__) {}
    }
    console.warn("Failed to parse Claude JSON:", raw.slice(0, 300));
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

  // Guardar Excel en /tmp para parseExcelDIPRENA
  const tmpPath = path.join("/tmp", `diprena_${Date.now()}.xlsx`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(excelBase64, "base64"));
  } catch (e) {
    return res.status(500).json({ error: `No se pudo guardar el archivo temporal: ${e.message}` });
  }

  let data;
  try {
    data = parseExcelDIPRENA(tmpPath);
  } catch (e) {
    return res.status(422).json({ error: `Error al parsear el Excel: ${e.message}` });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }

  // Generar narrativas con Claude (silencia si falla — usa plantillas de fallback)
  const apiKey = process.env.ANTHROPIC_KEY;
  let narr = null;
  if (apiKey) {
    try {
      narr = await generateNarratives(ent, data, apiKey, contexto || null, periodo || null);
    } catch (e) {
      console.warn("Error generando narrativas:", e.message);
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
    slides: [
      {
        num: 1,
        titulo: "Portada / Resumen Ejecutivo",
        kpis: {
          total: { pct: data.total.pct, eje: fmtM(data.total.eje), mod: fmtM(data.total.mod) },
          fun:   { pct: data.funcionamiento.pct, eje: fmtM(data.funcionamiento.eje), dist: data.funcionamiento.dist },
          inv:   { pct: data.inversion.pct, eje: fmtM(data.inversion.eje), dist: data.inversion.dist }
        }
      },
      {
        num: 2,
        titulo: "Funcionamiento — Grupos y Programas",
        narrativa: narr?.narrativaFun || `Funcionamiento: B/. ${fmtM(data.funcionamiento.eje)} miles devengados (${data.funcionamiento.pct}%).`,
        grupos: (data.funcionamiento.grupos || []).slice(0, 4).map(g => ({ nombre: g.nombre, pct: g.pct }))
      },
      ...(hasInv ? [{
        num: 3,
        titulo: "Inversión — Programas y Subprogramas",
        narrativa: narr?.narrativaInv || `Inversión: B/. ${fmtM(data.inversion.eje)} miles devengados (${data.inversion.pct}%).`,
        programas: (data.inversion.programas || []).slice(0, 4).map(p => ({ nombre: p.nombre, pct: p.pct }))
      }] : []),
      {
        num: hasInv ? 4 : 3,
        titulo: "Resumen Ejecutivo y Conclusiones",
        aspectos: narr?.aspectos ? narr.aspectos.slice(0, 4).map(a => a.texto) : [],
        recomendaciones: narr?.recomendaciones ? narr.recomendaciones.slice(0, 4) : []
      },
      ...(extraSlides || []).map((s, i) => ({
        num: (hasInv ? 5 : 4) + i,
        titulo: s.titulo || "Slide Adicional",
        secciones: (s.secciones || []).map(sec => sec.titulo)
      }))
    ]
  };

  return res.status(200).json({ pptxBase64, filename: outFilename, aiNarratives: !!narr, preview });
};
