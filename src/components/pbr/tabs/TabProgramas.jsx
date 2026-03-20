import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmtM = (v) =>
  !v ? "B/. 0" : v >= 1e6 ? `B/. ${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `B/. ${(v / 1e3).toFixed(0)}K` : `B/. ${Math.round(v)}`;

const TIPO_COLORS = { MISIONAL: "#0d9488", ADMINISTRATIVO: "#1565C0", TRANSFERENCIAS: "#E65100" };

export default function TabProgramas({ data }) {
  const { programas, subprogramas } = data;
  const [expandedProg, setExpandedProg] = useState(null);
  const [anioSel, setAnioSel] = useState(null);

  if (!programas.length)
    return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Sin programas registrados.</div>;

  const anos = [...new Set(programas.map((p) => p.anio))].sort((a, b) => b - a);
  const anio = anioSel || anos[0];
  const progsAnio = programas.filter((p) => p.anio === anio);
  const misionales = progsAnio.filter((p) => p.tipo_programa === "MISIONAL");
  const otros = progsAnio.filter((p) => p.tipo_programa !== "MISIONAL");

  const maxPres = Math.max(...progsAnio.map((p) => p.presupuesto || 0), 1);

  const SubsTable = ({ codigoProg }) => {
    const subs = subprogramas.filter((s) => s.codigo_programa === codigoProg);
    if (!subs.length) return <div style={{ padding: "8px 14px", color: "#94a3b8", fontSize: 12 }}>Sin subprogramas registrados.</div>;
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 700, color: "#475569" }}>Subprograma</th>
            <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700, color: "#475569" }}>Presupuesto</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "6px 12px", color: "#374151" }}>{s.nombre_subprograma}</td>
              <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#0d9488" }}>{fmtM(s.presupuesto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const ProgramCard = ({ prog }) => {
    const pct = (prog.presupuesto / maxPres) * 100;
    const color = TIPO_COLORS[prog.tipo_programa] || "#94a3b8";
    const isOpen = expandedProg === prog.codigo_programa;
    return (
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
        <button
          onClick={() => setExpandedProg(isOpen ? null : prog.codigo_programa)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: isOpen ? "#f0fdf4" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ background: color, color: "white", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
            {prog.tipo_programa}
          </span>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, flexShrink: 0, minWidth: 48 }}>
            {prog.codigo_programa}
          </span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
            {prog.nombre_programa}
          </span>
          {/* Bar */}
          <div style={{ width: 120, flexShrink: 0 }}>
            <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 72, textAlign: "right", flexShrink: 0 }}>
            {fmtM(prog.presupuesto)}
          </span>
          <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 4 }}>{isOpen ? "▲" : "▼"}</span>
        </button>
        {isOpen && (
          <div style={{ borderTop: "1px solid #e2e8f0" }}>
            {/* Indicador */}
            {(prog.indicador_nombre || prog.indicador_metrica) && (
              <div style={{ background: "#f8fafc", padding: "10px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 24, flexWrap: "wrap" }}>
                {prog.indicador_nombre && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", marginBottom: 2 }}>INDICADOR</div>
                    <div style={{ fontSize: 12, color: "#374151" }}>{prog.indicador_nombre}</div>
                  </div>
                )}
                {prog.indicador_metrica && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", marginBottom: 2 }}>MÉTRICA</div>
                    <div style={{ fontSize: 12, color: "#374151" }}>{prog.indicador_metrica}</div>
                  </div>
                )}
                {prog.meta_anual != null && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", marginBottom: 2 }}>META ANUAL</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0d9488" }}>{prog.meta_anual} {prog.unidad_medida || ""}</div>
                  </div>
                )}
              </div>
            )}
            {/* Subprogramas */}
            <div style={{ background: "#f8fafc" }}>
              <SubsTable codigoProg={prog.codigo_programa} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Bar chart misionales
  const barData = misionales.map((p) => ({ name: p.nombre_programa.slice(0, 24), value: +(+(p.presupuesto || 0) / 1e6).toFixed(1), codigo: p.codigo_programa }));

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Selector de año */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>Programas {anio}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {anos.map((a) => (
            <button key={a} onClick={() => setAnioSel(a)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: a === anio ? "#1e3a5f" : "#f1f5f9", color: a === anio ? "white" : "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfica programas misionales */}
      {barData.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.08em", marginBottom: 12 }}>
            PRESUPUESTO PROGRAMAS MISIONALES (Millones B/.)
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, barData.length * 38)}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}M`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
              <Tooltip formatter={(v) => `B/. ${v}M`} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {barData.map((_, i) => <Cell key={i} fill="#0d9488" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Programas Misionales */}
      {misionales.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0d9488", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
            Programas Misionales
          </div>
          {misionales.map((p) => <ProgramCard key={p.codigo_programa} prog={p} />)}
        </div>
      )}

      {/* Otros programas */}
      {otros.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
            Programas de Apoyo
          </div>
          {otros.map((p) => <ProgramCard key={p.codigo_programa} prog={p} />)}
        </div>
      )}
    </div>
  );
}
