import { useState, useEffect } from "react";
import { sbQuery } from "../lib/supabase";

export function useEntidadesPbR() {
  const [entidades, setEntidades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sbQuery(
      "pbr_entidades",
      "select=codigo_entidad,nombre_entidad,siglas,anio_incorporacion,pct_presupuesto_resultados,pilares_peg_2025&eq.tiene_pbr=true&order=codigo_entidad"
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
      sbQuery("pbr_entidades",         `select=*&eq.codigo_entidad=${enc}&limit=1`),
      sbQuery("pbr_programas",         `select=*&eq.codigo_entidad=${enc}&order=anio.desc&order=codigo_programa.asc`),
      sbQuery("pbr_plurianual",        `select=*&eq.codigo_entidad=${enc}&order=codigo_programa.asc&order=anio.asc`),
      sbQuery("pbr_subprogramas",      `select=*&eq.codigo_entidad=${enc}&order=codigo_programa.asc`),
      sbQuery("pbr_ods",               `select=*&eq.codigo_entidad=${enc}&order=anio.desc&order=ods_numero.asc`),
      sbQuery("pbr_ejes_estrategicos", `select=*&eq.codigo_entidad=${enc}&order=numero_eje.asc`),
      sbQuery("pbr_equivalencia",      `select=*&eq.codigo_entidad=${enc}&order=anio.desc`),
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
