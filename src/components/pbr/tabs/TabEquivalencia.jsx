const fmtM = (v) =>
  !v ? "—" : v >= 1e6 ? `B/. ${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `B/. ${(v / 1e3).toFixed(0)}K` : `B/. ${Math.round(v)}`;

export default function TabEquivalencia({ data }) {
  const { equivalencia } = data;

  if (!equivalencia.length)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
        Sin datos de equivalencia registrados.
      </div>
    );

  const anos = [...new Set(equivalencia.map((r) => r.anio))].sort((a, b) => b - a);
  const anio = anos[0];
  const rows = equivalencia.filter((r) => r.anio === anio);

  const trad = rows.filter((r) => r.enfoque === "TRADICIONAL");
  const pbr  = rows.filter((r) => r.enfoque === "PBR");

  const totalTrad = trad.reduce((s, r) => s + (r.monto || 0), 0);
  const totalPbr  = pbr.reduce((s, r) => s + (r.monto || 0), 0);
  const maxMonto  = Math.max(totalTrad, totalPbr, 1);

  const tradFunc = trad.filter((r) => r.tipo_gasto === "FUNCIONAMIENTO" || !r.tipo_gasto);
  const tradInv  = trad.filter((r) => r.tipo_gasto === "INVERSION");

  // Group PbR by programa
  const pbrMap = {};
  pbr.forEach((r) => {
    const k = r.nombre_programa_pbr || r.codigo_pbr || "Sin programa";
    if (!pbrMap[k]) pbrMap[k] = { nombre: k, monto: 0 };
    pbrMap[k].monto += r.monto || 0;
  });
  const pbrProgs = Object.values(pbrMap).sort((a, b) => b.monto - a.monto);
  const maxPbr = Math.max(...pbrProgs.map((p) => p.monto), 1);

  const BarRow = ({ label, monto, max, color }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#374151", flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>{fmtM(monto)}</span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6 }}>
        <div style={{ width: `${(monto / max) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Nota metodológica */}
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: "#1e40af" }}>
        ℹ️ La tabla de equivalencia muestra cómo la estructura presupuestaria <strong>tradicional</strong> (por partidas/objetos de gasto) se convierte a la estructura <strong>PbR</strong> (por programas orientados a resultados). Año {anio}.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Columna Tradicional */}
        <div style={{ background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "white", letterSpacing: "0.04em" }}>ENFOQUE TRADICIONAL</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Por partidas y objetos de gasto · {fmtM(totalTrad)}</div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            {tradFunc.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", marginBottom: 8 }}>FUNCIONAMIENTO</div>
                {tradFunc.map((r, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#cbd5e1", flex: 1, lineHeight: 1.3 }}>
                        {r.nombre_programa_trad || r.codigo_partida || "—"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", flexShrink: 0 }}>{fmtM(r.monto)}</span>
                    </div>
                    <div style={{ background: "#334155", borderRadius: 3, height: 4, marginTop: 4 }}>
                      <div style={{ width: `${((r.monto || 0) / maxMonto) * 100}%`, height: "100%", background: "#64748b", borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tradInv.length > 0 && (
              <div style={{ background: "#78350f20", border: "1px solid #92400e40", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", letterSpacing: "0.08em", marginBottom: 8 }}>INVERSIÓN</div>
                {tradInv.map((r, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#fbbf24", flex: 1, lineHeight: 1.3 }}>
                        {r.nombre_programa_trad || r.codigo_partida || "—"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#fbbf24", flexShrink: 0 }}>{fmtM(r.monto)}</span>
                    </div>
                    <div style={{ background: "#334155", borderRadius: 3, height: 4, marginTop: 4 }}>
                      <div style={{ width: `${((r.monto || 0) / maxMonto) * 100}%`, height: "100%", background: "#d97706", borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!trad.length && <div style={{ color: "#64748b", fontSize: 12 }}>Sin datos.</div>}
          </div>
          {/* Total */}
          <div style={{ padding: "10px 16px", background: "#0f172a", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>TOTAL</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{fmtM(totalTrad)}</span>
          </div>
        </div>

        {/* Columna PbR */}
        <div style={{ background: "#fff", border: "2px solid #0d9488", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", background: "#0d9488", borderBottom: "none" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "white", letterSpacing: "0.04em" }}>ENFOQUE PbR</div>
            <div style={{ fontSize: 10, color: "#ccfbf1", marginTop: 2 }}>Por programas presupuestarios · {fmtM(totalPbr)}</div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            {pbrProgs.length > 0 ? (
              pbrProgs.map((p, i) => (
                <BarRow key={i} label={p.nombre} monto={p.monto} max={maxPbr} color="#0d9488" />
              ))
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>Sin programas PbR.</div>
            )}
          </div>
          {/* Total */}
          <div style={{ padding: "10px 16px", background: "#ccfbf1", borderTop: "1px solid #99f6e4", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46" }}>TOTAL</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0d9488" }}>{fmtM(totalPbr)}</span>
          </div>
        </div>
      </div>

      {/* Diferencia */}
      {totalTrad > 0 && totalPbr > 0 && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11, color: "#64748b", textAlign: "center" }}>
          Diferencia entre enfoques: <strong style={{ color: Math.abs(totalTrad - totalPbr) / Math.max(totalTrad, 1) < 0.01 ? "#065f46" : "#DC2626" }}>
            {fmtM(Math.abs(totalTrad - totalPbr))}
          </strong>
          {Math.abs(totalTrad - totalPbr) / Math.max(totalTrad, 1) < 0.01 && " ✓ Cuadra correctamente"}
        </div>
      )}
    </div>
  );
}
