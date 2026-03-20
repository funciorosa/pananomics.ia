import { useState, useEffect } from "react";
import { sbQuery } from "../lib/supabase";

export function useEntidadesPbR() {
  const [entidades, setEntidades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sbQuery(
      "pbr_entidades",
      "select=codigo_entidad,nombre_entidad,siglas,anio_incorporacion,pct_presupuesto_resultados,pilares_peg_2025&tiene_pbr=eq.true&order=codigo_entidad"
    )
      .then((data) => { setEntidades(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return { entidades, loading };
}

export function useEntidadPbR(codigoEntidad) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!codigoEntidad) return;
    setLoading(true);
    setData(null);
    const enc = encodeURIComponent(codigoEntidad);
    Promise.all([
      sbQuery("pbr_entidades",         `select=*&codigo_entidad=eq.${enc}&limit=1`),
      sbQuery("pbr_programas",         `select=*&codigo_entidad=eq.${enc}&order=anio.desc,codigo_programa.asc`),
      sbQuery("pbr_plurianual",        `select=*&codigo_entidad=eq.${enc}&order=codigo_programa.asc,anio.asc`),
      sbQuery("pbr_subprogramas",      `select=*&codigo_entidad=eq.${enc}&order=codigo_programa.asc`),
      sbQuery("pbr_ods",               `select=*&codigo_entidad=eq.${enc}&order=ods_numero.asc`),
      sbQuery("pbr_ejes_estrategicos", `select=*&codigo_entidad=eq.${enc}&order=numero_eje.asc`),
      sbQuery("pbr_equivalencia",      `select=*&codigo_entidad=eq.${enc}&order=anio.desc`),
    ])
      .then(([entArr, programas, plurianual, subprogramas, ods, ejes, equivalencia]) => {
        setData({
          entidad:     entArr[0] || null,
          programas:   programas  || [],
          plurianual:  plurianual || [],
          subprogramas: subprogramas || [],
          ods:         ods         || [],
          ejes:        ejes        || [],
          equivalencia: equivalencia || [],
        });
        setLoading(false);
      })
      .catch((e) => { setError(e); setLoading(false); });
  }, [codigoEntidad]);

  return { data, loading, error };
}
