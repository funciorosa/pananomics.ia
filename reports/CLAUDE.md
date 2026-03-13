# Pananomics.ia — Módulo de Generación de Informes Presupuestarios
## Briefing para Claude Code

Este documento resume toda la arquitectura, decisiones de diseño y estado del proyecto para que puedas continuar el desarrollo sin contexto previo.

---

## Descripción del Proyecto

**Pananomics.ia** es una aplicación web para la Dirección de Presupuesto de la Nación (DIPRENA/MEF, Panamá). El módulo principal genera informes de ejecución presupuestaria en formato PPTX automáticamente a partir de datos del sistema DIPRENA.

**Usuario principal:** Mariam (rol Administrador), analista presupuestaria.

---

## Archivos del Proyecto

```
/
├── gen_informe.js          ← Generador PPTX (Node.js + pptxgenjs)
├── objetivos_catalog.json  ← Catálogo de 92 entidades con objetivos generales
├── CLAUDE.md               ← Este archivo
└── [Excel de DIPRENA]      ← Input del analista (ver sección "Datos de entrada")
```

---

## Stack Técnico

- **Generador PPTX:** Node.js con `pptxgenjs`
- **Catálogo de entidades:** JSON generado desde Excel DIPRENA (92 entidades)
- **IA para narrativas:** Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Conversión a PDF:** LibreOffice headless (`soffice --convert-to pdf`)
- **Frontend (por construir):** React o HTML/JS — ver sección "UI"

Instalar dependencias:
```bash
npm install pptxgenjs
```

---

## Estructura del Informe (4 Slides por Entidad)

### Slide 1 — Portada / Resumen Ejecutivo
- Header navy con código+siglas+nombre de la entidad
- Banda de Objetivo General (jalado del `objetivos_catalog.json` por código)
- Panel izquierdo: KPI Total Ejecutado (B/. miles), KPI Funcionamiento, KPI Inversión con semáforo
- Panel derecho: tabla resumen Ley / Modificado / Ejecutado / % / Distribución con semáforo
- Leyenda del semáforo visible

### Slide 2 — Funcionamiento
- Panel izquierdo arriba: Donut distribución grupos de gasto + leyenda con mini-barras proporcionales
- Panel izquierdo abajo: Tabla detalle 5 grupos (Ley / Mod. / Ejec. / % con semáforo)
- Panel derecho arriba: Barras horizontales por programa (Devengado vs Modificado)
- Panel derecho abajo: Narrativa generada por IA

### Slide 3 — Inversión *(CONDICIONAL)*
- **Solo se genera si Presupuesto Modificado Inversión > 0**
- Si Inversión = 0 → el informe tiene 3 slides, subtítulo "Funcionamiento"
- Si Inversión > 0 → 4 slides, subtítulo "Funcionamiento e Inversión"
- Panel izquierdo: Barras horizontales por programa de inversión
- Panel izquierdo abajo: Barras por subprograma
- Panel derecho: Narrativa de inversión generada por IA

### Slide 4 — Conclusiones
- Banda de 4 KPIs prominente: Total (navy), Funcionamiento (ICE), Inversión (ICE), Partida Crítica (amarillo)
- 3 columnas: Aspectos Relevantes / Recomendaciones (círculos verdes numerados) / Conclusiones (fondo ICE)

### Slide Adicional (opcional)
- El analista puede añadir slides extra con contenido libre
- La IA organiza el texto en secciones formales (bullets + narrativa)
- Misma estructura de header/footer que los slides principales

---

## Paleta de Colores (TODOS los slides)

```javascript
const NAV  = "1B2F4E";   // navy principal — headers, títulos de panel, barras
const NAV2 = "142240";   // navy oscuro — panel derecho del header
const ICE  = "EEF4FF";   // fondo de paneles suave
const BDR  = "C8D8EE";   // borde de paneles
const GRY  = "EEF2F8";   // footer background
const TXT  = "2C3E50";   // texto cuerpo

// Donut — gama azul de oscuro a claro
// "#1B2F4E", "#2E5F96", "#5B93C7", "#A8C8E8"
```

### Semáforo (aplicar en TODAS las celdas de %)
```javascript
function semColor(pct) {
  if (pct >= 80) return { bg: "C8F0D8", fg: "0F5E2F" };  // verde
  if (pct >= 60) return { bg: "FFE8B0", fg: "7A4800" };  // amarillo
  return         { bg: "FFD0D0", fg: "7A1010" };          // rojo
}
```

---

## Sistema de Header y Footer

### Header (todos los slides)
```
[navy #1B2F4E ──────────────────────────] [navy oscuro #142240]
  CÓDIGO · SIGLAS                           "Ejecución Presupuestaria"
  NOMBRE COMPLETO EN MAYÚSCULAS             "Cierre 2025"  (grande)
[separador vertical 1pt rgba blanco 15%]
```

### Footer (todos los slides)
```
[línea acento navy 3px arriba]
[fondo GRY #EEF2F8]
● Período: Enero – Diciembre 2025   ● Fuente: Dirección de Presupuesto de la Nación   ● SIGLAS/Nombre
```

### Paneles de contenido
- Borde: 0.5pt `BDR`
- Título de panel: cuadrado navy 10×10 + texto UPPERCASE 7pt bold, letter-spacing 0.5
- Fondo: `ICE` o blanco

---

## Catálogo de Entidades (`objetivos_catalog.json`)

```json
{
  "014": {
    "siglas": "MIVIOT",
    "nombre": "Ministerio de Vivienda y Ordenamiento Territorial",
    "objetivo": "Garantizar el desarrollo y ejecución...",
    "sector": "Gobierno Central"
  }
}
```

**Sectores disponibles:**
- Gobierno Central (28 entidades, códigos 001–099)
- Inst. Descentralizadas (42 entidades, códigos 100–199)
- Empresas Públicas (17 entidades, códigos 200–299)
- Intermediarios Financieros (8 entidades, códigos 300+)

**Uso en el generador:**
```javascript
const catalog = JSON.parse(fs.readFileSync("objetivos_catalog.json", "utf-8"));
function getEntidad(codigo) {
  return catalog[String(codigo).padStart(3, "0")] || null;
}

// En main():
const CODIGO = "014";
const ent = { codigo: CODIGO, ...getEntidad(CODIGO) };
// ent.siglas, ent.nombre, ent.objetivo, ent.sector
```

---

## Datos de Entrada — Excel de DIPRENA

El analista sube directamente el export del sistema DIPRENA.

**Hoja:** `"Resultado consulta"` (~167 filas × 9 columnas)

| Col | Contenido |
|-----|-----------|
| 0 | Descripción General (sección) |
| 1 | Tipo Presupuesto (A=Total, B=Funcionamiento, C=Inversión, grupos, objetos) |
| 2 | Partida (PROGRAMA, Sub. Programa, Proyecto) |
| 3 | Detalle (nombre) |
| 4 | Presupuesto Ley |
| 5 | Presupuesto Modificado |
| 6 | Devengado |
| 7 | % Ejecución Anual |
| 8 | Distribución |

**Parser pendiente de implementar** — actualmente `gen_informe.js` usa datos hardcodeados de MIVIOT. La siguiente tarea es leer este Excel y extraer los valores reales.

---

## Lo que Genera la IA vs. lo que Ingresa el Analista

| IA genera automáticamente | Analista provee |
|--------------------------|-----------------|
| Objetivo general (del catálogo) | Excel de DIPRENA |
| Narrativa Slide 2 (funcionamiento) | Código de entidad |
| Narrativa Slide 3 (inversión) | Contexto adicional opcional |
| Aspectos relevantes (Slide 4) | |
| Recomendaciones (Slide 4) | |
| Párrafo conclusivo (Slide 4) | |
| Organización de slides extras | |

---

## UI del Generador (por integrar al app)

La interfaz tiene estas secciones, de arriba hacia abajo:

1. **Topbar** — navy con logo Pananomics.ia + nombre de entidad activa
2. **Strip de slides** — miniaturas clicables de cada slide con preview visual
3. **Viewer** — preview del slide activo (columna principal) + panel info (columna derecha)
4. **Panel "+" (opcional)** — aparece al tocar el botón de añadir slide:
   - Textarea donde el analista escribe contenido libre
   - Botón "Generar con IA" → llama a Claude API → muestra preview estructurado
   - Botón "Añadir al informe" → inserta el slide nuevo en el deck
5. **Panel de descarga (opcional)** — aparece al tocar "Guardar y Terminar":
   - Botón PPTX → llama al endpoint que ejecuta `gen_informe.js`
   - Botón PDF → convierte PPTX con LibreOffice headless
6. **Bottom bar** — siempre visible: botón "+" (izq) + contador de slides (centro) + "Guardar y Terminar" (der)

---

## Pendientes (en orden de prioridad)

### 1. Parser del Excel de DIPRENA ← PRÓXIMO PASO
Leer el archivo Excel del analista y extraer:
- Total / Funcionamiento / Inversión: Ley, Modificado, Devengado, %
- Grupos de gasto de funcionamiento con sus montos
- Programas de funcionamiento con sus montos
- Programas de inversión con sus montos
- Subprogramas de inversión con sus montos
- Partida crítica (grupo con % más bajo)

Reemplazar los datos hardcodeados en `gen_informe.js`.

### 2. Generación de narrativas con Claude API
Actualmente las narrativas están hardcodeadas. Hacer llamada real a Claude para:
- `generateNarrativaFuncionamiento(data)` → texto Slide 2
- `generateNarrativaInversion(data)` → texto Slide 3
- `generateConclusiones(data)` → aspectos, recomendaciones, párrafo Slide 4

### 3. Integración UI → Backend
- Endpoint POST `/generate` que recibe código de entidad + archivo Excel → devuelve PPTX
- Endpoint POST `/generate-pdf` que convierte el PPTX a PDF
- Upload del Excel desde la interfaz web

### 4. Modal de contexto adicional (ya diseñado)
Antes de generar, mostrar modal con opciones:
- Párrafo libre con etiquetas opcionales
- Adjuntar documento de referencia
- Sin contexto adicional

### 5. Entidades con estructura grande (MINSA, CSS, etc.)
- Detectar cuando hay muchos programas (>8) y ajustar el layout de barras
- Opción de truncar con "Ver más" o dividir en sub-slides

---

## Comandos Útiles

```bash
# Generar PPTX para una entidad
node gen_informe.js

# Cambiar entidad (editar en main() de gen_informe.js)
const CODIGO = "014";  # MIVIOT
const CODIGO = "007";  # MEDUCA
const CODIGO = "110";  # CSS

# Convertir a PDF
soffice --headless --convert-to pdf MIVIOT_Cierre2025.pptx

# Convertir PDF a imágenes para QA
pdftoppm -jpeg -r 150 MIVIOT_Cierre2025.pdf slide
```

---

## Archivos de PPTX de Referencia (estilo visual)

Los siguientes archivos fueron usados como referencia de diseño y están en el proyecto:
- `MIVIOT_incompleto_Cierre_2025.pptx`
- `MIAMBIENTE_incompleto_Cierre_2025.pptx`
- `TAT_incompleto_Cierre_2025.pptx`

El generador reproduce fielmente su estructura visual (navy dominante, paneles ICE, footer con línea acento).

---

## Notas de Implementación

- `pptxgenjs` usa pulgadas para coordenadas (slide 10" × 7.5")
- El header ocupa y: 0–0.65", el footer y: 7.25–7.5"
- El área de contenido es y: 0.65"–7.25" = 6.6" de alto
- Las barras horizontales se calculan como % del ancho máximo disponible
- El donut usa `stroke-dasharray` calculado sobre circunferencia = 2π×r
- La narrativa de IA debe caber en ~5 líneas a 7.5pt en un panel de 4.5"×1.2"
