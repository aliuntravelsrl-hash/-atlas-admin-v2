# Manual de Operación y Mapeo de Versiones — Marketing Connections v1

Este manual describe el funcionamiento, control de versiones, auditoría y aseguramiento de gobernanza técnica para las conexiones del dominio de Marketing entre el panel de administración central (`-atlas-admin-v2`), la interfaz web de reservas (`atlas-booking-frontend-v2`) y la base de datos Supabase, en estricto cumplimiento de `AGENTS.md` y `MARKETING-OFFER-CREATION-CONTRACT-001.md`.

---

## 📌 Control de Versiones de Componentes

| Archivo / Componente | Repositorio | Versión Anterior | Versión Nueva | Descripción de la Modificación | Clasificación |
| :--- | :--- | :--- | :--- | :--- | :---: |
| [`marketingService.js`](file:///C:/Users/Admin/Downloads/-atlas-admin-v2/src/services/marketingService.js) | `-atlas-admin-v2` | v1.2.0 | v1.3.0 | 1. **REPAIR (A):** Reemplazo de columna inexistente `is_active` por `is_published` y `publish_status` en `getAllOffers`, `toggleOfferStatus` y `getMarketingStats`.<br>2. **COMPLETE (B):** Inyección de persistencia append-only en `marketing_decision_evidence` (`MKT-DEP-001`) al invocar `approveOffer()`. | A / B |
| [`MarketingOffersPanel.jsx`](file:///C:/Users/Admin/Downloads/-atlas-admin-v2/src/components/marketing/MarketingOffersPanel.jsx) | `-atlas-admin-v2` | v1.1.0 | v1.2.0 | **REPAIR (A):** Corrección del evento de toggle en `OfferRow` pasando `offer.is_published` en lugar de `offer.is_active` indefinido. Ajuste de títulos y etiquetas de estado. | A |
| [`CreateOfferForm.jsx`](file:///C:/Users/Admin/Downloads/-atlas-admin-v2/src/components/marketing/CreateOfferForm.jsx) | `-atlas-admin-v2` | v1.0.0 | v1.1.0 | **REPAIR (A):** Mapeo de `base_price` a `original_price`, remoción de columna inválida `is_active`, alineación con estado `approval_status: 'draft'`, e implementación real de guardado de borradores (`handleSaveDraft`). | A |
| [`aprobaciones/index.jsx`](file:///C:/Users/Admin/Downloads/atlas-booking-frontend-v2/src/pages/atlas-admin/aprobaciones/index.jsx) | `atlas-booking-frontend-v2` | v1.0.0 | v1.1.0 | **COMPLETE (B):** Actualización integral en `handleApprove` asignando `approval_status: 'approved'`, `approved_by: 'director'`, `publish_status: 'publicada'`, `is_published: true` e inserción en `marketing_decision_evidence`. | B |

---

## 🛡️ Lista de Verificación de Estabilidad Operativa (`AGENTS.md`)

### 1. Descuadres Financieros (DOP vs USD)
*   **Análisis:** Las modificaciones técnicas en `marketingService.js` y `CreateOfferForm.jsx` respetan el campo generado `final_price` en base de datos. La columna `original_price` se alimenta directamente del valor base numérico sin alterar la tasa de cambio ni colapsar monedas.
*   **Garantía:** No se ejecutan conversiones implícitas; la moneda declarada en `currency_original` se preserva intacta.

### 2. Bloqueos CORS y Cabeceras `Referer`
*   **Análisis:** Las peticiones a `marketing_offers` y `marketing_decision_evidence` se ejecutan a través de las librerías cliente nativas de Supabase (`@supabase/supabase-js` / PostgREST) empleando HTTPS autenticado con apikey anon / bearer token.
*   **Garantía:** Cero llamadas HTTP arbitrarias no controladas a dominios externos.

### 3. Inconsistencias de Despliegue y Control de Dependencias
*   **Análisis:** Ambas suites (`-atlas-admin-v2` y `atlas-booking-frontend-v2`) compilaron limpiamente mediante `npm run build` (Vite) sin errores de sintaxis ni dependencias rotas.
*   **Garantía:** La tabla `marketing_decision_evidence` ya existe en Supabase y acepta inserciones estructuradas, garantizando interoperabilidad inmediata.

---

## ⚙️ Arquitectura de Conexiones Gobernadas

```text
       [Humano / Agente]
               │
               ▼
      [CreateOfferForm] ──── (Save Draft) ────► marketing_offers
               │                                (approval_status: 'draft',
               ▼                                 is_published: false)
     (Solicitar Aprobación)
               │
               ▼
       marketing_offers (approval_status: 'draft', is_published: true/false)
               │
               ▼
   [Cola de Aprobaciones / Panel]
               │
               ▼ (Director / Autoridad Aprueba)
               ├─────────────────────────────────────────┐
               ▼                                         ▼
        marketing_offers                     marketing_decision_evidence
   (approval_status: 'approved',              (decision: 'approved',
    approved_by: 'director',                   decided_by: 'director',
    publish_status: 'publicada',               authority_level: 'director',
    is_published: true)                        evidence: { action, source, approved_at })
```

---

## 🛑 Estado de Brechas No Modificadas (Preservación de Autoridad)

1.  **`offer_interactions` (0 filas):** Infraestructura física existente en Supabase (7 columnas verificadas). Señal del frontend ausente. Se clasifica como `BLOCKED_BY_AUTHORITY` / `GAP: SIGNAL PRODUCER ABSENT` hasta que exista un contrato autorizado que defina los eventos específicos de interacción a capturar.
2.  **`offer_metrics` (0 filas):** Infraestructura física existente en Supabase (7 columnas verificadas). Productor analítico ausente. Se clasifica como `BLOCKED_BY_AUTHORITY` / `GAP: METRIC PRODUCER ABSENT`.
3.  **KPS / Validation Score:** Las columnas `validation_score` y `validation_breakdown` permanecen nulas en base de datos. Ningún gate de certificación ha sido inventado. Se reporta como `NOT IMPLEMENTED`.
