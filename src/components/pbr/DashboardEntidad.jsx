import { useState } from "react";
import { useEntidadesPbR, useEntidadPbR } from "../../hooks/usePbR";
import TabPerfil from "./tabs/TabPerfil";
import TabProgramas from "./tabs/TabProgramas";
import TabODSPEG from "./tabs/TabODSPEG";
import TabPlurianual from "./tabs/TabPlurianual";
import TabEquivalencia from "./tabs/TabEquivalencia";

const TABS = [
  { id: "perfil",       label: "Perfil PbR",    icon: "🏛" },
  { id: "programas",    label: "Programas",      icon: "📋" },
  { id: "ods",          label: "ODS & PEG",      icon: "🌍" },
  { id: "plurianual",   label: "Plurianual",     icon: "📅" },
  { id: "equivalencia", label: "Equivalencia",   icon: "⇄" },
];

const PILAR_COLORS = { A: "#1565C0", B: "#2E7D32", C: "#E65100", D: "#0d9488" };

function KpiChip({ label, value, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 14px", borderTop: `3px solid ${color}`, minWidth: 90, flex: "1 1 90px" }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.09em", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "white", lineHeight: 1 }}>{value ?? "—"}</div>
    </div>
  );
}

export default function DashboardEntidad() {
  const { entidades, loading: loadingList } = useEntidadesPbR();
  const [selectedCodigo, setSelectedCodigo] = useState("");
  const [tab, setTab] = useState("perfil");

  const { data, loading: loadingData } = useEntidadPbR(selectedCodigo);
  const ent = data?.entidad;

  const pilares = Array.isArray(ent?.pilares_peg_2025) ? ent.pilares_peg_2025 : [];

  const kpis = [
    { label: "Año PbR",          value: ent?.anio_incorporacion,              color: "#0d9488" },
    { label: "Presup. Result.",   value: ent?.pct_presupuesto_resultados != null ? `${ent.pct_presupuesto_resultados}%` : "—", color: "#2E7D32" },
    { label: "Presup. Admin.",    value: ent?.pct_presupuesto_admin != null ? `${ent.pct_presupuesto_admin}%` : "—", color: "#E65100" },
    { label: "Prog. Misionales",  value: ent?.num_programas_misionales,        color: "#1565C0" },
    { label: "ODS Vinculados",    value: ent?.num_ods_vinculados,              color: "#26BDE2" },
    { label: "Indicadores",       value: ent?.num_indicadores_producto,        color: "#A21942" },
    { label: "Pilares PEG",       value: pilares.join(", ") || "—",           color: "#FCC30B" },
  ];

  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "#F6F7FB", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      {/* ── Header oscuro ── */}
      <div style={{ background: "#1e3a5f", padding: "18px 24px 0" }}>
        {/* Selector + título */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            {/* Selector de entidad */}
            <div style={{ marginBottom: 10 }}>
              {loadingList ? (
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Cargando entidades…</div>
              ) : !entidades.length ? (
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  No hay entidades con datos PbR. Ejecuta el script Python para cargar los datos Excel.
                </div>
              ) : (
                <select
                  value={selectedCodigo}
                  onChange={(e) => { setSelectedCodigo(e.target.value); setTab("perfil"); }}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", minWidth: 280 }}
                >
                  <option value="" style={{ background: "#1e3a5f" }}>— Seleccionar entidad PbR —</option>
                  {entidades.map((e) => (
                    <option key={e.codigo_entidad} value={e.codigo_entidad} style={{ background: "#1e3a5f" }}>
                      {e.codigo_entidad} · {e.siglas || e.nombre_entidad}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Nombre entidad */}
            {ent ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: "#0d9488", color: "white", fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 10px", letterSpacing: "0.06em", flexShrink: 0 }}>
                  {ent.codigo_entidad}
                </span>
                {ent.anio_incorporacion && (
                  <span style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "2px 8px", flexShrink: 0 }}>
                    PbR {ent.anio_incorporacion}
                  </span>
                )}
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "white", lineHeight: 1.2 }}>
                    {ent.nombre_entidad}
                  </div>
                  {ent.siglas && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{ent.siglas}</div>
                  )}
                </div>
              </div>
            ) : selectedCodigo && !loadingData ? (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Sin datos para esta entidad.</div>
            ) : !selectedCodigo ? (
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Selecciona una entidad para ver su perfil PbR.</div>
            ) : null}
          </div>

          {/* Pilares badge */}
          {pilares.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0, alignSelf: "flex-end", paddingBottom: 4 }}>
              {pilares.map((p) => (
                <span key={p} style={{ background: PILAR_COLORS[p] || "#64748b", color: "white", fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "3px 9px" }}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* KPI Strip */}
        {ent && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {kpis.map((k) => <KpiChip key={k.label} {...k} />)}
          </div>
        )}

        {/* Tabs */}
        {ent && (
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "9px 18px",
                  border: "none",
                  borderRadius: "8px 8px 0 0",
                  background: tab === t.id ? "#F6F7FB" : "transparent",
                  color: tab === t.id ? "#1e3a5f" : "rgba(255,255,255,0.6)",
                  fontSize: 12,
                  fontWeight: tab === t.id ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = "white"; }}
                onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
              >
                <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {loadingData ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, gap: 12, color: "#94a3b8" }}>
          <span style={{ fontSize: 24, animation: "spin 1s linear infinite" }}>⏳</span>
          <span style={{ fontSize: 14 }}>Cargando datos PbR…</span>
        </div>
      ) : ent && data ? (
        <div>
          {tab === "perfil"       && <TabPerfil       data={data} />}
          {tab === "programas"    && <TabProgramas    data={data} />}
          {tab === "ods"          && <TabODSPEG       data={data} />}
          {tab === "plurianual"   && <TabPlurianual   data={data} />}
          {tab === "equivalencia" && <TabEquivalencia data={data} />}
        </div>
      ) : !selectedCodigo ? (
        <div style={{ padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📐</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>Módulo PbR</div>
          <div style={{ fontSize: 13, color: "#64748b", maxWidth: 400, margin: "0 auto" }}>
            Presupuesto basado en Resultados. Selecciona una entidad del menú para ver su perfil, programas, vínculos ODS/PEG y proyección plurianual.
          </div>
        </div>
      ) : null}
    </div>
  );
}
