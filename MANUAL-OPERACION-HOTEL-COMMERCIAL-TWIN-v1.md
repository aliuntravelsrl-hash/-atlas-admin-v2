# MANUAL DE OPERACIONES Y MAPEO DE VERSIONES (ECOSISTEMA ATLAS)
## COMPONENTE: HOTEL COMMERCIAL TWIN (ATLAS INTEGRITY B2B)
**Módulo:** `HotelCommercialProfileTab.jsx` & `IntegrityMonitor.jsx`  
**Ruta en Producción:** `https://atlas.aliuntravelsrl.com/integrity`  
**Repositorio:** `-atlas-admin-v2`   
**Fecha de Publicación:** 03 de Septiembre de 2026 · 11:35 (Local Time)   
**Autoridad Soberana:** Director General Aldo Hilario   
**Curator / Notario:** Antigravity (Computer / Curator Constitucional)   
**Cumplimiento Obligatorio:** `RULE[AGENTS.md]` (Manuales de Operación y Mapeo de Versiones).

---

1. **PRORÓSITO DEL COMPONENTE**
Transformar la pantalla de auditoría técnica (`IntegrityMonitor`) en un **Expediente Comercial B2B060¹ por Propiedad**, permitiendo auditar tanto los sellos técnicos del Molde de Hierro como la salud de la relación estratégica con la cadena hotelera (Revenue, Inversión Publicitaria Meta/Google, ROAS, Ratio de Cross-Selling y Conciliación Financiera).

---

2. **MAPEO DE PESTAÑMS Y FLUJO DE DATOS**
1. **Pestaña Técnica (`activeTab = 'technical'`):**
   * Preserva el 100% de los 7 sellos del Molde de Hierro (Galería, Servicios, Habitaciones, Tarifas, Temporadas, etc.).
   * Calcula el `Health Score` (0 a 7) y determina el badge de *Apto para Publicación*.
2. **Pestaña Comercial (`activeTab = 'commercial'`):**
   * **Tarjetas KPI B2B:** Revenue Bruto USD/DOP, Bookings Confirmados, Inversión en Pauta, ROAS (Retorno) y Costo por Lead (CPL).
   * **Indice de Cross-Selling:** Porcentaje de huéspedes que añadieron excursiones complementarias.
   * **Pipeline Hermes IA:** Total de leads atendidos y tiempo promedio de cierre.
   * **Atribución y Trazabilidad:** Validación de eventos Meta Pixel (`AddToCart`, `Lead`), GTM dataLayer y Proformas DOC-1.

---

3. **MITIGACIÓN DE RIESGOS PREVENDIVA (`AGENTS.md`)**
* **Descuadres Financieros (DOP vs USD):** Todas las métricas de ingresos, pauta y comisiones se totalizan bajo la tasa de cambio oficial del Banco Central.
* **Bloqueos CORS & Cabeceras:** El consumo de datos de hoteles se realiza a través del cliente autenticado de Supabase y webhooks de n8n sin riesgos de cabeceras restrictivas.
* **No Regresión:** El selector de pestañas no modifica ni altera el estado de las consultas a las tablas `hotels_master`, `rooms`, `rates` ni `seasons`.

*Manual Notariado y Sellado en -atlas-admin-v2 y atlas-curator-office.*
