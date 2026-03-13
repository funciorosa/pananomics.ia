// Vercel serverless function — genera Word (.docx) desde datos de presupuesto
// Recibe: { fuente_ingreso, nombre_entidad, anio, tipo_presupuesto, nombre_programa }
// Retorna: { docxBase64, filename, filas }

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType
} = require("docx");

const SUPABASE_URL = "https://eyxgyeybvokvrkrarmzh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eGd5ZXlidm9rdnJrcmFybXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI5MTksImV4cCI6MjA4ODgwODkxOX0.gE49fWx6FbHjAka3YisRYY7pWhq5Q1P5hhPIYI2ZupE";

function fmt(n) { return Math.round(+n || 0).toLocaleString("en-US"); }

function cell(text, opts = {}) {
  const { bold = false, header = false, align = AlignmentType.LEFT } = opts;
  return new TableCell({
    shading: header ? { type: ShadingType.SOLID, color: "1B2F4E", fill: "1B2F4E" } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({
        text: String(text),
        bold,
        size: header ? 18 : 17,
        color: header ? "FFFFFF" : "333333",
        font: "Calibri"
      })]
    })]
  });
}

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
    return res.status(200).json({ docxBase64: null, filas: 0, message: "Sin resultados para los filtros indicados." });
  }

  // Construir filtros descriptos
  const filtros = [
    nombre_entidad   && `Entidad: ${nombre_entidad}`,
    fuente_ingreso   && `Fuente: ${fuente_ingreso}`,
    anio             && `Año: ${anio}`,
    tipo_presupuesto && `Tipo: ${tipo_presupuesto}`,
    nombre_programa  && `Programa: ${nombre_programa}`
  ].filter(Boolean).join("  ·  ") || "Todos los registros";

  const fechaHoy = new Date().toLocaleDateString("es-PA", { day:"2-digit", month:"long", year:"numeric" });

  // Encabezados de tabla
  const headers = ["Entidad", "Fuente de Ingreso", "Año", "Tipo", "Ley (B/.)", "Modificado (B/.)", "Devengado (B/.)", "% Ejec."];
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => cell(h, { bold: true, header: true, align: AlignmentType.CENTER }))
  });

  const dataRows = rows.map(r => new TableRow({
    children: [
      cell(r.nombre_entidad   || ""),
      cell(r.fuente_ingreso   || ""),
      cell(r.anio             || "", { align: AlignmentType.CENTER }),
      cell(r.tipo_presupuesto || "", { align: AlignmentType.CENTER }),
      cell(fmt(r.total_ley),    { align: AlignmentType.RIGHT }),
      cell(fmt(r.total_mod),    { align: AlignmentType.RIGHT }),
      cell(fmt(r.total_eje),    { align: AlignmentType.RIGHT }),
      cell(`${parseFloat(r.pct_ejecucion || 0).toFixed(1)}%`, { align: AlignmentType.CENTER })
    ]
  }));

  const doc = new Document({
    creator: "PANANOMICS.IA — DIPRENA",
    title:   "Informe de Ejecución Presupuestaria",
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "Informe de Ejecución Presupuestaria", bold: true, size: 32, color: "1B2F4E", font: "Calibri" })]
        }),
        new Paragraph({
          children: [new TextRun({ text: "Dirección de Presupuesto de la Nación · MEF Panamá", size: 20, color: "5A6E85", font: "Calibri" })]
        }),
        new Paragraph({
          children: [new TextRun({ text: `Período: Enero – Diciembre 2025  ·  Generado: ${fechaHoy}`, size: 18, color: "5A6E85", font: "Calibri" })]
        }),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        new Paragraph({
          children: [
            new TextRun({ text: "Filtros aplicados: ", bold: true, size: 19, font: "Calibri", color: "333333" }),
            new TextRun({ text: filtros, size: 19, font: "Calibri", color: "333333" })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Total de registros: `, bold: true, size: 19, font: "Calibri", color: "333333" }),
            new TextRun({ text: String(rows.length), size: 19, font: "Calibri", color: "1B2F4E", bold: true })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
          borders: {
            top:            { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" },
            bottom:         { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" },
            left:           { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" },
            right:          { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" },
            insideH:        { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" },
            insideV:        { style: BorderStyle.SINGLE, size: 1, color: "C8D8EE" }
          }
        }),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
        new Paragraph({
          children: [new TextRun({ text: "Fuente: Dirección de Presupuesto de la Nación · PANANOMICS.IA", size: 16, color: "AAAAAA", font: "Calibri" })]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const docxBase64 = buffer.toString("base64");

  const slug = [
    nombre_entidad   ? nombre_entidad.replace(/\s+/g, "_").slice(0, 30) : "Presupuesto",
    anio             || "todos",
    tipo_presupuesto ? tipo_presupuesto.slice(0, 4).toLowerCase()       : "total"
  ].join("_");
  const filename = `${slug}.docx`.replace(/[^a-zA-Z0-9_.\-]/g, "_");

  return res.status(200).json({ docxBase64, filename, filas: rows.length });
};
