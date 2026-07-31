// AtlasExecutionPulse.jsx
// Ubicación: entre Tasa del Dólar y el grid principal en MissionControlLive
// Fuente: atlasTasks (estado ya cargado — sin consulta adicional)
// Spec aprobada: https://app.notion.com/p/360293f46b248176814ed3101723f759

const ESTADOS_ACTIVOS = ['pendiente', 'en_progreso', 'bloqueada', 'en_revision', 'requiere_correccion'];

const estadoLabel = {
  pendiente:            { label: 'Pendiente',      color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  en_progreso:          { label: 'En progreso',     color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  bloqueada:            { label: 'Bloqueada',       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  en_revision:          { label: 'En revisión',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  requiere_correccion:  { label: 'Req. corrección', color: '#F97316', bg: 'rgba(249,115,22,0.12)'  },
};

const prioridadOrder = { critica: 0, alta: 1, media: 2, baja: 3 };

export default function AtlasExecutionPulse({ atlasTasks = [] }) {
  const now = Date.now();
  const H24 = 24 * 60 * 60 * 1000;

  // ── 1. Conteo por estado activo ─────────────────────────────────────────
  const conteo = {};
  ESTADOS_ACTIVOS.forEach(e => { conteo[e] = 0; });
  atlasTasks.forEach(t => {
    if (ESTADOS_ACTIVOS.includes(t.estado)) conteo[t.estado]++;
  });
  const totalActivo = Object.values(conteo).reduce((a, b) => a + b, 0);

  // ── 2. Execution Health ─────────────────────────────────────────────────
  const activos     = atlasTasks.filter(t => t.estado === 'en_progreso' && (now - new Date(t.updated_at).getTime()) < H24);
  const estancados  = atlasTasks.filter(t => t.estado === 'en_progreso' && (now - new Date(t.updated_at).getTime()) >= H24);
  const bloqueados  = atlasTasks.filter(t => t.estado === 'bloqueada');

  // ── 2.1 Taxonomía de bloqueos (Bypassed Parsing Pattern) ─────────────────
  const getBlockingType = (t) => {
    if (t.estado !== 'bloqueada') return null;
    const reason = t.bloqueo_razon || '';
    const match = reason.match(/^\[([A-Z_]+)\]/);
    if (match) return match[1];

    if (reason.toUpperCase().includes('SPEC')) return 'SPEC';
    if (reason.toUpperCase().includes('ADR')) return 'ADR';
    if (reason.toUpperCase().includes('DIRECTOR')) return 'DIRECTOR';
    if (reason.toUpperCase().includes('INFRA')) return 'INFRA';
    if (reason.toUpperCase().includes('CREDENTIALS') || reason.toUpperCase().includes('OAUTH')) return 'CREDENTIALS';
    if (reason.toUpperCase().includes('DEPENDENCY') || reason.toUpperCase().includes('DEPENDE')) return 'DEPENDENCY';
    if (reason.toUpperCase().includes('DATA') || reason.toUpperCase().includes('DATOS')) return 'DATA';
    return 'OTHER';
  };

  const blockingTypesCount = {
    SPEC: 0,
    ADR: 0,
    DIRECTOR: 0,
    INFRA: 0,
    EXTERNAL_API: 0,
    CREDENTIALS: 0,
    DEPENDENCY: 0,
    DATA: 0,
    OTHER: 0
  };

  bloqueados.forEach(t => {
    const type = getBlockingType(t) || 'OTHER';
    if (blockingTypesCount[type] !== undefined) {
      blockingTypesCount[type]++;
    } else {
      blockingTypesCount.OTHER++;
    }
  });

  // ── 3. Distribución por ejecutor (Normalizado y Completo) ───────────────
  const getNormalizedExecutor = (t) => {
    let ejRaw = t.ejecutor || t.asignado_a || '—';
    let ej = ejRaw.toLowerCase().trim();
    if (ej === 'claude' || ej === 'computer') return 'atlas-tech';
    if (ej === 'ariadne' || ej === 'intel') return 'ariadne-data';
    return ejRaw;
  };

  const porEjecutor = {
    'atlas-tech': 0,
    'antigravity': 0,
    'director': 0,
    'hermes-ops': 0,
    'hermes-marketing': 0,
    'hermes-qa': 0,
    'ariadne-data': 0
  };

  atlasTasks.forEach(t => {
    let ej = getNormalizedExecutor(t).toLowerCase().trim();
    if (ej === '—') return;

    if (porEjecutor[ej] !== undefined) {
      porEjecutor[ej]++;
    } else {
      porEjecutor[ej] = (porEjecutor[ej] || 0) + 1;
    }
  });

  const ejecutorList = Object.entries(porEjecutor)
    .sort((a, b) => b[1] - a[1]);

  const maxEj = Math.max(...Object.values(porEjecutor), 1);

  // ── 4. Tareas con dependencias (depende_de[] no vacío) ──────────────────
  const conDependencias = atlasTasks.filter(t => Array.isArray(t.depende_de) && t.depende_de.length > 0);

  // ── 5. Cuellos de botella: tareas bloqueadas con dependientes ───────────
  const todosCodigos = new Set(atlasTasks.map(t => t.codigo));
  const cuellos = atlasTasks
    .filter(t => t.estado === 'bloqueada')
    .map(bloq => ({
      ...bloq,
      bloqueaA: atlasTasks.filter(t =>
        Array.isArray(t.depende_de) && t.depende_de.includes(bloq.codigo)
      ),
    }))
    .filter(b => b.bloqueaA.length > 0)
    .sort((a, b) => b.bloqueaA.length - a.bloqueaA.length);

  // ── 6. Top tareas críticas en progreso / estancadas ─────────────────────
  const topCriticas = atlasTasks
    .filter(t => t.prioridad === 'critica' && t.estado !== 'completado' && t.estado !== 'archivado')
    .sort((a, b) => (prioridadOrder[a.prioridad] ?? 9) - (prioridadOrder[b.prioridad] ?? 9))
    .slice(0, 3);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-white tracking-tight">⚡ Execution Pulse</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            BACKLOG ACTIVO · {totalActivo} tareas
          </span>
        </div>
        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Sin completados · Sin archivados</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Panel 1: Conteo por estado */}
        <div className="space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Estado del backlog</div>
          {ESTADOS_ACTIVOS.map(estado => {
            const cfg = estadoLabel[estado];
            const n   = conteo[estado];
            const pct = totalActivo > 0 ? (n / totalActivo) * 100 : 0;
            return (
              <div key={estado} className="flex items-center gap-2">
                <div className="w-[110px] text-[10px] font-bold truncate" style={{ color: cfg.color }}>{cfg.label}</div>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                </div>
                <div className="w-5 text-right text-[11px] font-black" style={{ color: cfg.color }}>{n}</div>
              </div>
            );
          })}
        </div>

        {/* Panel 2: Execution Health */}
        <div className="space-y-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Execution Health</div>
          <HealthRow icon="🟢" label="Activos" count={activos.length}    color="#10B981"
            subtitle={activos.length > 0 ? `Últ. mov <24h` : 'Ninguno en movimiento'} />
          <HealthRow icon="🟡" label="Estancados" count={estancados.length} color="#F59E0B"
            subtitle={estancados.length > 0 ? `Sin mov ≥24h` : 'Todo fluye'} />
          <HealthRow icon="🔴" label="Bloqueados" count={bloqueados.length}  color="#EF4444"
            subtitle={bloqueados.length > 0 ? bloqueados.map(b => b.codigo).slice(0,2).join(', ') + (bloqueados.length > 2 ? `…` : '') : 'Sin bloqueos'} />
          
          {bloqueados.length > 0 && (
            <div className="pt-2 border-t border-slate-850 space-y-1.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Por Categoría de Bloqueo:</div>
              <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                {Object.entries(blockingTypesCount)
                  .filter(([_, count]) => count > 0)
                  .map(([type, count]) => {
                    const labels = {
                      SPEC: 'Missing SPEC',
                      ADR: 'Missing ADR',
                      DIRECTOR: 'Director Decision',
                      INFRA: 'Infrastructure',
                      EXTERNAL_API: 'External API',
                      CREDENTIALS: 'OAuth / Creds',
                      DEPENDENCY: 'Dependencies',
                      DATA: 'Missing Data',
                      OTHER: 'Otros'
                    };
                    return (
                      <div key={type} className="flex justify-between items-center bg-slate-950/60 border border-slate-850/50 px-2 py-1 rounded-lg">
                        <span className="text-slate-400 font-medium truncate pr-1">{labels[type] || type}</span>
                        <span className="font-black text-rose-455 font-mono">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {conDependencias.length > 0 && (
            <div className="pt-1 border-t border-slate-800">
              <div className="text-[9px] text-slate-500 font-bold">
                🔗 {conDependencias.length} tarea{conDependencias.length > 1 ? 's' : ''} con dependencias
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: Distribución por ejecutor */}
        <div className="space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Por ejecutor</div>
          {ejecutorList.length === 0 && (
            <div className="text-[10px] text-slate-600">Sin datos de ejecutor</div>
          )}
          {ejecutorList.map(([ej, n]) => (
            <div key={ej} className="flex items-center gap-2">
              <div className="w-[100px] text-[10px] font-bold text-slate-300 truncate">{ej}</div>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                  style={{ width: `${(n / maxEj) * 100}%` }} />
              </div>
              <div className="w-5 text-right text-[11px] font-black text-blue-400">{n}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cuellos de botella */}
      {cuellos.length > 0 && (
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
            <span>⚠</span> Cuellos de botella detectados
          </div>
          {cuellos.slice(0, 3).map(b => (
            <div key={b.codigo} className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 flex items-start gap-3">
              <div className="flex flex-col min-w-[80px]">
                <span className="text-[10px] font-black text-red-400">{b.codigo}</span>
                <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">{b.titulo}</span>
              </div>
              <div className="text-slate-600 text-[9px] pt-1">bloquea →</div>
              <div className="flex flex-wrap gap-1">
                {b.bloqueaA.slice(0, 4).map(dep => (
                  <span key={dep.codigo} className="text-[9px] font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                    {dep.codigo}
                  </span>
                ))}
                {b.bloqueaA.length > 4 && (
                  <span className="text-[9px] text-slate-500">+{b.bloqueaA.length - 4}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top críticas */}
      {topCriticas.length > 0 && (
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
            <span>🚨</span> Críticas activas
          </div>
          {topCriticas.map(t => (
            <div key={t.codigo} className="flex items-center gap-2 py-0.5">
              <span className="text-[9px] font-black text-red-400 w-[70px] shrink-0">{t.codigo}</span>
              <span className="text-[10px] text-slate-300 truncate flex-1">{t.titulo}</span>
              <span className="text-[9px] text-slate-500 shrink-0">{getNormalizedExecutor(t)}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
                style={{ color: estadoLabel[t.estado]?.color || '#6B7280', backgroundColor: estadoLabel[t.estado]?.bg || 'transparent' }}>
                {estadoLabel[t.estado]?.label || t.estado}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-componente Health Row
function HealthRow({ icon, label, count, color, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-5 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-bold text-slate-400">{label}</span>
          <span className="text-lg font-black leading-none" style={{ color }}>{count}</span>
        </div>
        <div className="text-[9px] text-slate-600 truncate">{subtitle}</div>
      </div>
    </div>
  );
}
