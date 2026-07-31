# Manual de Operación y Mapeo de Versiones
## Taxonomía de Bloqueo de Tareas en Mission Control | Ecosistema ATLAS

Este manual documenta la implementación de la taxonomía de bloqueo de tareas del Swarm para sanear el backlog y el "Execution Health" en Mission Control, eliminando el ruido de tareas estancadas y clasificando con precisión los cuellos de botella del sistema.

---

## 📌 1. Control de Cambios y Versiones
*   **Proyecto:** `-atlas-admin-v2` (Panel Administrativo Interno)
*   **Componentes Afectados:**
    *   `src/utils/ovrInterpreter.js`: [NUEVO] Mapea descripciones en Markdown/YAML o payloads estructurados JSONB a la especificación OVR Schema v1.
    *   `src/components/marketing/MissionControlLive.jsx`: Integración del renderizado de contratos OVR rediseñado como una Evidence Card con las 8 dimensiones canónicas (Identity, Capability, Dispatcher, Knowledge, Dependencies, Evidence, Decision, Lifecycle).
    *   `src/components/marketing/AtlasExecutionPulse.jsx`: Ajuste de contador dinámico de tareas activas (`en_progreso` sin estancamiento).
    *   `src/components/marketing/WarRoomV50.jsx`: Mapeo y renderizado de agentes online/busy y visualización de su tarea actual.
    *   `src/components/marketing/mission-control/SwarmMonitor.jsx`: Corrección en el mapeo de estados de agentes basados en el heartbeat de Supabase.
*   **Versión Anterior:** `0.3.0`
*   **Versión Nueva:** `0.4.0` (Hito OVR Evidence Card)
*   **Fecha de Implementación:** 31 de Julio de 2026
*   **Desarrollador / Agente:** Antigravity (Advanced Agentic Coding Team)

---

## ⚙️ 2. Taxonomía de Bloqueo
Para evitar que el estado `en_progreso` represente múltiples escenarios inactivos (espera de especificaciones, credenciales caídas, decisiones humanas, etc.), se ha introducido la siguiente taxonomía de bloqueo:

| Categoría (`blocking_type`) | Significado Operativo | Acción Requerida |
|:---|:---|:---|
| **`SPEC`** | Esperando Especificación Técnica / Requerimiento Formal | Creación y aprobación de un documento SPEC por el Director |
| **`ADR`** | Esperando Decisión de Arquitectura / Enmienda de Diseño | Definición del estándar en el log de decisiones de diseño |
| **`DIRECTOR`** | Esperando Decisión / Aprobación del Director Humano (Aldo) | Intervención o firma manual en el plano administrativo |
| **`INFRA`** | Bloqueo por Infraestructura (Docker, VPS, red, puertos, etc.) | Ventana de mantenimiento o intervención de hermes-ops |
| **`EXTERNAL_API`** | Bloqueo de proveedor externo de APIs (GoGlobal, etc.) | Resolución del SLA del proveedor de inventario |
| **`CREDENTIALS`** | Credenciales expiradas / Flujo OAuth roto (Google Sheets, etc.) | Re-autenticación o rotación de claves del canal afectado |
| **`DEPENDENCY`** | Bloqueo lógico por otra tarea predecesora en el backlog | Completar la tarea precedente asignada |
| **`DATA`** | Falta de datos en la base de datos Supabase para ejecutar | Ingesta de datos de prueba o producción |

---

## 🛠️ 3. Mecánica de Implementación: *Bypassed Parsing Pattern*
Debido a que PostgREST/Supabase no expone RPCs con permisos DDL en el esquema público de producción y no se cuenta con acceso directo al puerto de PostgreSQL, no se realizó una alteración física al esquema de la tabla `atlas_tasks` (`ALTER TABLE`). 

En su lugar, se implementó el **Bypassed Parsing Pattern** (Patrón de Extracción de Prefijos en el Read Model):

1.  **En la Base de Datos:** Las tareas bloqueadas almacenan su taxonomía como un prefijo estructurado en la columna de texto existente `bloqueo_razon` en formato:
    ```
    [CATEGORIA] Descripción textual del bloqueo
    ```
    *Ejemplo:* `[INFRA] INFRASTRUCTURE` para puertos de Docker, o `[SPEC] MISSING_SPEC` para Azul/Stripe.
2.  **En el Frontend (`AtlasExecutionPulse.jsx`):** El componente lee el campo `bloqueo_razon` de las tareas devueltas y extrae dinámicamente el tipo de bloqueo usando expresiones regulares:
    ```javascript
    const match = reason.match(/^\[([A-Z_]+)\]/);
    if (match) return match[1];
    ```
    Si no encuentra el prefijo estructurado, aplica un mapeo secundario (fallback) basado en subcadenas textuales comunes para garantizar compatibilidad con registros históricos.

---

## 📈 4. Visualización en Mission Control y Mesa de Tareas
*   **Execution Pulse (Execution Health):** Agrupa y cuenta los bloqueos activos por su taxonomía (`SPEC`, `ADR`, `DIRECTOR`, `INFRA`, etc.), mostrando chips de colores de diagnóstico rápido.
*   **Doble Filtro en Mesa de Tareas:** Se incorporó una segunda fila de filtros que permite aislar tareas por estado operativo:
    *   `🟢 Activas`: Tareas en estado `en_progreso` actualizadas hace menos de 24 horas.
    *   `🟡 Estancadas`: Tareas en estado `en_progreso` sin cambios en las últimas 24 horas.
    *   `🔴 Bloqueadas`, `🔲 Pendientes`, `✓ Hechas` y `Cualquier Estado`.
*   **Badges de Ejecutor e Hitos:** Cada tarjeta de tarea renderiza su código, estado operativo exacto y un badge destacado con el `ejecutor` asignado si el registro lo posee.
*   **Monitor de Agentes IA:** El listado lateral de agentes y el panel del War Room ahora leen dinámicamente la propiedad `tareaActual` (extraída de las tareas activas asignadas en Supabase) y la renderizan debajo del rol del agente con un indicador relámpago `⚡`.

---

## 📜 5. Intérprete y Renderizado de Contratos OVR v1
Se implementó la **Fase I (Compatibilidad)** de la transición del COS al Swarm Control Center:

1.  **Intérprete de Contratos (`src/utils/ovrInterpreter.js`):**
    *   Mapea descripciones en Markdown/YAML o payloads JSONB al esquema canónico **OVR Schema v1**.
    *   Extrae automáticamente secciones constitucionales (`1_problema_detectado`, `2_datos_reales_caso_prueba`, `3_incorrecto_vs_correcto`, `4_causa_probable`, `5_archivos_a_revisar` y `6_flujo_promocion`).
    *   Mapea badges de capacidades (`CAP-XXX`) buscando concordancias en códigos, títulos y textos de forma tolerante a fallas.
2.  **Visualización Premium (Mission Control):**
    *   Botón interactivo de despliegue (`⚡ Ver Contrato OVR`).
    *   **Problemas y Causas:** Fondos estilizados de diagnóstico (`rose/violet` transparentes con bordes definidos).
    *   **Caso de Prueba:** Editor embebido simulado de lectura con scroll vertical y fuente monoespaciada de alta legibilidad.
    *   **Incorrecto vs Correcto (git-diff):** Vista paralela en dos columnas (rojo/verde) emulando pull requests modernos.
    *   **Línea de Tiempo del Ciclo de Vida:** Stepper secuencial de 7 estados (`created` ➔ `validated` ➔ `dispatched` ➔ `started` ➔ `completed` ➔ `verified` ➔ `certified`) coloreado dinámicamente según el estado actual de la tarea en Supabase.

---

## 🔍 6. Auditoría del Script de Saneamiento
Las tareas estancadas y de prueba anteriores se reclasificaron de forma segura en la base de datos Supabase, y el módulo de transpilación Vite construyó de forma limpia la versión `0.3.0` del panel administrativo para su despliegue y validación por la dirección en [http://localhost:5173/mission](http://localhost:5173/mission).
