/**
 * parse_diprena.js
 * Parser del export Excel del sistema DIPRENA (MEF Panamá).
 *
 * Hoja esperada: "Resultado consulta" (~167 filas × 9 columnas)
 *
 * Col 0: Descripción General (sección)
 * Col 1: Tipo Presupuesto  → A=Total, B=Funcionamiento, C=Inversión,
 *                            1-9=Grupo de gasto (bajo Funcionamiento)
 * Col 2: Partida           → PROGRAMA | Sub. Programa | Proyecto
 * Col 3: Detalle (nombre)
 * Col 4: Presupuesto Ley
 * Col 5: Presupuesto Modificado
 * Col 6: Devengado
 * Col 7: % Ejecución Anual
 * Col 8: Distribución (%)
 *
 * Retorna un objeto estructurado listo para gen_informe.js.
 */

const XLSX = require("xlsx");

const DONUT_COLORS = [
  "1B2F4E", "2E5F96", "5B93C7", "A8C8E8",
  "7AA5C8", "4B7FAE", "C0D8EE", "8BAED4"
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(/[,\s]/g, "")) || 0;
  return 0;
}

function toPct(v) {
  if (typeof v === "number") {
    // Puede venir como decimal (0.85) o entero (85)
    return v <= 1 && v > 0 ? Math.round(v * 100) : Math.round(v);
  }
  if (typeof v === "string") {
    const s = v.replace(/[%\s]/g, "");
    const n = parseFloat(s);
    if (isNaN(n)) return 0;
    return n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
  }
  return 0;
}

// ── Parser principal ─────────────────────────────────────────────────────────

function parseExcelDIPRENA(filePath) {
  const wb = XLSX.readFile(filePath);

  // Buscar hoja "Resultado consulta" (o la primera disponible)
  const sheetName =
    wb.SheetNames.find(n =>
      n.toLowerCase().includes("resultado") ||
      n.toLowerCase().includes("consulta")
    ) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let total          = null;
  let funcionamiento = null;
  let inversion      = null;
  const gruposFun    = [];
  const programasFun = [];
  const programasInv = [];

  let currentSection = null; // "total" | "funcionamiento" | "inversion"
  let currentProgInv = null; // programa de inversión activo (para subprogramas)

  for (const row of rows) {
    const tipo      = String(row[1] || "").trim();
    const tipoUp    = tipo.toUpperCase();
    const partida   = String(row[2] || "").trim().toUpperCase();
    const detalle   = String(row[3] || "").trim();

    const ley    = toNum(row[4]);
    const mod    = toNum(row[5]);
    const eje    = toNum(row[6]);
    const ejePct = toPct(row[7]);
    const dist   = toPct(row[8]);

    // Fila vacía → ignorar
    if (!tipo && !partida && !detalle && ley === 0 && mod === 0) continue;

    // ── Marcadores de sección principal (col 1) ──────────────────────────
    if (tipoUp === "A") {
      total = { ley, mod, eje, pct: ejePct, dist: 100 };
      currentSection = "total";
      continue;
    }
    if (tipoUp === "B") {
      funcionamiento = { ley, mod, eje, pct: ejePct, dist, grupos: [], programas: [] };
      currentSection = "funcionamiento";
      continue;
    }
    if (tipoUp === "C") {
      inversion = { ley, mod, eje, pct: ejePct, dist, programas: [] };
      currentSection = "inversion";
      currentProgInv = null;
      continue;
    }

    // ── Grupos de gasto (dígito único en col1, sin Partida) ──────────────
    // Bajo Funcionamiento: "1" = Serv. Personales, "2" = Serv. No Pers., etc.
    if (
      currentSection === "funcionamiento" &&
      /^\d$/.test(tipo) &&
      !partida
    ) {
      gruposFun.push({
        nombre:  detalle || `Grupo ${tipo}`,
        codigo:  tipo,
        ley, mod, eje,
        pct:     ejePct,
        dist
      });
      continue;
    }

    // ── Programas (col2 = PROGRAMA) ───────────────────────────────────────
    if (partida === "PROGRAMA") {
      if (currentSection === "funcionamiento") {
        programasFun.push({ nombre: detalle, ley, mod, eje, pct: ejePct });
      } else if (currentSection === "inversion") {
        currentProgInv = { nombre: detalle, ley, mod, eje, pct: ejePct, subprogramas: [] };
        programasInv.push(currentProgInv);
      }
      continue;
    }

    // ── Subprogramas (col2 starts with "SUB") ────────────────────────────
    if (partida.startsWith("SUB") && currentSection === "inversion" && currentProgInv) {
      currentProgInv.subprogramas.push({ nombre: detalle, ley, mod, eje, pct: ejePct });
      continue;
    }
  }

  // ── Post-proceso: calcular distribución de grupos (% del Modificado total) ─
  const totalModFun = funcionamiento ? (funcionamiento.mod || 1) : 1;
  const gruposFinales = gruposFun.map((g, i) => ({
    ...g,
    color:   DONUT_COLORS[i % DONUT_COLORS.length],
    distPct: totalModFun > 0 ? Math.round((g.mod / totalModFun) * 100) : 0
  }));

  if (funcionamiento) {
    funcionamiento.grupos   = gruposFinales;
    funcionamiento.programas = programasFun;
  }
  if (inversion) {
    inversion.programas = programasInv;
  }

  // ── Partida crítica: grupo con menor % de ejecución (con presupuesto > 0) ─
  const gruposActivos = gruposFinales.filter(g => g.mod > 0);
  let partidaCritica = { nombre: "—", pct: 100 };
  if (gruposActivos.length > 0) {
    const worst = gruposActivos.reduce((a, b) => (a.pct < b.pct ? a : b));
    partidaCritica = { nombre: worst.nombre, pct: worst.pct };
  }

  // ── Valores seguros si no se encontraron secciones ───────────────────────
  return {
    total:          total          || { ley: 0, mod: 0, eje: 0, pct: 0, dist: 100 },
    funcionamiento: funcionamiento || { ley: 0, mod: 0, eje: 0, pct: 0, dist: 0, grupos: [], programas: [] },
    inversion:      inversion      || { ley: 0, mod: 0, eje: 0, pct: 0, dist: 0, programas: [] },
    partidaCritica
  };
}

module.exports = { parseExcelDIPRENA };
