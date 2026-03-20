import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PILAR_COLORS = { A: "#1565C0", B: "#2E7D32", C: "#E65100", D: "#0d9488" };

const fmtM = (v) =>
  !v ? "—" : v >= 1e6 ? `B/. ${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `B/. ${(v / 1e3).toFixed(0)}K` : `B/. ${Math.round(v)}`;

export default function TabPerfil({ data }) {
  const { entidad, programas, ejes, ods } = data;
  const [ejeOpen, setEjeOpen] = useState(null);

  if (!entidad) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Sin datos de perfil.</div>;

  // Latest year programas
  const maxAnio = programas.length ? Math.max(...programas.map((p) => p.anio)) : null;
  const progLatest = maxAnio ? programas.filter((p) => p.anio === maxAnio && p.tipo_programa === "MISIONAL") : [];

  // Donut data
  const pRes = entidad.pct_presupuesto_resultados || 0;
  const pAdm = entidad.pct_presupuesto_admin || 0;
  const pOtr = Math.max(0, 100 - pRes - pAdm);
  const donutData = [
    { name: "Resultados", value: pRes, color: "#0d9488" },
    { name: "Admin.", value: pAdm, color: "#1565C0" },
    ...(pOtr > 0 ? [{ name: "Otros", value: pOtr, color: "#94a3b8" }] : []),
  ];

  // ODS linked to this entity (latest year)
  const maxOdsAnio = ods.length ? Math.max(...ods.map((o) => o.anio)) : null;
  const odsLinked = maxOdsAnio ? [...new Set(ods.filter((o) => o.anio === maxOdsAnio).map((o) => o.ods_numero))] : [];

  const pilares2025 = Array.isArray(entidad.pilares_peg_2025) ? entidad.pilares_peg_2025 : [];

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Misión / Visión */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {[
          { titulo: "Misión", texto: entidad.mision, icon: "🎯" },
          { titulo: "Visión", texto: entidad.vision, icon: "🔭" },
        ].map((card) => (
          <div key={card.titulo} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", borderTop: "3px solid #1e3a5f" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", marginBottom: 8 }}>
              {card.icon} {card.titulo.toUpperCase()}
            </div>
            <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.7, margin: 0 }}>
              {card.texto || <span style={{ color: "#94a3b8" }}>No registrada</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Donut + Cadena de Resultados */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, marginBottom: 20 }}>
        {/* Donut */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", marginBottom: 12 }}>
            DISTRIBUCIÓN PRESUPUESTARIA
          </div>
          {pRes > 0 || pAdm > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
              Sin datos de distribución
            </div>
          )}
        </div>

        {/* Cadena de Resultados */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
            CADENA DE RESULTADOS
          </div>
          <div style={{ display: "flex", minHeight: 200 }}>
            {/* Etiqueta vertical */}
            <div style={{ width: 28, flexShrink: 0, background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", transform: "rotate(-90deg)", whiteSpace: "nowrap" }}>
                Cadena de Resultados
              </span>
            </div>
            {/* Bandas */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* Banda 1 — ODS */}
              <div style={{ background: "#373737", padding: "10px 14px", flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>ODS AGENDA 2030</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {odsLinked.length > 0 ? odsLinked.map((n) => (
                    <span key={n} style={{ background: "#E5243B", color: "white", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px" }}>
                      ODS {n}
                    </span>
                  )) : <span style={{ color: "#64748b", fontSize: 11 }}>Sin ODS vinculados</span>}
                </div>
              </div>
              {/* Banda 2 — PEG */}
              <div style={{ background: "#1d3558", padding: "10px 14px", flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>PEG 2025–2029</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["A", "B", "C", "D"].map((p) => {
                    const active = pilares2025.includes(p);
                    return (
                      <span key={p} style={{ background: active ? PILAR_COLORS[p] : "transparent", border: `1.5px solid ${PILAR_COLORS[p]}`, color: active ? "white" : PILAR_COLORS[p], fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 10px", opacity: active ? 1 : 0.4 }}>
                        Pilar {p}
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* Banda 3 — MIRE / Ejes */}
              <div style={{ background: "#1e3050", padding: "10px 14px", flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>PRIORIDADES ESTRATÉGICAS</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {ejes.length > 0 ? ejes.map((e) => (
                    <span key={e.numero_eje} style={{ background: "#ffffff18", border: "1px solid #ffffff30", color: "white", fontSize: 10, borderRadius: 5, padding: "2px 8px" }}>
                      Eje {e.numero_eje}
                    </span>
                  )) : <span style={{ color: "#64748b", fontSize: 11 }}>Sin ejes registrados</span>}
                </div>
              </div>
              {/* Banda 4 — Presupuesto */}
              <div style={{ background: "#162035", padding: "10px 14px", flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>ESTRUCTURA PRESUPUESTARIA</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {progLatest.length > 0 ? progLatest.slice(0, 5).map((p) => (
                    <span key={p.codigo_programa} style={{ background: "#0d948820", border: "1px solid #0d948860", color: "#5eead4", fontSize: 10, borderRadius: 5, padding: "2px 8px" }}>
                      {p.nombre_programa.length > 28 ? p.nombre_programa.slice(0, 27) + "…" : p.nombre_programa}
                    </span>
                  )) : <span style={{ color: "#64748b", fontSize: 11 }}>Sin programas misionales</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ejes Estratégicos */}
      {ejes.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", marginBottom: 12 }}>
            EJES ESTRATÉGICOS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ejes.map((eje) => {
              const pilarStr = eje.pilares_peg_2025 || "";
              const pilares = pilarStr ? pilarStr.split(",").map((p) => p.trim()).filter(Boolean) : [];
              return (
                <div key={eje.numero_eje} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <button
                    onClick={() => setEjeOpen(ejeOpen === eje.numero_eje ? null : eje.numero_eje)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: ejeOpen === eje.numero_eje ? "#f0f9ff" : "#f8fafc", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#1e3a5f", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {eje.numero_eje}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{eje.titulo_eje}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {pilares.map((p) => (
                        <span key={p} style={{ background: PILAR_COLORS[p] || "#94a3b8", color: "white", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>
                          {p}
                        </span>
                      ))}
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 4 }}>{ejeOpen === eje.numero_eje ? "▲" : "▼"}</span>
                  </button>
                  {ejeOpen === eje.numero_eje && eje.descripcion_eje && (
                    <div style={{ padding: "10px 14px 12px 50px", background: "#f0f9ff", borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                      {eje.descripcion_eje}
                      {eje.indicadores_resultado && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "#0d9488" }}>
                          <strong>Indicador de resultado:</strong> {eje.indicadores_resultado}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer programs note */}
      {maxAnio && (
        <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8", textAlign: "right" }}>
          Datos de programas: año {maxAnio} · {fmtM(0)} referencia presupuestaria
        </div>
      )}
    </div>
  );
}
