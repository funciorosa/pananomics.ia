// Vercel serverless function — estructura contenido libre en un slide usando Claude
// Recibe: { contenido, entidad }
// Retorna: { titulo, secciones: [{titulo, contenido}] }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { contenido, entidad } = req.body || {};
  if (!contenido || !contenido.trim()) {
    return res.status(400).json({ error: "contenido requerido" });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_KEY no configurada" });
  }

  const prompt = `Eres un analista presupuestario del MEF de Panamá. Organiza el siguiente contenido en un slide ejecutivo en español formal.

ENTIDAD: ${entidad || "Entidad gubernamental"}

CONTENIDO DEL ANALISTA:
${contenido.trim()}

Devuelve ÚNICAMENTE un JSON válido, sin markdown, con esta estructura exacta:
{
  "titulo": "Título ejecutivo conciso del slide (máx 60 caracteres)",
  "secciones": [
    {
      "titulo": "Subtítulo de la sección (máx 40 caracteres)",
      "contenido": "Texto organizado en párrafo o con viñetas usando guión. Máx 350 caracteres."
    }
  ]
}

Incluye entre 1 y 2 secciones. El contenido debe ser formal, objetivo y coherente con el estilo de un informe de ejecución presupuestaria.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return res.status(500).json({ error: `Claude error ${response.status}: ${errText.slice(0, 200)}` });
  }

  const data = await response.json();
  const raw  = data.content?.[0]?.text || "";

  try {
    return res.status(200).json(JSON.parse(raw));
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return res.status(200).json(JSON.parse(match[0])); } catch (__) {}
    }
    return res.status(500).json({ error: "No se pudo parsear la respuesta de Claude" });
  }
};
