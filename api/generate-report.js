// Vercel serverless — genera informe HTML ejecutivo con Charts + análisis IA
// Recibe: { nombre_entidad, area, fuente_ingreso, tipo_presupuesto,
//           anio_inicio, anio_fin, grupo_gasto, report_type, report_title, report_icon }
// Retorna: { htmlBase64, filename }

const SUPABASE_URL = "https://eyxgyeybvokvrkrarmzh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5eGd5ZXlidm9rdnJrcmFybXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI5MTksImV4cCI6MjA4ODgwODkxOX0.gE49fWx6FbHjAka3YisRYY7pWhq5Q1P5hhPIYI2ZupE";

function fmtM(n) {
  const v = +n || 0;
  if (Math.abs(v) >= 1e9) return `B/.${(v/1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `B/.${(v/1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `B/.${(v/1e3).toFixed(0)}K`;
  return `B/.${Math.round(v).toLocaleString("en-US")}`;
}
function fmt(n) { return Math.round(+n||0).toLocaleString("en-US"); }
function semColor(p) { if (+p>=90) return "#0B6E4F"; if (+p>=70) return "#C8922A"; return "#C0392B"; }
function semLabel(p) { if (+p>=90) return "Eficiente"; if (+p>=70) return "En riesgo"; return "Crítico"; }
function semBg(p)    { if (+p>=90) return "#E8F5F0"; if (+p>=70) return "#FFF8E1"; return "#FFEBEE"; }
function short(s, n=30) { return s && s.length>n ? s.slice(0,n)+"…" : (s||""); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    nombre_entidad, area, fuente_ingreso, tipo_presupuesto,
    anio_inicio, anio_fin, grupo_gasto,
    report_type = 1, report_title = "Ejecución Presupuestaria", report_icon = "📊"
  } = req.body || {};

  // ── 1. Query Supabase ────────────────────────────────────────────────────────
  let rows;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consultar_informe`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_entidad:     nombre_entidad || null,
        p_area:        area           || null,
        p_fuente:      fuente_ingreso || null,
        p_tipo:        tipo_presupuesto || null,
        p_anio_inicio: anio_inicio    || null,
        p_anio_fin:    anio_fin       || null,
        p_grupo_gasto: grupo_gasto    || null
      })
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    rows = await r.json();
  } catch (e) {
    return res.status(500).json({ error: `Error consultando datos: ${e.message}` });
  }

  if (!rows || rows.length === 0) {
    return res.status(200).json({ htmlBase64: null, filas: 0, message: "Sin resultados para los filtros indicados." });
  }

  // ── 2. KPI globales ─────────────────────────────────────────────────────────
  const totalLey = rows.reduce((s,r)=>s+(+r.total_ley||0), 0);
  const totalMod = rows.reduce((s,r)=>s+(+r.total_mod||0), 0);
  const totalEje = rows.reduce((s,r)=>s+(+r.total_eje||0), 0);
  const pctGlobal = totalMod > 0 ? (totalEje / totalMod * 100) : 0;
  const sinEjecutar = totalMod - totalEje;

  // ── 3. Agrupar por año ───────────────────────────────────────────────────────
  const byYearMap = {};
  for (const r of rows) {
    if (!byYearMap[r.anio]) byYearMap[r.anio] = { ley:0, mod:0, eje:0 };
    byYearMap[r.anio].ley += +r.total_ley||0;
    byYearMap[r.anio].mod += +r.total_mod||0;
    byYearMap[r.anio].eje += +r.total_eje||0;
  }
  const byYear = Object.entries(byYearMap).sort((a,b)=>+a[0]-+b[0]).map(([y,v])=>({
    anio:+y, ...v, pct: v.mod>0 ? +(v.eje/v.mod*100).toFixed(1) : 0
  }));

  // ── 4. Agrupar por dimensión principal según tipo de informe ─────────────────
  const DIM = { 1:"tipo_presupuesto", 2:"fuente_ingreso", 3:"nombre_programa", 4:"anio", 5:"grupo_gasto", 6:"area_desarrollo", 7:"nombre_entidad" };
  const dimKey = DIM[report_type] || "tipo_presupuesto";
  const dimLabel = { 1:"Tipo de Presupuesto", 2:"Fuente de Ingreso", 3:"Programa", 4:"Año", 5:"Grupo de Gasto", 6:"Área de Desarrollo", 7:"Entidad" }[report_type] || "Categoría";

  const byDimMap = {};
  for (const r of rows) {
    const k = r[dimKey] || "(Sin clasificar)";
    if (!byDimMap[k]) byDimMap[k] = { ley:0, mod:0, eje:0 };
    byDimMap[k].ley += +r.total_ley||0;
    byDimMap[k].mod += +r.total_mod||0;
    byDimMap[k].eje += +r.total_eje||0;
  }
  const byDim = Object.entries(byDimMap)
    .sort((a,b)=>b[1].mod - a[1].mod)
    .slice(0,20)
    .map(([k,v])=>({ label:k, ...v, pct: v.mod>0 ? +(v.eje/v.mod*100).toFixed(1) : 0 }));

  // ── 5. Generar narrativa con Claude Haiku ────────────────────────────────────
  const entityLabel = nombre_entidad || (area ? `Sector: ${area}` : "Panamá (consolidado)");
  const periodoLabel = (!anio_inicio && !anio_fin) ? "Todos los años" : anio_inicio === anio_fin ? String(anio_inicio) : `${anio_inicio}–${anio_fin}`;
  const fechaHoy = new Date().toLocaleDateString("es-PA", { day:"2-digit", month:"long", year:"numeric" });

  let narr = "";
  try {
    const apiKey = process.env.ANTHROPIC_KEY;
    if (apiKey) {
      const dataStr = byDim.slice(0,10).map(d=>`- ${d.label}: Ley B/.${(d.ley/1e6).toFixed(1)}M | Mod B/.${(d.mod/1e6).toFixed(1)}M | Eje B/.${(d.eje/1e6).toFixed(1)}M | ${d.pct}%`).join("\n");
      const yearStr = byYear.map(y=>`${y.anio}: Ley B/.${(y.ley/1e6).toFixed(1)}M | Mod B/.${(y.mod/1e6).toFixed(1)}M | Eje B/.${(y.eje/1e6).toFixed(1)}M | ${y.pct}%`).join("\n");

      const prompt = `Eres un analista presupuestario senior del MEF de Panamá (DIPRENA). Redacta el RESUMEN EJECUTIVO en 3 párrafos en español formal usando SOLO los datos reales provistos.

ENTIDAD: ${entityLabel}
PERÍODO: ${periodoLabel}
TIPO DE INFORME: ${report_title}

TOTALES:
- Presupuesto Ley: B/.${(totalLey/1e6).toFixed(1)}M
- Presupuesto Modificado: B/.${(totalMod/1e6).toFixed(1)}M
- Ejecutado: B/.${(totalEje/1e6).toFixed(1)}M
- % Ejecución: ${pctGlobal.toFixed(1)}%
- Sin ejecutar: B/.${(sinEjecutar/1e6).toFixed(1)}M

DESGLOSE POR ${dimLabel.toUpperCase()}:
${dataStr}

EVOLUCIÓN ANUAL:
${yearStr}

Reglas:
- Párrafo 1: Contexto general del presupuesto con cifras clave
- Párrafo 2: Análisis de los principales componentes con hallazgos concretos
- Párrafo 3: Alertas críticas y recomendaciones accionables
- Citar números exactos con B/.
- NO inventar datos fuera de los provistos
- Máximo 120 palabras por párrafo
- Devuelve SOLO los 3 párrafos con etiquetas <p>...</p>, sin títulos ni listas`;

      const cr = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":apiKey, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:900, messages:[{ role:"user", content:prompt }] })
      });
      const cj = await cr.json();
      narr = cj?.content?.[0]?.text || "";
    }
  } catch(e) { /* use template */ }

  if (!narr) {
    narr = `<p>La entidad <strong>${entityLabel}</strong> registró durante el período <strong>${periodoLabel}</strong> un presupuesto modificado de <strong>${fmtM(totalMod)}</strong> frente a un presupuesto Ley de <strong>${fmtM(totalLey)}</strong>, con un monto ejecutado de <strong>${fmtM(totalEje)}</strong>, equivalente a una tasa de ejecución global de <strong>${pctGlobal.toFixed(1)}%</strong>.</p>
<p>El análisis por ${dimLabel.toLowerCase()} identifica a <strong>${byDim[0]?.label||"—"}</strong> como el componente de mayor peso presupuestario con <strong>${fmtM(byDim[0]?.mod||0)}</strong> modificados (${byDim[0]?.pct||0}% ejecutado). Los componentes registran variaciones de ejecución que oscilan entre <strong>${Math.min(...byDim.map(d=>d.pct)).toFixed(1)}%</strong> y <strong>${Math.max(...byDim.map(d=>d.pct)).toFixed(1)}%</strong>.</p>
<p>${pctGlobal<70 ? `⚠️ La tasa de ejecución de <strong>${pctGlobal.toFixed(1)}%</strong> se encuentra en nivel <strong>crítico</strong>. Se recomienda revisión inmediata de cuellos de botella administrativos y reasignación de recursos no comprometidos.` : pctGlobal<90 ? `El indicador de ejecución del <strong>${pctGlobal.toFixed(1)}%</strong> requiere seguimiento para evitar subejecución al cierre del período. Los componentes con ejecución inferior al 70% deben priorizarse.` : `La entidad muestra un desempeño <strong>eficiente</strong> con una ejecución del <strong>${pctGlobal.toFixed(1)}%</strong>, superando el umbral óptimo del 90% establecido por DIPRENA.`}</p>`;
  }

  // ── 6. Preparar datos para Charts.js ────────────────────────────────────────
  const PALETTE = ["#0B6E4F","#C8922A","#1B4FBF","#7B3F9A","#C0392B","#2196F3","#FF9800","#4CAF50","#9C27B0","#F44336","#00BCD4","#795548","#607D8B","#E91E63","#009688"];
  const chartYears   = JSON.stringify(byYear.map(y=>y.anio));
  const chartLey     = JSON.stringify(byYear.map(y=>+(y.ley/1e6).toFixed(2)));
  const chartMod     = JSON.stringify(byYear.map(y=>+(y.mod/1e6).toFixed(2)));
  const chartEje     = JSON.stringify(byYear.map(y=>+(y.eje/1e6).toFixed(2)));
  const chartPct     = JSON.stringify(byYear.map(y=>+y.pct.toFixed(1)));
  const chartDimLbls = JSON.stringify(byDim.slice(0,12).map(d=>short(d.label, 28)));
  const chartDimMod  = JSON.stringify(byDim.slice(0,12).map(d=>+(d.mod/1e6).toFixed(2)));
  const chartDimEje  = JSON.stringify(byDim.slice(0,12).map(d=>+(d.eje/1e6).toFixed(2)));
  const chartDimPct  = JSON.stringify(byDim.slice(0,12).map(d=>+d.pct.toFixed(1)));
  const chartColors  = JSON.stringify(byDim.slice(0,12).map((d,i)=>PALETTE[i%PALETTE.length]));
  const chartSemColors = JSON.stringify(byDim.slice(0,12).map(d=>semColor(d.pct)));

  // Top hallazgos
  const topAlerta = byDim.filter(d=>d.pct<70).sort((a,b)=>b.mod-a.mod).slice(0,3);
  const topBueno  = byDim.filter(d=>d.pct>=90).sort((a,b)=>b.mod-a.mod).slice(0,3);

  // Tabla de datos
  const tableRows = byDim.map(d => `
    <tr>
      <td>${d.label}</td>
      <td class="td-num">${fmt(d.ley)}</td>
      <td class="td-num">${fmt(d.mod)}</td>
      <td class="td-num">${fmt(d.eje)}</td>
      <td class="td-num">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:50px;height:7px;border-radius:4px;background:#DDE3EC;vertical-align:middle;">
            <span style="display:block;width:${Math.min(d.pct,100)}%;height:7px;border-radius:4px;background:${semColor(d.pct)};"></span>
          </span>
          <strong style="color:${semColor(d.pct)}">${d.pct.toFixed(1)}%</strong>
        </span>
      </td>
    </tr>`).join("");

  const tableYears = byYear.map(y => `
    <tr>
      <td><strong>${y.anio}</strong></td>
      <td class="td-num">${fmt(y.ley)}</td>
      <td class="td-num">${fmt(y.mod)}</td>
      <td class="td-num">${fmt(y.eje)}</td>
      <td class="td-num">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:50px;height:7px;border-radius:4px;background:#DDE3EC;vertical-align:middle;">
            <span style="display:block;width:${Math.min(y.pct,100)}%;height:7px;border-radius:4px;background:${semColor(y.pct)};"></span>
          </span>
          <strong style="color:${semColor(y.pct)}">${y.pct.toFixed(1)}%</strong>
        </span>
      </td>
    </tr>`).join("");

  // ── 7. Build HTML ────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Informe ${report_title} — ${entityLabel} ${periodoLabel}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  :root {
    --verde:#0B6E4F; --verde-claro:#1A9E72; --verde-palido:#E8F5F0;
    --dorado:#C8922A; --dorado-claro:#F5C842;
    --azul:#1B4FBF; --rojo:#C0392B;
    --gris-oscuro:#1A1A2E; --gris-medio:#4A4A6A;
    --gris-claro:#F4F6F8; --borde:#DDE3EC;
    --blanco:#FFFFFF; --texto:#1A1A2E; --texto-suave:#5A6070;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Sora',sans-serif;background:var(--gris-claro);color:var(--texto);font-size:14px;line-height:1.7;}

  /* PORTADA */
  .portada{background:var(--gris-oscuro);color:white;padding:60px 80px 50px;position:relative;overflow:hidden;page-break-after:always;}
  .portada::before{content:'';position:absolute;top:-80px;right:-80px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(26,158,114,0.15) 0%,transparent 70%);}
  .portada::after{content:'';position:absolute;bottom:-60px;left:40%;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(200,146,42,0.1) 0%,transparent 70%);}
  .logo-row{display:flex;align-items:center;gap:12px;margin-bottom:48px;position:relative;z-index:1;}
  .logo-badge{background:var(--verde);color:white;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:.08em;}
  .logo-sep{color:rgba(255,255,255,.3);font-size:16px;}
  .logo-sub{color:rgba(255,255,255,.5);font-size:12px;font-weight:500;}
  .ia-badge{margin-left:auto;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);padding:5px 12px;border-radius:20px;font-size:11px;color:rgba(255,255,255,.7);}
  .ia-dot{width:7px;height:7px;border-radius:50%;background:var(--verde-claro);animation:pulso 2s ease-in-out infinite;}
  @keyframes pulso{0%,100%{opacity:1}50%{opacity:.3}}
  .portada-tipo{font-size:12px;font-weight:600;letter-spacing:.12em;color:var(--verde-claro);text-transform:uppercase;margin-bottom:16px;position:relative;z-index:1;}
  .portada-titulo{font-size:36px;font-weight:700;line-height:1.2;margin-bottom:16px;position:relative;z-index:1;}
  .portada-titulo span{color:var(--dorado-claro);}
  .portada-subtitulo{font-size:14px;color:rgba(255,255,255,.6);margin-bottom:40px;position:relative;z-index:1;}
  .portada-meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;position:relative;z-index:1;}
  .meta-item{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:14px 16px;}
  .meta-label{font-size:10px;font-weight:600;letter-spacing:.08em;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:4px;}
  .meta-valor{font-size:13px;font-weight:600;color:white;}

  /* CONTENIDO */
  .contenido{max-width:1100px;margin:0 auto;padding:40px 40px 60px;}

  /* KPIs */
  .resumen-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:36px;}
  .kpi-card{background:var(--blanco);border-radius:14px;padding:22px 24px;border:1px solid var(--borde);position:relative;overflow:hidden;}
  .kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
  .kpi-card.verde::before{background:var(--verde);}
  .kpi-card.dorado::before{background:var(--dorado);}
  .kpi-card.azul::before{background:var(--azul);}
  .kpi-card.rojo::before{background:var(--rojo);}
  .kpi-label{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--texto-suave);text-transform:uppercase;margin-bottom:10px;}
  .kpi-valor{font-size:26px;font-weight:700;color:var(--gris-oscuro);margin-bottom:4px;font-family:'IBM Plex Mono',monospace;}
  .kpi-sub{font-size:11px;color:var(--texto-suave);margin-bottom:8px;}
  .kpi-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:700;}
  .badge-verde{background:var(--verde-palido);color:var(--verde);}
  .badge-amarillo{background:#FFF8E1;color:#7A4800;}
  .badge-rojo{background:#FFEBEE;color:var(--rojo);}

  /* SECCIONES */
  .seccion{background:var(--blanco);border-radius:16px;border:1px solid var(--borde);padding:32px;margin-bottom:24px;}
  .seccion-header{display:flex;align-items:flex-start;gap:16px;margin-bottom:24px;}
  .seccion-num{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:var(--gris-oscuro);color:white;font-size:13px;font-weight:700;flex-shrink:0;}
  .seccion-titulo{font-size:17px;font-weight:700;color:var(--gris-oscuro);margin-bottom:3px;}
  .seccion-desc{font-size:12px;color:var(--texto-suave);}
  .analisis p{color:var(--texto-suave);font-size:13.5px;line-height:1.75;margin-bottom:14px;}
  .analisis p strong{color:var(--gris-oscuro);}
  .hallazgo{background:var(--verde-palido);border-left:4px solid var(--verde);border-radius:8px;padding:14px 18px;margin-top:18px;font-size:13px;color:var(--gris-oscuro);}
  .hallazgo strong{color:var(--verde);}
  .alerta{background:#FFEBEE;border-left:4px solid var(--rojo);border-radius:8px;padding:14px 18px;margin-top:14px;font-size:13px;color:var(--gris-oscuro);}
  .alerta strong{color:var(--rojo);}
  .advertencia{background:#FFF8E1;border-left:4px solid var(--dorado);border-radius:8px;padding:14px 18px;margin-top:14px;font-size:13px;color:var(--gris-oscuro);}

  /* CHARTS */
  .chart-grid{display:grid;gap:24px;margin:20px 0;}
  .chart-grid-1{grid-template-columns:1fr;}
  .chart-grid-2{grid-template-columns:1fr 1fr;}
  .chart-grid-3{grid-template-columns:3fr 2fr;}
  .chart-box{background:var(--gris-claro);border-radius:12px;padding:20px;}
  .chart-titulo{font-size:13px;font-weight:600;color:var(--gris-oscuro);margin-bottom:3px;}
  .chart-subtitulo{font-size:11px;color:var(--texto-suave);margin-bottom:14px;}
  .chart-container{position:relative;}

  /* TABLA */
  .tabla-wrap{overflow-x:auto;margin:20px 0;border-radius:10px;border:1px solid var(--borde);}
  table{width:100%;border-collapse:collapse;}
  th{background:var(--gris-oscuro);color:white;padding:10px 14px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.05em;white-space:nowrap;}
  th.td-num,td.td-num{text-align:right;}
  td{padding:9px 14px;border-bottom:1px solid var(--borde);font-size:12.5px;color:var(--gris-oscuro);}
  tr:last-child td{border-bottom:none;}
  tr:nth-child(even) td{background:#F9FAFB;}
  tr:hover td{background:#EFF6FF;}

  /* FOOTER */
  .footer-informe{text-align:center;padding:32px 40px;color:var(--texto-suave);font-size:11px;border-top:1px solid var(--borde);}

  @media print{
    .portada{page-break-after:always;}
    .seccion{page-break-inside:avoid;}
    body{background:white;}
  }
</style>
</head>
<body>

<!-- PORTADA -->
<div class="portada">
  <div class="logo-row">
    <span class="logo-badge">PANANOMICS.IA</span>
    <span class="logo-sep">·</span>
    <span class="logo-sub">MEF · DIPRENA</span>
    <span class="ia-badge"><span class="ia-dot"></span> Generado con Panamita IA</span>
  </div>
  <div class="portada-tipo">Informe #${report_type} — ${report_title}</div>
  <h1 class="portada-titulo">${report_icon} <span>${report_title}</span><br>${entityLabel}</h1>
  <p class="portada-subtitulo">Análisis presupuestario basado en datos reales de DIPRENA · MEF Panamá</p>
  <div class="portada-meta">
    <div class="meta-item"><div class="meta-label">Entidad / Alcance</div><div class="meta-valor">${entityLabel}</div></div>
    <div class="meta-item"><div class="meta-label">Período</div><div class="meta-valor">${periodoLabel}</div></div>
    <div class="meta-item"><div class="meta-label">Registros analizados</div><div class="meta-valor">${rows.length.toLocaleString()} filas</div></div>
    <div class="meta-item"><div class="meta-label">Fecha de generación</div><div class="meta-valor">${fechaHoy}</div></div>
  </div>
</div>

<div class="contenido">

  <!-- KPIs -->
  <div class="resumen-grid">
    <div class="kpi-card verde">
      <div class="kpi-label">Presupuesto Ley</div>
      <div class="kpi-valor">${fmtM(totalLey)}</div>
      <div class="kpi-sub">Asignación original aprobada</div>
      <span class="kpi-badge badge-verde">${periodoLabel}</span>
    </div>
    <div class="kpi-card azul">
      <div class="kpi-label">Presupuesto Modificado</div>
      <div class="kpi-valor">${fmtM(totalMod)}</div>
      <div class="kpi-sub">Vigente con modificaciones</div>
      <span class="kpi-badge ${totalMod>totalLey?"badge-amarillo":"badge-verde"}">${totalMod>totalLey?"↑ Ampliado":"Sin cambios"}</span>
    </div>
    <div class="kpi-card dorado">
      <div class="kpi-label">Total Ejecutado</div>
      <div class="kpi-valor">${fmtM(totalEje)}</div>
      <div class="kpi-sub">Devengado acumulado</div>
      <span class="kpi-badge ${pctGlobal>=90?"badge-verde":pctGlobal>=70?"badge-amarillo":"badge-rojo"}">${pctGlobal>=90?"↑":"↓"} ${pctGlobal.toFixed(1)}% ejecución</span>
    </div>
    <div class="kpi-card rojo">
      <div class="kpi-label">Sin Ejecutar</div>
      <div class="kpi-valor">${fmtM(sinEjecutar)}</div>
      <div class="kpi-sub">Presupuesto no utilizado</div>
      <span class="kpi-badge ${sinEjecutar/totalMod<0.1?"badge-verde":sinEjecutar/totalMod<0.3?"badge-amarillo":"badge-rojo"}">${(sinEjecutar/totalMod*100).toFixed(1)}% del total</span>
    </div>
  </div>

  <!-- SECCIÓN 01: Resumen Ejecutivo -->
  <div class="seccion">
    <div class="seccion-header">
      <span class="seccion-num">01</span>
      <div>
        <div class="seccion-titulo">Resumen Ejecutivo</div>
        <div class="seccion-desc">Hallazgos principales generados por Panamita IA · ${fechaHoy}</div>
      </div>
    </div>
    <div class="analisis">${narr}</div>
    ${topAlerta.length>0 ? `<div class="alerta">⚠️ <strong>Alerta de subejecución:</strong> ${topAlerta.map(d=>`<strong>${d.label}</strong> (${d.pct.toFixed(1)}% — ${fmtM(d.mod)} modificados)`).join(", ")} registran ejecución crítica por debajo del 70%.</div>` : ""}
    ${topBueno.length>0 && topAlerta.length===0 ? `<div class="hallazgo">✅ <strong>Desempeño destacado:</strong> ${topBueno.map(d=>`<strong>${d.label}</strong> (${d.pct.toFixed(1)}%)`).join(", ")} superan el umbral óptimo del 90%.</div>` : ""}
  </div>

  <!-- SECCIÓN 02: Visualización -->
  <div class="seccion">
    <div class="seccion-header">
      <span class="seccion-num">02</span>
      <div>
        <div class="seccion-titulo">Visualización por ${dimLabel}</div>
        <div class="seccion-desc">Presupuesto Modificado vs Ejecutado · en millones de balboas (B/.M)</div>
      </div>
    </div>
    <div class="chart-grid chart-grid-1">
      <div class="chart-box">
        <div class="chart-titulo">Ejecución por ${dimLabel}</div>
        <div class="chart-subtitulo">Modificado (barra clara) vs Ejecutado (barra oscura) · B/.M</div>
        <div class="chart-container" style="height:${Math.max(240, byDim.slice(0,12).length*34)}px">
          <canvas id="barDim"></canvas>
        </div>
      </div>
    </div>
    ${byYear.length > 1 ? `
    <div class="chart-grid chart-grid-2">
      <div class="chart-box">
        <div class="chart-titulo">Evolución anual — Ley · Modificado · Ejecutado</div>
        <div class="chart-subtitulo">en millones de balboas (B/.M)</div>
        <div class="chart-container" style="height:240px"><canvas id="lineAnual"></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-titulo">Tasa de ejecución por año (%)</div>
        <div class="chart-subtitulo">Semáforo: verde ≥90% · amarillo ≥70% · rojo &lt;70%</div>
        <div class="chart-container" style="height:240px"><canvas id="barPct"></canvas></div>
      </div>
    </div>` : ""}
  </div>

  <!-- SECCIÓN 03: Tabla de datos por dimensión -->
  <div class="seccion">
    <div class="seccion-header">
      <span class="seccion-num">03</span>
      <div>
        <div class="seccion-titulo">Detalle por ${dimLabel}</div>
        <div class="seccion-desc">Presupuesto Ley · Modificado · Ejecutado · % Ejecución — en Balboas (B/.)</div>
      </div>
    </div>
    <div class="tabla-wrap">
      <table>
        <thead><tr>
          <th>${dimLabel}</th>
          <th class="td-num">Ley (B/.)</th>
          <th class="td-num">Modificado (B/.)</th>
          <th class="td-num">Ejecutado (B/.)</th>
          <th class="td-num">% Ejecución</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>

  ${byYear.length > 1 ? `
  <!-- SECCIÓN 04: Evolución anual -->
  <div class="seccion">
    <div class="seccion-header">
      <span class="seccion-num">04</span>
      <div>
        <div class="seccion-titulo">Evolución Anual</div>
        <div class="seccion-desc">Comparativo año a año · en Balboas (B/.)</div>
      </div>
    </div>
    <div class="tabla-wrap">
      <table>
        <thead><tr>
          <th>Año</th>
          <th class="td-num">Ley (B/.)</th>
          <th class="td-num">Modificado (B/.)</th>
          <th class="td-num">Ejecutado (B/.)</th>
          <th class="td-num">% Ejecución</th>
        </tr></thead>
        <tbody>${tableYears}</tbody>
      </table>
    </div>
  </div>` : ""}

</div>

<div class="footer-informe">
  <strong>PANANOMICS.IA</strong> · Dirección de Presupuesto de la Nación · MEF Panamá · Datos: DIPRENA<br>
  Este informe fue generado automáticamente. Los datos provienen de las tablas oficiales de ejecución presupuestaria.
</div>

<script>
const VERDE = '#0B6E4F', VERDE2 = 'rgba(11,110,79,0.18)';
const AZUL  = '#1B4FBF', AZUL2  = 'rgba(27,79,191,0.18)';
const DORADO= '#C8922A', GRIS   = '#6B7A8D';
const ROJO  = '#C0392B';
const PALETTE = ${chartColors};
const SEM_COLORS = ${chartSemColors};

// Gráfico horizontal: por dimensión
const ctxDim = document.getElementById('barDim');
if (ctxDim) {
  new Chart(ctxDim, {
    type: 'bar',
    data: {
      labels: ${chartDimLbls},
      datasets: [
        { label: 'Modificado (B/.M)', data: ${chartDimMod}, backgroundColor: PALETTE.map(c=>c+'55'), borderColor: PALETTE, borderWidth: 1.5, borderRadius: 3 },
        { label: 'Ejecutado (B/.M)',  data: ${chartDimEje}, backgroundColor: PALETTE, borderRadius: 3 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position:'top' } },
      scales: {
        x: { beginAtZero:true, title:{ display:true, text:'B/.M' } },
        y: { ticks: { font:{ size:11 } } }
      }
    }
  });
}

// Línea: evolución anual
const ctxLine = document.getElementById('lineAnual');
if (ctxLine) {
  new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: ${chartYears},
      datasets: [
        { label:'Ley (B/.M)',        data:${chartLey}, borderColor:GRIS,  borderDash:[5,5], pointRadius:4, tension:0.3, fill:false },
        { label:'Modificado (B/.M)', data:${chartMod}, borderColor:AZUL,  pointRadius:4, tension:0.3, fill:false, borderWidth:2 },
        { label:'Ejecutado (B/.M)',  data:${chartEje}, borderColor:VERDE, backgroundColor:'rgba(11,110,79,0.07)', fill:true, pointRadius:4, tension:0.3, borderWidth:2.5 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:{size:11} } } },
      scales:{ x:{ ticks:{font:{size:11}} }, y:{ beginAtZero:false, ticks:{font:{size:11}} } }
    }
  });
}

// Barras: tasa de ejecución por año
const ctxPct = document.getElementById('barPct');
if (ctxPct) {
  new Chart(ctxPct, {
    type: 'bar',
    data: {
      labels: ${chartYears},
      datasets:[{ label:'% Ejecución', data:${chartPct}, backgroundColor:${chartPct}.map(p=>p>=90?VERDE:p>=70?DORADO:ROJO), borderRadius:5 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>`${ctx.raw}%` } } },
      scales:{
        x:{ticks:{font:{size:11}}},
        y:{beginAtZero:true, max:110, ticks:{ font:{size:11}, callback:v=>v+'%' },
           grid:{ color:c=>c.tick.value===90?'rgba(11,110,79,0.4)':c.tick.value===70?'rgba(200,146,42,0.4)':'rgba(0,0,0,0.05)' }}
      }
    }
  });
}
</script>
</body>
</html>`;

  const htmlBase64 = Buffer.from(html).toString("base64");
  const entSlug = (nombre_entidad || area || "Panama").replace(/\s+/g,"_").slice(0,25);
  const typeSlug = ["ejec","fuentes","inversion","historico","grupos","sectorial","ranking"][report_type-1] || "informe";
  const filename = `informe_${entSlug}_${typeSlug}_${anio_inicio||"all"}${anio_fin&&anio_fin!==anio_inicio?"_"+anio_fin:""}.html`.replace(/[^a-zA-Z0-9_.\-]/g,"_");

  return res.status(200).json({ htmlBase64, filename, filas: rows.length });
};
