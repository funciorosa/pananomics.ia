/**
 * parse_diprena.js
 * Parser universal del export Excel del sistema DIPRENA (MEF Panamá).
 *
 * Soporta dos formatos de export:
 *
 * Formato 1 (MIVIOT-style):
 *   Col 1: "A" / "B" / "C" (letra sola), grupos = dígito "1"-"9"
 *
 * Formato 2 (MIAMBIENTE-style):
 *   Col 1: "A-Total" / "B-Funcionamiento" / "C-Inversión"
 *   Grupos = "GRUPO DE GASTO" en col 1
 *   Re-marcadores de sección en col 3: " FUNCIONAMIENTO" / " INVERSION"
 *
 * Hoja esperada: "Resultado consulta" (~167 filas × 9 columnas)
 * Col 0: Descripción General
 * Col 1: Tipo Presupuesto
 * Col 2: Partida  → PROGRAMA | Sub. Programa | Proyecto
 * Col 3: Detalle (nombre)
 * Col 4: Presupuesto Ley
 * Col 5: Presupuesto Modificado
 * Col 6: Devengado
 * Col 7: % Ejecución Anual
 * Col 8: Distribución (%)
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
    const detalleUp = detalle.toUpperCase();

    const ley    = toNum(row[4]);
    const mod    = toNum(row[5]);
    const eje    = toNum(row[6]);
    const ejePct = toPct(row[7]);
    const dist   = toPct(row[8]);

    // Fila vacía → ignorar
    if (!tipo && !partida && !detalle && ley === 0 && mod === 0) continue;

    // ── Marcadores de sección principal (col 1) ──────────────────────────
    // Formato 1: "A" / "B" / "C"
    // Formato 2: "A-TOTAL" / "B-FUNCIONAMIENTO" / "C-INVERSIÓN"
    if (tipoUp === "A" || tipoUp.startsWith("A-") || tipoUp.startsWith("A ")) {
      total = { ley, mod, eje, pct: ejePct, dist: 100 };
      currentSection = "total";
      continue;
    }
    if (tipoUp === "B" || tipoUp.startsWith("B-") || tipoUp.startsWith("B ")) {
      funcionamiento = { ley, mod, eje, pct: ejePct, dist, grupos: [], programas: [] };
      currentSection = "funcionamiento";
      continue;
    }
    if (tipoUp === "C" || tipoUp.startsWith("C-") || tipoUp.startsWith("C ")) {
      inversion = { ley, mod, eje, pct: ejePct, dist, programas: [] };
      currentSection = "inversion";
      currentProgInv = null;
      continue;
    }

    // ── Re-marcadores de sección via col1 (Formato 2) ────────────────────
    // Ej: col1 = "FUNCIONAMIENTO" con partida vacía (fila 4 del MIAMBIENTE)
    if (tipoUp === "FUNCIONAMIENTO" && !partida) {
      if (!funcionamiento) {
        funcionamiento = { ley, mod, eje, pct: ejePct, dist, grupos: [], programas: [] };
      }
      currentSection = "funcionamiento";
      continue;
    }
    if ((tipoUp === "INVERSION" || tipoUp === "INVERSIÓN") && !partida) {
      if (!inversion) {
        inversion = { ley, mod, eje, pct: ejePct, dist, programas: [] };
      }
      currentSection = "inversion";
      currentProgInv = null;
      continue;
    }

    // ── Re-marcadores de sección via col3/detalle (Formato 2, rows 107/112) ─
    // col1 tiene código de partida (ej "027.0"), col3 tiene " FUNCIONAMIENTO"
    if (!partida && (detalleUp === "FUNCIONAMIENTO" || detalleUp === " FUNCIONAMIENTO")) {
      currentSection = "funcionamiento";
      continue;
    }
    if (!partida && (detalleUp === "INVERSION" || detalleUp === "INVERSIÓN" ||
                     detalleUp === " INVERSION" || detalleUp === " INVERSIÓN")) {
      currentSection = "inversion";
      currentProgInv = null;
      continue;
    }

    // ── Grupos de gasto ───────────────────────────────────────────────────
    // Formato 1: dígito único en col1, sin Partida
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

    // Formato 2: col1 = "GRUPO DE GASTO"
    if (
      currentSection === "funcionamiento" &&
      tipoUp === "GRUPO DE GASTO" &&
      detalle
    ) {
      gruposFun.push({
        nombre:  detalle,
        codigo:  String(gruposFun.length + 1),
        ley, mod, eje,
        pct:     ejePct,
        dist
      });
      continue;
    }

    // ── Programas (col2 = PROGRAMA) ───────────────────────────────────────
    if (partida === "PROGRAMA") {
      const nombreLimpio = detalle.trim();
      if (currentSection === "funcionamiento") {
        programasFun.push({ nombre: nombreLimpio, ley, mod, eje, pct: ejePct });
      } else if (currentSection === "inversion") {
        currentProgInv = { nombre: nombreLimpio, ley, mod, eje, pct: ejePct, subprogramas: [] };
        programasInv.push(currentProgInv);
      }
      continue;
    }

    // ── Subprogramas (col2 starts with "SUB") ────────────────────────────
    // Formato 1: "SUB. PROGRAMA"
    // Formato 2: "SUB. PROGRAMA" también
    if (partida.startsWith("SUB") && currentSection === "inversion" && currentProgInv) {
      currentProgInv.subprogramas.push({ nombre: detalle.trim(), ley, mod, eje, pct: ejePct });
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
    funcionamiento.grupos    = gruposFinales;
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
