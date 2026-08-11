# Manual de Operación y Mapeo de Versiones — OVR Evidence Card v2

Este manual describe el funcionamiento, control de versiones y auditoría del módulo de OVR Evidence Card v2 integrado en el panel de administración central (`-atlas-admin-v2`).

---

## 📌 Control de Versiones de Componentes

| Archivo / Componente | Versión Anterior | Versión Nueva | Descripción de la Modificación |
| :--- | :--- | :--- | :--- |
| [`ovrInterpreter.js`](file:///C:/Users/Admin/Downloads/-atlas-admin-v2/src/utils/ovrInterpreter.js) | v1.0.0 | v2.0.0 (OVR v2) | Se agregaron los mapeos nativos de JSONB para Resolver Chain, Fingerprint hashes, Decision Provenance y el algoritmo dinámico de cálculo de Confianza (`Evidence Confidence`). |
| [`MissionControlLive.jsx`](file:///C:/Users/Admin/Downloads/-atlas-admin-v2/src/components/marketing/MissionControlLive.jsx) | v1.6.1 | v2.0.0 (OVR v2) | Se modificaron las consultas de Supabase a `atlas_tasks` para seleccionar todas las columnas (`*`), y se rediseñó la UI expandida para renderizar los 4 bloques del OVR v2 (Resolver Chain, Confidence Bar, hashes de Fingerprint, Decision Provenance). |

---

## 🛡️ Lista de Verificación de Estabilidad Operativa

Para dar cumplimiento estricto a las directrices de la guía de auditoría `AGENTS.md`, se verifican proactivamente los siguientes riesgos comunes del ecosistema:

### 1. Descuadres Financieros (Conversión DOP vs USD)
*   **Análisis:** Este fix de OVR no altera los flujos de venta ni las tablas de cobros directos. Sin embargo, el renderizado de la evidencia y los datos del contrato preservan estrictamente las monedas nativas de las tareas y no introducen lógicas de conversión manuales.
*   **Garantía:** El formateo de monedas sigue confiando en la función canónica de utilidades `renderMoney(item)` de `MissionControlLive.jsx`.

### 2. Bloqueos CORS y Cabeceras `Referer`
*   **Análisis:** Las URL de evidencias (incluyendo archivos de storage Supabase o PDFs de vouchers) se abren en pestañas independientes (`_blank`) con directivas seguras `rel="noopener noreferrer"`.
*   **Garantía:** No se añaden peticiones AJAX directas hacia dominios externos con restricciones CORS desde este módulo.

### 3. Inconsistencias de Despliegue y Control de Dependencias
*   **Análisis:** Se modificaron componentes internos del frontend que dependen de la base de datos Supabase.
*   **Garantía:** La columna `resultado_estructurado` (JSONB) en la tabla `atlas_tasks` ya existe en el esquema físico de producción. El frontend ahora la lee de forma nativa sin romper la compatibilidad con tareas legadas (las cuales se interpretan vía fallback de compatibilidad a formato texto si el JSON es nulo).

---

## ⚙️ Directrices de Diagnóstico y Mantenimiento

Si la tarjeta de evidencia muestra un estado de compatibilidad legado o errores de renderizado:
1.  **Falta de campos JSONB:** Verifique que el payload almacenado en `resultado_estructurado` cumpla con el esquema OVR v2:
    ```json
    {
      "fingerprint": {
        "knowledgeHash": "...",
        "bundleHash": "...",
        "manifestVersion": "COS-v3.5",
        "ovrVersion": "OVR-v2.0",
        "kbpVersion": "KBP-v1.0"
      },
      "decision": {
        "source": "Swarm-Auto",
        "isEmergencyBypass": false
      },
      "capability": {
        "resolverChain": "CAP-023 ➔ SPEC-023 ➔ ..."
      }
    }
    ```
2.  **Fallback automático:** Si `resultado_estructurado` está vacío o no es un objeto válido, `ovrInterpreter.js` parseará la descripción en formato Markdown para extraer las secciones clásicas `1_problema_detectado`, `2_datos_reales`, etc., evitando caídas del dashboard.
