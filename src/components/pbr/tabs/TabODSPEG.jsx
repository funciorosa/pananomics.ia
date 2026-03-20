import { useState } from "react";

const ODS_INFO = {
  1:  { color: "#E5243B", nombre: "Fin de la Pobreza" },
  2:  { color: "#DDA63A", nombre: "Hambre Cero" },
  3:  { color: "#4C9F38", nombre: "Salud y Bienestar" },
  4:  { color: "#C5192D", nombre: "Educación de Calidad" },
  5:  { color: "#FF3A21", nombre: "Igualdad de Género" },
  6:  { color: "#26BDE2", nombre: "Agua Limpia" },
  7:  { color: "#FCC30B", nombre: "Energía Asequible" },
  8:  { color: "#A21942", nombre: "Trabajo Decente" },
  9:  { color: "#FD6925", nombre: "Industria e Innovación" },
  10: { color: "#DD1367", nombre: "Reducción de Desigualdades" },
  11: { color: "#FD9D24", nombre: "Ciudades Sostenibles" },
  12: { color: "#BF8B2E", nombre: "Producción Responsable" },
  13: { color: "#3F7E44", nombre: "Acción por el Clima" },
  14: { color: "#0A97D9", nombre: "Vida Submarina" },
  15: { color: "#56C02B", nombre: "Vida en Ecosistemas" },
  16: { color: "#00689D", nombre: "Paz y Justicia" },
  17: { color: "#19486A", nombre: "Alianzas" },
};

const PILAR_COLORS = { A: "#1565C0", B: "#2E7D32", C: "#E65100", D: "#0d9488" };
const PILAR_NOMBRES = {
  A: "Crecimiento Económico",
  B: "Desarrollo Social",
  C: "Sostenibilidad Ambiental",
  D: "Gobernanza e Institucionalidad",
};

export default function TabODSPEG({ data }) {
  const { ods, ejes, entidad } = data;
  const [odsActivo, setOdsActivo] = useState(null);

  const maxAnio = ods.length ? Math.max(...ods.map((o) => o.anio)) : null;
  const odsLatest = maxAnio ? ods.filter((o) => o.anio === maxAnio) : [];
  const odsNums = new Set(odsLatest.map((o) => o.ods_numero));

  const pilares2025 = Array.isArray(entidad?.pilares_peg_2025) ? entidad.pilares_peg_2025 : [];

  const odsActivoData = odsActivo ? odsLatest.filter((o) => o.ods_numero === odsActivo) : [];

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* ODS Grid */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em" }}>
            OBJETIVOS DE DESARROLLO SOSTENIBLE — AGENDA 2030
          </div>
          <span style={{ fontSize: 10, color: "#64748b" }}>
            {odsNums.size} de 17 vinculados
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => {
            const info = ODS_INFO[n];
            const vinculado = odsNums.has(n);
            const activo = odsActivo === n;
            return (
              <button
                key={n}
                onClick={() => vinculado && setOdsActivo(activo ? null : n)}
                style={{
                  background: info.color,
                  border: activo ? `3px solid white` : vinculado ? `2px solid ${info.color}` : "2px solid transparent",
                  borderRadius: 8,
                  padding: "10px 6px",
                  cursor: vinculado ? "pointer" : "default",
                  opacity: vinculado ? 1 : 0.25,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  outline: activo ? `3px solid ${info.color}` : "none",
                  boxShadow: activo ? `0 0 0 2px ${info.color}40` : vinculado ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: "white", lineHeight: 1 }}>{n}</span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 1.2 }}>
                  {info.nombre}
                </span>
                {vinculado && (
                  <span style={{ fontSize: 9, color: "white", fontWeight: 700, background: "rgba(255,255,255,0.25)", borderRadius: 3, padding: "1px 4px" }}>
                    ✓ vinculado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ODS detalle */}
      {odsActivo && odsActivoData.length > 0 && (
        <div style={{ background: "#fff", border: `2px solid ${ODS_INFO[odsActivo].color}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: ODS_INFO[odsActivo].color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: "white" }}>{odsActivo}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>ODS {odsActivo} — {ODS_INFO[odsActivo].nombre}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Año {maxAnio} · {odsActivoData.length} meta(s) vinculada(s)</div>
            </div>
            <button onClick={() => setOdsActivo(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {odsActivoData.map((o, i) => (
              <div key={i} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${ODS_INFO[odsActivo].color}` }}>
                {o.meta_ods && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>META ODS </span>
                    <span style={{ fontSize: 12, color: "#374151" }}>{o.meta_ods}</span>
                  </div>
                )}
                {o.indicador_ods && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>INDICADOR </span>
                    <span style={{ fontSize: 12, color: "#374151" }}>{o.indicador_ods}</span>
                  </div>
                )}
                {o.pilar_peg && (
                  <div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>PILAR PEG </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: PILAR_COLORS[o.pilar_peg] || "#64748b" }}>
                      {o.pilar_peg} — {PILAR_NOMBRES[o.pilar_peg] || ""}
                    </span>
                    {o.area_clave_peg && <span style={{ fontSize: 11, color: "#64748b" }}> · {o.area_clave_peg}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pilares PEG */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", marginBottom: 14 }}>
          PLAN ESTRATÉGICO DE GOBIERNO 2025–2029 — PILARES VINCULADOS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["A", "B", "C", "D"].map((p) => {
            const active = pilares2025.includes(p);
            const odsForPilar = [...new Set(odsLatest.filter((o) => o.pilar_peg === p).map((o) => o.ods_numero))];
            const areasForPilar = [...new Set(odsLatest.filter((o) => o.pilar_peg === p && o.area_clave_peg).map((o) => o.area_clave_peg))];
            return (
              <div key={p} style={{ borderLeft: `4px solid ${active ? PILAR_COLORS[p] : "#e2e8f0"}`, borderRadius: "0 8px 8px 0", padding: "12px 16px", background: active ? `${PILAR_COLORS[p]}08` : "#f8fafc", opacity: active ? 1 : 0.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: PILAR_COLORS[p], color: "white", fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "2px 10px" }}>
                    Pilar {p}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{PILAR_NOMBRES[p]}</span>
                  {!active && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>No vinculado</span>}
                </div>
                {active && (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
                    {odsForPilar.length > 0 && (
                      <div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>ODS </span>
                        {odsForPilar.map((n) => (
                          <span key={n} style={{ background: ODS_INFO[n]?.color || "#94a3b8", color: "white", fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 5px", marginLeft: 3 }}>{n}</span>
                        ))}
                      </div>
                    )}
                    {areasForPilar.length > 0 && (
                      <div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em" }}>ÁREAS CLAVE </span>
                        {areasForPilar.map((a, i) => (
                          <span key={i} style={{ fontSize: 10, color: PILAR_COLORS[p], marginLeft: 4 }}>{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!odsNums.size && !ejes.length && (
        <div style={{ marginTop: 16, padding: 24, background: "#f8fafc", borderRadius: 10, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
          No hay datos de ODS ni ejes estratégicos cargados para esta entidad.
        </div>
      )}
    </div>
  );
}
