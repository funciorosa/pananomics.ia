const fmtM = (v) =>
  !v ? "—" : v >= 1e6 ? `B/. ${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `B/. ${(v / 1e3).toFixed(0)}K` : `B/. ${Math.round(v)}`;

const ANOS = [2024, 2025, 2026];

export default function TabPlurianual({ data }) {
  const { plurianual } = data;

  if (!plurianual.length)
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 12 }}>Sin datos plurianuales registrados.</div>
      </div>
    );

  // Group by programa
  const progMap = {};
  plurianual.forEach((r) => {
    const k = r.codigo_programa;
    if (!progMap[k]) progMap[k] = { codigo: k, nombre: r.nombre_programa || k, tipo: r.tipo_programa, years: {} };
    progMap[k].years[r.anio] = { presupuesto: r.presupuesto, meta: r.meta, metrica: r.indicador_metrica, unidad: r.unidad_medida, es_real: r.es_real };
  });
  const progs = Object.values(progMap);

  // Totals per year
  const totales = {};
  ANOS.forEach((a) => {
    totales[a] = progs.reduce((s, p) => s + (p.years[a]?.presupuesto || 0), 0);
  });

  const COL_STYLE = { padding: "10px 14px", textAlign: "right", fontSize: 12, fontWeight: 600 };
  const HEAD_STYLE = { padding: "10px 14px", textAlign: "right", fontSize: 10, fontWeight: 700, color: "white", letterSpacing: "0.07em" };

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Nota indicativa */}
      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: "#92400E" }}>
        ⚠️ Los datos del año <strong>2026</strong> son indicativos y sujetos a aprobación presupuestaria. Valores en Millones de Balboas (B/).
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1e3a5f" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "white", letterSpacing: "0.06em", width: "36%" }}>PROGRAMA</th>
              <th style={{ padding: "12px 14px", textAlign: "center", fontSize: 9, fontWeight: 700, color: "#93c5fd", letterSpacing: "0.08em" }}>INDICADOR / UNIDAD</th>
              {ANOS.map((a) => (
                <th key={a} style={{ ...HEAD_STYLE, background: a === 2026 ? "#0d4a40" : undefined }}>
                  {a}
                  {a === 2024 && <div style={{ fontSize: 8, color: "#93c5fd", fontWeight: 400 }}>BASE</div>}
                  {a === 2025 && <div style={{ fontSize: 8, color: "#93c5fd", fontWeight: 400 }}>REAL</div>}
                  {a === 2026 && <div style={{ fontSize: 8, color: "#6ee7b7", fontWeight: 400 }}>INDICATIVO</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {progs.map((prog, idx) => (
              <tr key={prog.codigo} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{prog.nombre}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
                    {prog.codigo}
                    {prog.tipo && (
                      <span style={{ marginLeft: 6, background: prog.tipo === "MISIONAL" ? "#d1fae5" : "#f1f5f9", color: prog.tipo === "MISIONAL" ? "#065f46" : "#64748b", fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 5px" }}>
                        {prog.tipo}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  {(prog.years[2025]?.metrica || prog.years[2024]?.metrica) && (
                    <div style={{ fontSize: 10, color: "#374151" }}>
                      {prog.years[2025]?.metrica || prog.years[2024]?.metrica}
                      <span style={{ color: "#94a3b8" }}> / {prog.years[2025]?.unidad || prog.years[2024]?.unidad || ""}</span>
                    </div>
                  )}
                </td>
                {ANOS.map((a) => {
                  const yr = prog.years[a];
                  return (
                    <td key={a} style={{ ...COL_STYLE, background: a === 2026 ? "#f0fdf4" : undefined }}>
                      <div style={{ color: a === 2026 ? "#065f46" : "#1e293b" }}>{fmtM(yr?.presupuesto)}</div>
                      {yr?.meta != null && (
                        <div style={{ fontSize: 10, color: "#0d9488", marginTop: 1 }}>Meta: {yr.meta}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Totales */}
            <tr style={{ background: "#0d9488" }}>
              <td colSpan={2} style={{ padding: "10px 16px", fontSize: 12, fontWeight: 800, color: "white", letterSpacing: "0.04em" }}>
                TOTAL
              </td>
              {ANOS.map((a) => (
                <td key={a} style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontWeight: 800, color: "white" }}>
                  {fmtM(totales[a])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
