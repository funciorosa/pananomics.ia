const fs   = require("fs");
const path = require("path");

// ── CATÁLOGO DE ENTIDADES ────────────────────────────────────────────────────
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "objetivos_catalog.json"), "utf-8"));
function getEntidad(codigo) {
  return catalog[String(codigo).padStart(3, "0")] || null;
}

// ── PARSER DEL EXCEL ─────────────────────────────────────────────────────────
const { parseExcelDIPRENA } = require("./parse_diprena");

const pptxgen = require("pptxgenjs");

// ── PALETA ───────────────────────────────────────────────────────────────────
const NAV  = "1B2F4E";
const NAV2 = "142240";
const NAV3 = "243F65";
const ICE  = "EEF4FF";
const BDR  = "C8D8EE";
const GRY  = "EEF2F8";
const WHT  = "FFFFFF";
const TXT  = "333333";
const MUT  = "5A6E85";

// ── HELPERS GLOBALES ─────────────────────────────────────────────────────────

/** Semáforo: verde ≥80%, amarillo 60-79%, rojo <60% */
function sColor(pct) {
  if (pct >= 80) return { bg: "C8F0D8", fg: "0F5E2F" };
  if (pct >= 60) return { bg: "FFE8B0", fg: "7A4800" };
  return { bg: "FFD0D0", fg: "7A1010" };
}

/** Formatear número como miles con separador de miles */
function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

/** Calcular % de ejecución — usa p.pct si válido, sino calcula desde eje/mod */
function calcPct(p) {
  if (p.pct != null && p.pct > 0) return p.pct;
  if (p.mod > 0) return Math.round((p.eje / p.mod) * 100);
  return 0;
}

/** Abreviar nombre para gráficos */
function short(name, maxLen = 18) {
  if (!name) return "";
  return name.length > maxLen ? name.substring(0, maxLen - 1) + "…" : name;
}

/** Sanear texto AI para evitar caracteres inválidos en XML/PPTX */
function sanitize(s) {
  if (typeof s !== "string") return s;
  return s
    // Normalizar saltos de línea
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    // Normalizar puntuación tipográfica Unicode → ASCII equivalente
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")   // comillas simples
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')   // comillas dobles
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")               // guiones/dashes
    .replace(/[\u2026]/g, "...")                                // elipsis
    .replace(/[\u00A0\u202F\u2007\u2060]/g, " ")               // espacios especiales
    .replace(/\u2022/g, "-")                                    // bullet • → -
    .replace(/[\u2010\u2011]/g, "-")                           // hyphens especiales
    // Eliminar caracteres inválidos en XML 1.0
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\x80-\x9F]/g, "")                               // C1 control chars
    .replace(/[\uD800-\uDFFF]/g, "")                           // surrogates
    .replace(/[\uFDD0-\uFDEF]/g, "")                           // non-characters Unicode
    .replace(/[\uFEFF\uFFFE\uFFFF]/g, "")                      // BOM y non-chars
    .replace(/[\u200B-\u200D\u2028\u2029]/g, "")               // zero-width y separadores
    .trim();
}

/** Convierte texto plano con \n en array de text objects para pptxgenjs 3.x.
 *  breakLine:true va en el ítem ANTERIOR al salto (formato correcto de pptxgenjs). */
function narrativeToPptx(text, opts = {}) {
  if (!text || typeof text !== "string") return [{ text: "" }];
  const clean = sanitize(text);
  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [{ text: "" }];
  return lines.map((line, i) => {
    const o = Object.keys(opts).length ? { ...opts } : undefined;
    if (i < lines.length - 1) {
      return { text: line, options: { ...(o || {}), breakLine: true } };
    }
    return o ? { text: line, options: o } : { text: line };
  });
}

/** Etiqueta corta del período para header — ej: "T1 2025", "1er Sem. 2026" */
function periodoLabel(periodo) {
  if (!periodo) return "Cierre 2025";
  const { tipo, opcion, anio } = periodo;
  if (tipo === "trimestral") {
    const nombres = { T1: "T1", T2: "T2", T3: "T3", T4: "T4" };
    return `${nombres[opcion] || opcion} ${anio}`;
  }
  if (tipo === "semestral") {
    return `${opcion === "1S" ? "1er Sem." : "2do Sem."} ${anio}`;
  }
  return "Cierre 2025";
}

/** Rango de meses del período para footer — ej: "Enero – Marzo 2025" */
function periodoRango(periodo) {
  if (!periodo) return "Enero – Diciembre 2025";
  const { opcion, anio } = periodo || {};
  const rangos = {
    T1: "Enero – Marzo", T2: "Abril – Junio",
    T3: "Julio – Septiembre", T4: "Octubre – Diciembre",
    "1S": "Enero – Junio", "2S": "Julio – Diciembre"
  };
  return `${rangos[opcion] || "Enero – Diciembre"} ${anio || 2025}`;
}

/** Nombre largo del período para narrativas — ej: "Primer Trimestre 2025" */
function periodoNombre(periodo) {
  if (!periodo) return "Cierre Enero–Diciembre 2025";
  const { tipo, opcion, anio } = periodo;
  const nombresT = { T1: "Primer Trimestre", T2: "Segundo Trimestre", T3: "Tercer Trimestre", T4: "Cuarto Trimestre" };
  const nombresS = { "1S": "Primer Semestre", "2S": "Segundo Semestre" };
  if (tipo === "trimestral") return `${nombresT[opcion] || opcion} ${anio}`;
  if (tipo === "semestral") return `${nombresS[opcion] || opcion} ${anio}`;
  return "Cierre 2025";
}

// ── COMPONENTES DE LAYOUT ────────────────────────────────────────────────────

function addHeader(pres, slide, opts = {}) {
  const { code, name, subtitle, period = "Cierre 2025" } = opts;

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.7,
    fill: { color: NAV }, line: { color: NAV }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 7.8, y: 0, w: 2.2, h: 0.7,
    fill: { color: NAV2 }, line: { color: NAV2 }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 7.8, y: 0.05, w: 0.012, h: 0.6,
    fill: { color: "3A5070" }, line: { color: "3A5070" }
  });

  if (code) {
    slide.addText(code, {
      x: 0.18, y: 0.07, w: 7.5, h: 0.3,
      fontSize: 13, bold: true, color: WHT, fontFace: "Arial", margin: 0
    });
    slide.addText(name, {
      x: 0.18, y: 0.37, w: 7.5, h: 0.25,
      fontSize: 7, color: "99B5CC", fontFace: "Arial",
      charSpacing: 1, margin: 0
    });
  } else {
    slide.addText(subtitle ? subtitle.toUpperCase() : "", {
      x: 0.18, y: 0.04, w: 7.5, h: 0.32,
      fontSize: 10, bold: true, color: WHT, fontFace: "Arial", margin: 0
    });
    if (subtitle) {
      slide.addText(name, {
        x: 0.18, y: 0.37, w: 7.5, h: 0.25,
        fontSize: 7.5, color: "88AACC", fontFace: "Arial", margin: 0
      });
    }
  }

  slide.addText("Ejecución Presupuestaria", {
    x: 7.82, y: 0.06, w: 2.15, h: 0.2,
    fontSize: 6, color: "88AACC", fontFace: "Arial",
    align: "right", margin: 0
  });
  slide.addText(period, {
    x: 7.82, y: 0.26, w: 2.15, h: 0.36,
    fontSize: 13, bold: true, color: WHT, fontFace: "Arial",
    align: "right", margin: 0
  });
}

function addFooter(pres, slide, entity = "Dirección de Presupuesto de la Nación", periodo = null) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.47, w: 10, h: 0.04,
    fill: { color: NAV }, line: { color: NAV }
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.51, w: 10, h: 0.115,
    fill: { color: GRY }, line: { color: GRY }
  });
  const items = [
    `● Período: ${periodoRango(periodo)}`,
    "● Fuente: Dirección de Presupuesto de la Nación",
    `● ${entity}`
  ];
  items.forEach((txt, i) => {
    slide.addText(txt, {
      x: 0.15 + i * 3.28, y: 5.51, w: 3.2, h: 0.115,
      fontSize: 6, color: MUT, fontFace: "Arial",
      align: i === 0 ? "left" : i === 1 ? "center" : "right", margin: 0
    });
  });
}

function addPanelBox(pres, slide, x, y, w, h, opts = {}) {
  const { bg = WHT, border = BDR } = opts;
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: bg },
    line: { color: border, pt: 0.5 },
    shadow: { type: "outer", blur: 3, offset: 1, angle: 135, color: "000000", opacity: 0.06 }
  });
}

function addPanelTitle(pres, slide, x, y, w, label) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: x + 0.07, y: y + 0.08, w: 0.1, h: 0.1,
    fill: { color: NAV }, line: { color: NAV }
  });
  slide.addText(label.toUpperCase(), {
    x: x + 0.2, y: y + 0.06, w: w - 0.3, h: 0.14,
    fontSize: 6, bold: true, color: NAV, fontFace: "Arial",
    charSpacing: 0.5, margin: 0
  });
}

// ── NARRATIVAS DINÁMICAS ─────────────────────────────────────────────────────

function buildNarrFun(data, ent) {
  const f      = data.funcionamiento;
  const grupos = f.grupos || [];
  const byDist = [...grupos].sort((a, b) => b.distPct - a.distPct);
  const byPct  = [...grupos].filter(g => g.mod > 0).sort((a, b) => a.pct - b.pct);
  const top1   = byDist[0];
  const worst  = byPct[0];

  const parts = [
    { text: `El presupuesto de funcionamiento de ${ent.siglas} registró un Presupuesto Modificado de ` },
    { text: `B/. ${fmt(f.mod)} miles`, options: { bold: true, color: NAV } },
    { text: `, con un devengado de ` },
    { text: `B/. ${fmt(f.eje)} miles`, options: { bold: true, color: NAV } },
    { text: `, representando una ejecución del ` },
    { text: `${f.pct}%`, options: { bold: true, color: sColor(f.pct).fg } },
    { text: `, equivalente al ${f.dist}% del presupuesto total.` }
  ];

  if (top1) {
    parts.push({ text: ` Las/Los ` });
    parts.push({ text: top1.nombre, options: { bold: true, color: NAV } });
    parts.push({ text: ` (${top1.distPct}% del total) alcanzaron B/. ${fmt(top1.eje)} miles devengados (${top1.pct}%).` });
  }

  if (worst && worst.pct < 70 && top1 && worst.nombre !== top1.nombre) {
    parts.push({ text: ` En contraste, ` });
    parts.push({ text: worst.nombre, options: { bold: true, color: NAV } });
    parts.push({ text: ` registró la ejecución más crítica con apenas el ` });
    parts.push({ text: `${worst.pct}%`, options: { bold: true, color: sColor(worst.pct).fg } });
    parts.push({ text: `.` });
  }

  return parts;
}

function buildNarrInv(data, ent) {
  const inv  = data.inversion;
  const prgs = inv.programas || [];
  const best = prgs.length > 0
    ? prgs.reduce((a, b) => (a.pct > b.pct ? a : b))
    : null;
  const worst = prgs.filter(p => p.mod > 0).length > 0
    ? prgs.filter(p => p.mod > 0).reduce((a, b) => (a.pct < b.pct ? a : b))
    : null;

  const parts = [
    { text: `El presupuesto de inversión de ${ent.siglas} tuvo un Presupuesto Modificado de ` },
    { text: `B/. ${fmt(inv.mod)} miles`, options: { bold: true, color: NAV } },
    { text: ` y un devengado de ` },
    { text: `B/. ${fmt(inv.eje)} miles`, options: { bold: true, color: NAV } },
    { text: `, para una ejecución del ` },
    { text: `${inv.pct}%`, options: { bold: true, color: sColor(inv.pct).fg } },
    { text: `. Este componente representa el ${inv.dist}% del presupuesto total.` }
  ];

  if (best) {
    parts.push({ text: ` El programa ` });
    parts.push({ text: best.nombre, options: { bold: true, color: NAV } });
    parts.push({ text: ` concentra el mayor avance con ${best.pct}% ejecutado.` });
  }

  if (worst && worst.pct < 70 && best && worst.nombre !== best.nombre) {
    parts.push({ text: ` En el extremo crítico, ` });
    parts.push({ text: worst.nombre, options: { bold: true, color: NAV } });
    parts.push({ text: ` reportó apenas el ` });
    parts.push({ text: `${worst.pct}%`, options: { bold: true, color: sColor(worst.pct).fg } });
    parts.push({ text: ` de ejecución.` });
  }

  return parts;
}

function buildAspectos(data, ent) {
  const f   = data.funcionamiento;
  const inv = data.inversion;
  const pc  = data.partidaCritica;

  const invProgs = inv.programas || [];
  const bestInv  = invProgs.length > 0
    ? invProgs.reduce((a, b) => (a.pct > b.pct ? a : b))
    : null;

  const items = [
    {
      txt: [
        `Ejecución total del `,
        `${data.total.pct}%`,
        ` con B/. ${fmt(data.total.eje)} miles devengados sobre B/. ${fmt(data.total.mod)} modificados.`
      ],
      warn: false
    },
    {
      txt: [
        `La `, `inversión`,
        ` (${inv.dist}% del total) ejecutó ${inv.pct}%` +
        (inv.pct >= f.pct ? `, superior al funcionamiento (${f.pct}%).` : `, cuatro puntos por debajo del funcionamiento.`)
      ],
      warn: false
    }
  ];

  if (bestInv) {
    items.push({
      txt: [``, bestInv.nombre, ` (${bestInv.pct}%) lidera la ejecución en inversión.`],
      warn: false
    });
  }

  items.push({
    txt: [`Partida crítica: `, pc.nombre, ` con ${pc.pct}% de ejecución en el período.`],
    warn: pc.pct < 60
  });

  return items;
}

function buildRecs(data, ent) {
  const f       = data.funcionamiento;
  const inv     = data.inversion;
  const pc      = data.partidaCritica;
  const grupos  = f.grupos || [];
  const invProgs = (inv.programas || []).filter(p => p.mod > 0 && p.pct < 70);

  const recs = [];

  if (pc.pct < 70) {
    recs.push(
      `Revisar y depurar asignaciones de ${pc.nombre}, identificando partidas sin ejecución para redistribución oportuna.`
    );
  }

  const otrosLow = grupos
    .filter(g => g.mod > 0 && g.pct < 70 && g.nombre !== pc.nombre)
    .slice(0, 1);
  otrosLow.forEach(g => {
    recs.push(
      `Fortalecer la ejecución de ${g.nombre} (${g.pct}%) mediante revisión de compromisos y cronogramas de pago.`
    );
  });

  if (invProgs.length > 0) {
    recs.push(
      `Investigar el bajo rendimiento del programa "${invProgs[0].nombre}" (${invProgs[0].pct}%) y establecer cronograma de desembolsos.`
    );
  }

  recs.push(
    `Implementar alertas tempranas de subejecución por programa para corregir rezagos antes del cierre fiscal.`
  );

  return recs.slice(0, 4);
}

function buildConclusiones(data, ent) {
  const f   = data.funcionamiento;
  const inv = data.inversion;

  const p1 = [
    { text: `${ent.nombre} cerró el 2025 con una ejecución presupuestaria del ` },
    { text: `${data.total.pct}%`, options: { bold: true } },
    { text: ` sobre B/. ${fmt(data.total.mod)} miles, resultado que refleja ` },
    {
      text: data.total.pct >= 80
        ? `un desempeño satisfactorio a nivel agregado.`
        : `oportunidades de mejora en la gestión presupuestaria.`
    },
    { text: ` El funcionamiento alcanzó el ` },
    { text: `${f.pct}%`, options: { bold: true } },
    {
      text: f.pct >= 80
        ? `, mostrando adecuada gestión de recursos operativos.`
        : `, con áreas de gestión operativa que requieren atención.`
    }
  ];

  const p2 = inv.mod > 0
    ? [
        { text: `En inversión, la ejecución del ` },
        { text: `${inv.pct}%`, options: { bold: true } },
        {
          text: inv.pct >= 80
            ? ` refleja buena capacidad ejecutora en proyectos de inversión.`
            : ` evidencia dificultades en la ejecución de proyectos de inversión.`
        },
        ...(() => {
          const best = (inv.programas || []).reduce(
            (a, b) => (!a || b.pct > a.pct ? b : a), null
          );
          return best
            ? [
                { text: ` El programa ` },
                { text: best.nombre, options: { bold: true } },
                { text: ` (${best.pct}%) destacó como el de mayor rendimiento.` }
              ]
            : [];
        })()
      ]
    : [{ text: `La entidad no registró presupuesto de inversión en el período analizado.` }];

  return { p1, p2 };
}

// ── SLIDE 1 — PORTADA ────────────────────────────────────────────────────────

function slide1(pres, ent, data, periodo) {
  const sl = pres.addSlide();
  const headerCode = `${ent.codigo} · ${ent.siglas}`;
  addHeader(pres, sl, { code: headerCode, name: ent.nombre.toUpperCase(), period: periodoLabel(periodo) });

  // Banda objetivo
  sl.addShape(pres.shapes.RECTANGLE, {
    x: 0.18, y: 0.76, w: 0.035, h: 0.42,
    fill: { color: NAV }, line: { color: NAV }
  });
  sl.addShape(pres.shapes.RECTANGLE, {
    x: 0.215, y: 0.76, w: 9.57, h: 0.42,
    fill: { color: ICE }, line: { color: ICE }
  });
  sl.addText("OBJETIVO GENERAL", {
    x: 0.28, y: 0.77, w: 2, h: 0.13,
    fontSize: 6, bold: true, color: NAV, charSpacing: 0.5, fontFace: "Arial", margin: 0
  });
  sl.addText(ent.objetivo, {
    x: 0.28, y: 0.89, w: 9.5, h: 0.28,
    fontSize: 7.5, color: TXT, fontFace: "Arial", margin: 0
  });

  // ── Panel izquierdo: KPIs ──
  const lx = 0.18, ly = 1.25, lw = 4.7, lh = 3.95;
  addPanelBox(pres, sl, lx, ly, lw, lh);
  addPanelTitle(pres, sl, lx, ly, lw, "Resumen de Ejecución  (en miles de B/.)");

  // Caja navy grande — Total Ejecutado
  sl.addShape(pres.shapes.RECTANGLE, {
    x: lx + 0.12, y: ly + 0.28, w: lw - 0.24, h: 1.18,
    fill: { color: NAV }, line: { color: NAV }
  });
  sl.addText("Total Ejecutado", {
    x: lx + 0.12, y: ly + 0.33, w: lw - 0.24, h: 0.2,
    fontSize: 7, color: "99B5CC", fontFace: "Arial", align: "center", margin: 0
  });
  sl.addText(fmt(data.total.eje), {
    x: lx + 0.12, y: ly + 0.52, w: lw - 0.24, h: 0.45,
    fontSize: 32, bold: true, color: WHT, fontFace: "Arial", align: "center", margin: 0
  });
  sl.addText(`miles de balboas  ·  ${data.total.pct}% de ejecución`, {
    x: lx + 0.12, y: ly + 0.97, w: lw - 0.24, h: 0.18,
    fontSize: 7, color: "C8F0D8", fontFace: "Arial", align: "center", margin: 0
  });
  // Barra progreso total
  sl.addShape(pres.shapes.RECTANGLE, {
    x: lx + 0.3, y: ly + 1.33, w: lw - 0.6, h: 0.04,
    fill: { color: "3A5070" }, line: { color: "3A5070" }
  });
  sl.addShape(pres.shapes.RECTANGLE, {
    x: lx + 0.3, y: ly + 1.33, w: (lw - 0.6) * (data.total.pct / 100), h: 0.04,
    fill: { color: "C8F0D8" }, line: { color: "C8F0D8" }
  });

  // Sub-cajas Funcionamiento e Inversión
  const subY = ly + 1.6;
  const subW = (lw - 0.36) / 2;
  const subBoxes = [
    {
      label: "Funcionamiento",
      val:   fmt(data.funcionamiento.eje),
      pct:   data.funcionamiento.pct,
      note:  `${data.funcionamiento.dist}% del total`
    },
    {
      label: "Inversión",
      val:   fmt(data.inversion.eje),
      pct:   data.inversion.pct,
      note:  `${data.inversion.dist}% del total`
    }
  ];

  subBoxes.forEach((d, i) => {
    const sx = lx + 0.12 + i * (subW + 0.12);
    sl.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: subY, w: subW, h: 1.22,
      fill: { color: ICE }, line: { color: BDR, pt: 0.5 }
    });
    sl.addText(d.label.toUpperCase(), {
      x: sx, y: subY + 0.08, w: subW, h: 0.16,
      fontSize: 6.5, color: MUT, fontFace: "Arial", align: "center", margin: 0
    });
    sl.addText(d.val, {
      x: sx, y: subY + 0.24, w: subW, h: 0.38,
      fontSize: 22, bold: true, color: NAV, fontFace: "Arial", align: "center", margin: 0
    });
    sl.addText(d.note, {
      x: sx, y: subY + 0.63, w: subW, h: 0.15,
      fontSize: 6.5, color: MUT, fontFace: "Arial", align: "center", margin: 0
    });
    // Pill semáforo
    const s = sColor(d.pct);
    sl.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: sx + subW / 2 - 0.24, y: subY + 0.82, w: 0.48, h: 0.17,
      fill: { color: s.bg }, line: { color: s.bg }, rectRadius: 0.08
    });
    sl.addText(`${d.pct}%`, {
      x: sx + subW / 2 - 0.24, y: subY + 0.82, w: 0.48, h: 0.17,
      fontSize: 7.5, bold: true, color: s.fg, fontFace: "Arial", align: "center", margin: 0
    });
    // Barra progreso
    sl.addShape(pres.shapes.RECTANGLE, {
      x: sx + 0.12, y: subY + 1.06, w: subW - 0.24, h: 0.035,
      fill: { color: BDR }, line: { color: BDR }
    });
    sl.addShape(pres.shapes.RECTANGLE, {
      x: sx + 0.12, y: subY + 1.06, w: (subW - 0.24) * (d.pct / 100), h: 0.035,
      fill: { color: "0F5E2F" }, line: { color: "0F5E2F" }
    });
  });

  sl.addText("Nota: Las entidades del Gobierno Central no generan ingresos propios; sus fondos provienen de transferencias o aportes fiscales.", {
    x: lx + 0.1, y: ly + 3.65, w: lw - 0.2, h: 0.22,
    fontSize: 6, color: "AAAAAA", fontFace: "Arial", margin: 0
  });

  // ── Panel derecho: tabla resumen ──
  const rx = 5.06, ry = 1.25, rw = 4.72, rh = 3.95;
  addPanelBox(pres, sl, rx, ry, rw, rh);
  addPanelTitle(pres, sl, rx, ry, rw, `Ejecución Presupuestaria — ${periodoLabel(periodo)}`);

  const headers = ["Categoría", "Ley (1)", "Modificado (2)", "Ejecutado (3)", "% (3/2)", "Dist."];
  const colW    = [1.38, 0.62, 0.82, 0.72, 0.56, 0.44];
  const pctVals = [data.total.pct, data.funcionamiento.pct, data.inversion.pct];

  const tableRows = [
    headers.map((h, i) => ({
      text: h,
      options: {
        fill: { color: NAV }, color: WHT, bold: true,
        fontSize: 7, fontFace: "Arial",
        align: i === 0 ? "left" : "center",
        border: [{ pt: 0 }, { pt: 0 }, { pt: 0 }, { pt: 0 }]
      }
    })),
    // TOTAL
    [
      { text: "TOTAL",             options: { bold: true } },
      fmt(data.total.ley),
      fmt(data.total.mod),
      fmt(data.total.eje),
      `${data.total.pct}%`,
      "100%"
    ].map((cell, ci) => {
      const s = sColor(pctVals[0]);
      return {
        text: typeof cell === "object" ? cell.text : cell,
        options: {
          fill: { color: "E8EFF8" },
          color: ci === 4 ? s.fg : NAV,
          bold: true,
          fontSize: 7.5, fontFace: "Arial",
          align: ci === 0 ? "left" : "center",
          border: [{ pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }]
        }
      };
    }),
    // FUNCIONAMIENTO
    [
      "  Funcionamiento",
      fmt(data.funcionamiento.ley),
      fmt(data.funcionamiento.mod),
      fmt(data.funcionamiento.eje),
      `${data.funcionamiento.pct}%`,
      `${data.funcionamiento.dist}%`
    ].map((cell, ci) => {
      const s = sColor(pctVals[1]);
      return {
        text: cell,
        options: {
          fill: { color: WHT },
          color: ci === 4 ? s.fg : TXT,
          bold: ci === 4,
          fontSize: 7.5, fontFace: "Arial",
          align: ci === 0 ? "left" : "center",
          border: [{ pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }]
        }
      };
    }),
    // INVERSIÓN
    [
      "  Inversión",
      fmt(data.inversion.ley),
      fmt(data.inversion.mod),
      fmt(data.inversion.eje),
      `${data.inversion.pct}%`,
      `${data.inversion.dist}%`
    ].map((cell, ci) => {
      const s = sColor(pctVals[2]);
      return {
        text: cell,
        options: {
          fill: { color: WHT },
          color: ci === 4 ? s.fg : TXT,
          bold: ci === 4,
          fontSize: 7.5, fontFace: "Arial",
          align: ci === 0 ? "left" : "center",
          border: [{ pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }, { pt: 0.5, color: "E0E8F0" }]
        }
      };
    })
  ];

  sl.addTable(tableRows, {
    x: rx + 0.1, y: ry + 0.28, w: rw - 0.2, colW,
    fontFace: "Arial", fontSize: 7.5
  });

  // Leyenda semáforo
  const semY = ry + 1.65;
  sl.addText("Semáforo:", {
    x: rx + 0.12, y: semY, w: 0.7, h: 0.16,
    fontSize: 6.5, bold: true, color: MUT, fontFace: "Arial", margin: 0
  });
  [
    { label: "≥ 80% Alta",   bg: "C8F0D8", fg: "0F5E2F" },
    { label: "60–79% Media", bg: "FFE8B0", fg: "7A4800" },
    { label: "< 60% Baja",   bg: "FFD0D0", fg: "7A1010" }
  ].forEach((s, i) => {
    const sx = rx + 0.85 + i * 1.2;
    sl.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: sx, y: semY, w: 1.1, h: 0.16,
      fill: { color: s.bg }, line: { color: s.bg }, rectRadius: 0.08
    });
    sl.addText(s.label, {
      x: sx, y: semY, w: 1.1, h: 0.16,
      fontSize: 6.5, bold: true, color: s.fg, fontFace: "Arial", align: "center", margin: 0
    });
  });

  sl.addText("Nota: Los montos considerados corresponden al presupuesto devengado.", {
    x: rx + 0.1, y: ry + 3.65, w: rw - 0.2, h: 0.22,
    fontSize: 6, color: "AAAAAA", fontFace: "Arial", margin: 0
  });

  addFooter(pres, sl, ent.nombre, periodo);
}

// ── SLIDE 2 — FUNCIONAMIENTO ─────────────────────────────────────────────────

function slide2(pres, ent, data, narr, periodo) {
  const sl = pres.addSlide();
  addHeader(pres, sl, {
    subtitle: "Ejecución por Grupos de Gasto y Programas",
    name: "Funcionamiento",
    siglas: ent.siglas,
    period: periodoLabel(periodo)
  });

  const lx = 0.18, cy = 0.77;
  const f = data.funcionamiento;

  // Limitar a 8 grupos para el donut (máximo de colores disponibles)
  const grupos = f.grupos.slice(0, 8);

  // ── Panel donut — Distribución grupos de gasto ──
  const dpH = 1.85;
  addPanelBox(pres, sl, lx, cy, 4.7, dpH);
  addPanelTitle(pres, sl, lx, cy, 4.7, "Grupos de Gasto — Distribución (%)");

  const donutData = [{
    name: "Distribución",
    labels: grupos.map(g => short(g.nombre, 20)),
    values: grupos.map(g => g.distPct > 0 ? g.distPct : 1)
  }];
  sl.addChart(pres.charts.DOUGHNUT, donutData, {
    x: lx + 0.08, y: cy + 0.2, w: 1.7, h: dpH - 0.28,
    holeSize: 58,
    chartColors: grupos.map(g => g.color),
    showLegend: false,
    showPercent: false,
    showValue: false,
    chartArea: { fill: { color: WHT } },
    dataLabelColor: WHT,
    dataLabelFontSize: 7
  });
  // Centro donut
  sl.addShape(pres.shapes.OVAL, {
    x: lx + 0.58, y: cy + 0.51, w: 0.7, h: 0.7,
    fill: { color: WHT }, line: { color: WHT }
  });
  sl.addText(`${fmt(f.mod)}\nB/. miles`, {
    x: lx + 0.55, y: cy + 0.58, w: 0.76, h: 0.55,
    fontSize: 6.5, color: NAV, fontFace: "Arial", align: "center", margin: 0
  });

  // Leyenda — hasta 4 grupos visibles por espacio
  const legGrupos = grupos.slice(0, 4);
  legGrupos.forEach((g, i) => {
    const legY = cy + 0.28 + i * 0.36;
    sl.addShape(pres.shapes.RECTANGLE, {
      x: lx + 1.88, y: legY + 0.02, w: 0.1, h: 0.1,
      fill: { color: g.color }, line: { color: g.color }
    });
    sl.addText(g.nombre, {
      x: lx + 2.03, y: legY, w: 1.62, h: 0.14,
      fontSize: 7, bold: true, color: g.color, fontFace: "Arial", margin: 0
    });
    sl.addShape(pres.shapes.RECTANGLE, {
      x: lx + 2.03, y: legY + 0.17, w: 1.5, h: 0.06,
      fill: { color: "E8EEF5" }, line: { color: "E8EEF5" }
    });
    const fw = 1.5 * g.distPct / 100;
    sl.addShape(pres.shapes.RECTANGLE, {
      x: lx + 2.03, y: legY + 0.17, w: fw < 0.015 ? 0.015 : fw, h: 0.06,
      fill: { color: g.color }, line: { color: g.color }
    });
    sl.addText(`${g.distPct}%`, {
      x: lx + 3.57, y: legY + 0.11, w: 0.3, h: 0.14,
      fontSize: 7.5, bold: true, color: g.color, fontFace: "Arial", margin: 0
    });
  });

  // ── Panel tabla detalle grupos ──
  const dtY = cy + dpH + 0.1;
  const dtH = 5.47 - dtY - 0.18;
  addPanelBox(pres, sl, lx, dtY, 4.7, dtH);
  addPanelTitle(pres, sl, lx, dtY, 4.7, "Detalle  (en miles de B/.)");

  // Fila total + hasta 5 grupos
  const detRows = [
    ["Total Funcionamiento", fmt(f.ley), fmt(f.mod), fmt(f.eje), f.pct, true],
    ...grupos.slice(0, 5).map(g => [
      g.nombre,
      fmt(g.ley),
      fmt(g.mod),
      fmt(g.eje),
      g.pct,
      false
    ])
  ];

  const detTableData = [
    ["Grupo de Gasto", "Ley", "Mod.", "Ejec.", "%"].map((h, i) => ({
      text: h,
      options: {
        fill: { color: NAV }, color: WHT, bold: true,
        fontSize: 7, fontFace: "Arial",
        align: i === 0 ? "left" : "center",
        border: [{ pt: 0 }]
      }
    })),
    ...detRows.map(r => {
      const s = sColor(r[4]);
      return [
        {
          text: r[5] ? r[0] : "  " + r[0],
          options: { fill: { color: r[5] ? "E8EFF8" : WHT }, color: r[5] ? NAV : TXT, bold: r[5], fontSize: 7.5, fontFace: "Arial", align: "left", border: [{ pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }] }
        },
        {
          text: r[1],
          options: { fill: { color: r[5] ? "E8EFF8" : WHT }, color: r[5] ? NAV : TXT, bold: r[5], fontSize: 7.5, fontFace: "Arial", align: "center", border: [{ pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }] }
        },
        {
          text: r[2],
          options: { fill: { color: r[5] ? "E8EFF8" : WHT }, color: r[5] ? NAV : TXT, bold: r[5], fontSize: 7.5, fontFace: "Arial", align: "center", border: [{ pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }] }
        },
        {
          text: r[3],
          options: { fill: { color: r[5] ? "E8EFF8" : WHT }, color: r[5] ? NAV : TXT, bold: r[5], fontSize: 7.5, fontFace: "Arial", align: "center", border: [{ pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }] }
        },
        {
          text: `${r[4]}%`,
          options: { fill: { color: s.bg }, color: s.fg, bold: true, fontSize: 7.5, fontFace: "Arial", align: "center", border: [{ pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }, { pt: 0.5, color: "C0CCD8" }] }
        }
      ];
    })
  ];

  sl.addTable(detTableData, {
    x: lx + 0.1, y: dtY + 0.25, w: 4.5,
    colW: [1.7, 0.65, 0.65, 0.65, 0.65],
    fontFace: "Arial", fontSize: 7.5
  });

  sl.addText("Nota: Ver clasificación oficial de grupos de gasto en el Clasificador Presupuestario.", {
    x: lx + 0.1, y: dtY + dtH - 0.22, w: 4.5, h: 0.2,
    fontSize: 5.5, color: "AAAAAA", fontFace: "Arial", margin: 0
  });

  // ── Columna derecha ──
  const rx = 5.06;

  // Gráfico barras programas
  const pbH = 1.85;
  addPanelBox(pres, sl, rx, cy, 4.72, pbH);
  addPanelTitle(pres, sl, rx, cy, 4.72, "Programas de Funcionamiento  (en miles de B/.)");

  const progFun = f.programas.slice(0, 7);
  if (progFun.length > 0) {
    const programasData = [
      { name: "Modificado", labels: progFun.map(p => p.nombre + " (" + calcPct(p) + "%)"), values: progFun.map(p => p.mod) },
      { name: "Devengado",  labels: progFun.map(p => p.nombre + " (" + calcPct(p) + "%)"), values: progFun.map(p => p.eje) }
    ];
    sl.addChart(pres.charts.BAR, programasData, {
      x: rx + 0.1, y: cy + 0.2, w: 4.52, h: pbH - 0.25,
      barDir: "bar",
      barGrouping: "clustered",
      chartColors: ["7A9BBF", "1B2F4E"],
      chartArea: { fill: { color: WHT } },
      catAxisLabelColor: MUT, catAxisLabelFontSize: 6.5,
      valAxisLabelColor: MUT, valAxisLabelFontSize: 6,
      valGridLine: { color: "E8EEF5", size: 0.5 },
      catGridLine: { style: "none" },
      showLegend: true, legendPos: "t", legendFontSize: 6.5, legendColor: MUT,
      showValue: true,
      dataLabelFontSize: 6, dataLabelColor: WHT
    });
  } else {
    sl.addText("Sin programas de funcionamiento disponibles.", {
      x: rx + 0.1, y: cy + 0.5, w: 4.52, h: 0.5,
      fontSize: 8, color: MUT, fontFace: "Arial", align: "center", margin: 0
    });
  }

  // Panel análisis
  const anY = cy + pbH + 0.1;
  const anH = 5.47 - anY - 0.18;
  addPanelBox(pres, sl, rx, anY, 4.72, anH);
  addPanelTitle(pres, sl, rx, anY, 4.72, "Análisis");
  sl.addText(narr?.narrativaFun ? narrativeToPptx(narr.narrativaFun, { align: "justify" }) : buildNarrFun(data, ent), {
    x: rx + 0.12, y: anY + 0.25, w: 4.48, h: anH - 0.35,
    fontSize: 7.5, color: TXT, fontFace: "Arial", valign: "top", align: "justify", margin: 0
  });

  addFooter(pres, sl, ent.siglas, periodo);
}

// ── SLIDE 3 — INVERSIÓN ──────────────────────────────────────────────────────

function slide3(pres, ent, data, narr, periodo) {
  const sl = pres.addSlide();
  addHeader(pres, sl, {
    subtitle: "Ejecución por Programas y Actividades / Proyectos",
    name: "Inversión",
    siglas: ent.siglas,
    period: periodoLabel(periodo)
  });

  const cy = 0.77;
  const lx = 0.18;
  const inv = data.inversion;
  const progInv = inv.programas.slice(0, 6);

  // ── Panel programas inversión ──
  const pbH = 2.0;
  addPanelBox(pres, sl, lx, cy, 4.7, pbH);
  addPanelTitle(pres, sl, lx, cy, 4.7, "Programas de Inversión  (en miles de B/.)");

  if (progInv.length > 0) {
    const invProgData = [
      { name: "Modificado", labels: progInv.map(p => p.nombre + " (" + calcPct(p) + "%)"), values: progInv.map(p => p.mod) },
      { name: "Devengado",  labels: progInv.map(p => p.nombre + " (" + calcPct(p) + "%)"), values: progInv.map(p => p.eje) }
    ];
    sl.addChart(pres.charts.BAR, invProgData, {
      x: lx + 0.1, y: cy + 0.2, w: 4.5, h: pbH - 0.28,
      barDir: "bar", barGrouping: "clustered",
      chartColors: ["7A9BBF", "1B2F4E"],
      chartArea: { fill: { color: WHT } },
      catAxisLabelColor: MUT, catAxisLabelFontSize: 6.5,
      valAxisLabelColor: MUT, valAxisLabelFontSize: 6,
      valGridLine: { color: "E8EEF5", size: 0.5 },
      catGridLine: { style: "none" },
      showLegend: true, legendPos: "t", legendFontSize: 6.5, legendColor: MUT,
      showValue: false
    });
  } else {
    sl.addText("Sin programas de inversión disponibles.", {
      x: lx + 0.1, y: cy + 0.5, w: 4.5, h: 0.5,
      fontSize: 8, color: MUT, fontFace: "Arial", align: "center", margin: 0
    });
  }

  // ── Panel subprogramas (todos los subprogramas de todos los programas) ──
  const spY = cy + pbH + 0.1;
  const spH = 5.47 - spY - 0.18;
  addPanelBox(pres, sl, lx, spY, 4.7, spH);
  addPanelTitle(pres, sl, lx, spY, 4.7, "Subprogramas de Inversión  (en miles de B/.)");

  // Aplanar subprogramas de todos los programas (hasta 8)
  const allSubs = progInv
    .flatMap(p => p.subprogramas || [])
    .slice(0, 8);

  if (allSubs.length > 0) {
    const subprogData = [
      { name: "Modificado", labels: allSubs.map(s => s.nombre + " (" + calcPct(s) + "%)"), values: allSubs.map(s => s.mod) },
      { name: "Devengado",  labels: allSubs.map(s => s.nombre + " (" + calcPct(s) + "%)"), values: allSubs.map(s => s.eje) }
    ];
    sl.addChart(pres.charts.BAR, subprogData, {
      x: lx + 0.1, y: spY + 0.2, w: 4.5, h: spH - 0.3,
      barDir: "bar", barGrouping: "clustered",
      chartColors: ["7A9BBF", "1B2F4E"],
      chartArea: { fill: { color: WHT } },
      catAxisLabelColor: MUT, catAxisLabelFontSize: 6,
      valAxisLabelColor: MUT, valAxisLabelFontSize: 5.5,
      valGridLine: { color: "E8EEF5", size: 0.5 },
      catGridLine: { style: "none" },
      showLegend: false,
      showValue: false
    });
  } else {
    sl.addText("Sin subprogramas disponibles.", {
      x: lx + 0.1, y: spY + 0.4, w: 4.5, h: 0.4,
      fontSize: 8, color: MUT, fontFace: "Arial", align: "center", margin: 0
    });
  }

  // ── Panel derecho: análisis inversión ──
  const rx = 5.06;
  addPanelBox(pres, sl, rx, cy, 4.72, 5.47 - cy - 0.18);
  addPanelTitle(pres, sl, rx, cy, 4.72, "Análisis de Inversión");
  sl.addText(narr?.narrativaInv ? narrativeToPptx(narr.narrativaInv, { align: "justify" }) : buildNarrInv(data, ent), {
    x: rx + 0.12, y: cy + 0.25, w: 4.48, h: 4.6,
    fontSize: 7.5, color: TXT, fontFace: "Arial", valign: "top", align: "justify", margin: 0
  });

  addFooter(pres, sl, ent.siglas, periodo);
}

// ── SLIDE 4 — CONCLUSIONES ───────────────────────────────────────────────────

function slide4(pres, ent, data, narr, periodo) {
  const sl = pres.addSlide();
  const hasInv = data.inversion.mod > 0;
  addHeader(pres, sl, {
    subtitle: "Resumen Ejecutivo y Conclusiones",
    name: hasInv ? "Funcionamiento e Inversión" : "Funcionamiento",
    period: periodoLabel(periodo)
  });

  const cy = 0.77;
  const pc = data.partidaCritica;

  // ── KPI Band ──
  const kpis = [
    {
      label: "Ejecución Total",
      val:   `${data.total.pct}%`,
      sub:   `B/. ${fmt(data.total.eje)} miles`,
      pct:   data.total.pct,
      dark:  true,
      warn:  false
    },
    {
      label: "Funcionamiento",
      val:   `${data.funcionamiento.pct}%`,
      sub:   `B/. ${fmt(data.funcionamiento.eje)} miles`,
      pct:   data.funcionamiento.pct,
      dark:  false,
      warn:  false
    },
    {
      label: "Inversión",
      val:   `${data.inversion.pct}%`,
      sub:   `B/. ${fmt(data.inversion.eje)} miles`,
      pct:   data.inversion.pct,
      dark:  false,
      warn:  false
    },
    {
      label: "Partida Crítica",
      val:   `${pc.pct}%`,
      sub:   short(pc.nombre, 20),
      pct:   pc.pct,
      dark:  false,
      warn:  true
    }
  ];

  const kw = (9.6 - 0.36 * 3) / 4;
  kpis.forEach((k, i) => {
    const kx  = 0.18 + i * (kw + 0.36);
    const bg   = k.dark ? NAV : k.warn ? "FFF8E0" : ICE;
    const bord = k.dark ? NAV : k.warn ? "F0D060" : BDR;
    sl.addShape(pres.shapes.RECTANGLE, {
      x: kx, y: cy, w: kw, h: 0.88,
      fill: { color: bg }, line: { color: bord, pt: 1 },
      shadow: { type: "outer", blur: 4, offset: 1, angle: 135, color: "000000", opacity: 0.08 }
    });
    sl.addText(k.label.toUpperCase(), {
      x: kx, y: cy + 0.07, w: kw, h: 0.13,
      fontSize: 6, color: k.dark ? "99B5CC" : k.warn ? "7A5800" : MUT,
      fontFace: "Arial", align: "center", charSpacing: 0.3, margin: 0
    });
    sl.addText(k.val, {
      x: kx, y: cy + 0.18, w: kw, h: 0.38,
      fontSize: 28, bold: true,
      color: k.dark ? WHT : k.warn ? "7A1010" : NAV,
      fontFace: "Arial", align: "center", margin: 0
    });
    sl.addText(k.sub, {
      x: kx, y: cy + 0.57, w: kw, h: 0.14,
      fontSize: 6.5,
      color: k.dark ? "88AACC" : k.warn ? "7A5800" : MUT,
      fontFace: "Arial", align: "center", bold: k.warn, margin: 0
    });
    const barBg = k.dark ? "3A5070" : k.warn ? "F0D060" : BDR;
    const barFg = k.dark
      ? "C8F0D8"
      : k.warn
        ? "7A1010"
        : sColor(k.pct).bg === "C8F0D8" ? "0F5E2F" : sColor(k.pct).fg;
    sl.addShape(pres.shapes.RECTANGLE, {
      x: kx + 0.15, y: cy + 0.76, w: kw - 0.3, h: 0.04,
      fill: { color: barBg }, line: { color: barBg }
    });
    sl.addShape(pres.shapes.RECTANGLE, {
      x: kx + 0.15, y: cy + 0.76, w: (kw - 0.3) * (k.pct / 100), h: 0.04,
      fill: { color: barFg }, line: { color: barFg }
    });
  });

  // ── 3 paneles inferiores ──
  const py   = cy + 0.98;
  const panH = 5.47 - py - 0.18;

  // Panel 1 — Aspectos Relevantes
  addPanelBox(pres, sl, 0.18, py, 3.1, panH);
  addPanelTitle(pres, sl, 0.18, py, 3.1, "Aspectos Relevantes");

  const aspectos = narr?.aspectos
    ? narr.aspectos.map(a => ({ txt: [sanitize(a.texto)], warn: a.esCritico }))
    : buildAspectos(data, ent);
  aspectos.forEach((a, i) => {
    const ay          = py + 0.28 + i * 0.64;
    const bulletColor = a.warn ? "7A1010" : NAV;
    sl.addShape(pres.shapes.RECTANGLE, {
      x: 0.28, y: ay + 0.03, w: 0.14, h: 0.14,
      fill: { color: bulletColor }, line: { color: bulletColor }
    });
    sl.addText(a.warn ? "!" : "✓", {
      x: 0.28, y: ay + 0.03, w: 0.14, h: 0.14,
      fontSize: 7, bold: true, color: WHT, fontFace: "Arial", align: "center", margin: 0
    });
    const aspectoRuns = a.txt.length === 1
      ? [{ text: a.txt[0] }]
      : [
          ...(a.txt[0] ? [{ text: a.txt[0] }] : []),
          { text: a.txt[1], options: { bold: true, color: a.warn ? "7A1010" : NAV } },
          ...(a.txt[2] ? [{ text: a.txt[2] }] : [])
        ];
    sl.addText(aspectoRuns, {
      x: 0.46, y: ay, w: 2.72, h: 0.56,
      fontSize: 7.5, color: TXT, fontFace: "Arial", valign: "top", margin: 0
    });
  });

  // Panel 2 — Recomendaciones
  addPanelBox(pres, sl, 3.46, py, 3.1, panH);
  sl.addShape(pres.shapes.RECTANGLE, {
    x: 3.53, y: py + 0.08, w: 0.1, h: 0.1,
    fill: { color: "0F5E2F" }, line: { color: "0F5E2F" }
  });
  sl.addText("RECOMENDACIONES", {
    x: 3.66, y: py + 0.06, w: 2.8, h: 0.14,
    fontSize: 6, bold: true, color: "0F5E2F", fontFace: "Arial", charSpacing: 0.5, margin: 0
  });

  const recs = narr?.recomendaciones ? narr.recomendaciones.map(r => sanitize(r)) : buildRecs(data, ent);
  recs.forEach((r, i) => {
    const ry2 = py + 0.28 + i * 0.64;
    sl.addShape(pres.shapes.OVAL, {
      x: 3.56, y: ry2 + 0.02, w: 0.16, h: 0.16,
      fill: { color: "0F5E2F" }, line: { color: "0F5E2F" }
    });
    sl.addText(`${i + 1}`, {
      x: 3.56, y: ry2 + 0.02, w: 0.16, h: 0.16,
      fontSize: 7, bold: true, color: WHT, fontFace: "Arial", align: "center", margin: 0
    });
    sl.addText(r, {
      x: 3.76, y: ry2, w: 2.7, h: 0.56,
      fontSize: 7.5, color: TXT, fontFace: "Arial", valign: "top", margin: 0
    });
  });

  // Panel 3 — Conclusiones
  sl.addShape(pres.shapes.RECTANGLE, {
    x: 6.74, y: py, w: 3.04, h: panH,
    fill: { color: ICE }, line: { color: BDR, pt: 1 },
    shadow: { type: "outer", blur: 4, offset: 1, angle: 135, color: "000000", opacity: 0.08 }
  });
  addPanelTitle(pres, sl, 6.74, py, 3.04, "Conclusiones");

  const concl = buildConclusiones(data, ent);
  const conclP1 = narr?.conclusion1 ? narrativeToPptx(narr.conclusion1) : concl.p1;
  const conclP2 = narr?.conclusion2 ? narrativeToPptx(narr.conclusion2) : concl.p2;
  sl.addText(conclP1, {
    x: 6.86, y: py + 0.25, w: 2.8, h: panH / 2 - 0.1,
    fontSize: 7.5, color: NAV, fontFace: "Arial", valign: "top", margin: 0
  });
  sl.addShape(pres.shapes.RECTANGLE, {
    x: 6.86, y: py + panH / 2 + 0.08, w: 2.8, h: 0.012,
    fill: { color: BDR }, line: { color: BDR }
  });
  sl.addText(conclP2 || [{ text: "" }], {
    x: 6.86, y: py + panH / 2 + 0.13, w: 2.8, h: panH / 2 - 0.15,
    fontSize: 7.5, color: NAV, fontFace: "Arial", valign: "top", margin: 0
  });

  addFooter(pres, sl, ent.nombre, periodo);
}

// ── SLIDE EXTRA (contenido libre organizado por IA) ──────────────────────────

function slideExtra(pres, ent, slideData, periodo) {
  // slideData: { titulo, secciones: [{titulo, contenido}] }
  const sl = pres.addSlide();
  addHeader(pres, sl, {
    subtitle: slideData.titulo || "Información Adicional",
    name: ent.nombre.toUpperCase(),
    period: periodoLabel(periodo)
  });

  const cy   = 0.77;
  const secs = (slideData.secciones || []).slice(0, 2);
  if (secs.length === 0) { addFooter(pres, sl, ent.siglas, periodo); return; }

  const avail = 5.47 - cy - 0.18;
  const panH  = secs.length === 1 ? avail - 0.1 : (avail - 0.15) / 2;

  secs.forEach((sec, i) => {
    const panY = cy + 0.05 + i * (panH + 0.1);
    addPanelBox(pres, sl, 0.18, panY, 9.64, panH);
    addPanelTitle(pres, sl, 0.18, panY, 9.64, sec.titulo || "");
    sl.addText(sanitize(sec.contenido || ""), {
      x: 0.3, y: panY + 0.28, w: 9.42, h: panH - 0.38,
      fontSize: 8.5, color: TXT, fontFace: "Arial", valign: "top", margin: 0
    });
  });

  addFooter(pres, sl, ent.siglas, periodo);
}

// ── EXPORT (para Vercel API) ──────────────────────────────────────────────────

async function generatePPTXBase64(ent, data, narr, extraSlides, periodo) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title  = `${ent.siglas} — Informe ${periodoLabel(periodo)}`;
  pres.author = "Dirección de Presupuesto de la Nación";

  slide1(pres, ent, data, periodo);
  slide2(pres, ent, data, narr, periodo);
  if (data.inversion.mod > 0) {
    slide3(pres, ent, data, narr, periodo);
  }
  slide4(pres, ent, data, narr, periodo);
  (extraSlides || []).forEach(s => slideExtra(pres, ent, s, periodo));

  return await pres.write({ outputType: "base64" });
}

module.exports = { generatePPTXBase64, getEntidad, slideExtra };

// ── MAIN (CLI) ────────────────────────────────────────────────────────────────

async function main() {
  // ── Entidad ─────────────────────────────────────────────────────────────────
  const CODIGO = process.env.CODIGO || "014"; // también: node gen_informe.js (CODIGO en env)

  const entRaw = getEntidad(CODIGO);
  if (!entRaw) {
    console.error("❌ Entidad no encontrada:", CODIGO);
    process.exit(1);
  }
  const ent = { codigo: CODIGO, ...entRaw };

  // ── Excel DIPRENA ────────────────────────────────────────────────────────────
  const EXCEL_PATH = process.argv[2];
  if (!EXCEL_PATH) {
    console.error("❌ Uso: node gen_informe.js <ruta_excel.xlsx>");
    console.error("   Ejemplo: node gen_informe.js MIVIOT_2025.xlsx");
    process.exit(1);
  }
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("❌ No se encontró el archivo:", EXCEL_PATH);
    process.exit(1);
  }

  console.log(`📊 Parseando Excel: ${EXCEL_PATH}`);
  const data = parseExcelDIPRENA(EXCEL_PATH);

  console.log(`   Total:           B/. ${fmt(data.total.eje)} miles (${data.total.pct}%)`);
  console.log(`   Funcionamiento:  B/. ${fmt(data.funcionamiento.eje)} miles (${data.funcionamiento.pct}%)`);
  console.log(`   Inversión:       B/. ${fmt(data.inversion.eje)} miles (${data.inversion.pct}%)`);
  console.log(`   Grupos gasto:    ${data.funcionamiento.grupos.length}`);
  console.log(`   Progr. func.:    ${data.funcionamiento.programas.length}`);
  console.log(`   Progr. inv.:     ${data.inversion.programas.length}`);
  console.log(`   Partida crítica: ${data.partidaCritica.nombre} (${data.partidaCritica.pct}%)`);

  // ── Generar PPTX ─────────────────────────────────────────────────────────────
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title  = `${ent.siglas} — Informe Cierre 2025`;
  pres.author = "Dirección de Presupuesto de la Nación";

  slide1(pres, ent, data);
  slide2(pres, ent, data);
  if (data.inversion.mod > 0) {
    slide3(pres, ent, data);
  }
  slide4(pres, ent, data);

  const fname = path.join(
    process.cwd(),
    `${ent.siglas.replace(/[^a-zA-Z0-9]/g, "_")}_Cierre2025.pptx`
  );
  await pres.writeFile({ fileName: fname });
  console.log(`✅ PPTX generado: ${fname}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}
