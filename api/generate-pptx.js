// Vercel serverless function — genera PPTX a partir de Excel DIPRENA
// Recibe: { codigo, excelBase64, filename }
// Retorna: { pptxBase64, filename }

const fs   = require("fs");
const path = require("path");

const { parseExcelDIPRENA } = require("../reports/parse_diprena");
const { generatePPTXBase64, getEntidad } = require("../reports/gen_informe");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { codigo, excelBase64, filename } = req.body || {};

  if (!codigo || !excelBase64) {
    return res.status(400).json({ error: "codigo y excelBase64 son requeridos" });
  }

  // Buscar entidad en catálogo
  const entRaw = getEntidad(codigo);
  if (!entRaw) {
    return res.status(404).json({ error: `Entidad ${codigo} no encontrada en el catálogo` });
  }
  const ent = { codigo, ...entRaw };

  // Guardar Excel en /tmp para que parseExcelDIPRENA pueda leerlo
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
    fs.unlinkSync(tmpPath);
    return res.status(422).json({ error: `Error al parsear el Excel: ${e.message}` });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }

  let pptxBase64;
  try {
    pptxBase64 = await generatePPTXBase64(ent, data);
  } catch (e) {
    return res.status(500).json({ error: `Error al generar el PPTX: ${e.message}` });
  }

  const outFilename = `${ent.siglas.replace(/[^a-zA-Z0-9]/g, "_")}_Cierre2025.pptx`;
  return res.status(200).json({ pptxBase64, filename: outFilename });
};
