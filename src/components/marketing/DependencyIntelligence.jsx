// DependencyIntelligence.jsx
// Ubicación: entre AtlasExecutionPulse y el grid principal en MissionControlLive
// Fuente: atlasTasks (estado ya cargado — sin consulta adicional)
// Detecta cadenas de bloqueo, cuellos de botella y tareas críticas de desbloqueo

// ─── Algoritmo de grafo ────────────────────────────────────────────────────
// Construye un mapa inverso: para cada tarea, ¿quién depende de ella?
function buildGraph(tasks) {
  const byCode   = {};   // codigo → task
  const blocking = {};   // codigo → [codigos que dependen de él]

  tasks.forEach(t => {
    byCode[t.codigo] = t;
    if (!blocking[t.codigo]) blocking[t.codigo] = [];
  });

  tasks.forEach(t => {
    if (Array.isArray(t.depende_de)) {
      t.depende_de.forEach(dep => {
        if (!blocking[dep]) blocking[dep] = [];
        blocking[dep].push(t.codigo);
      });
    }
  });

  return { byCode, blocking };
}

// BFS: dada una tarea raíz, calcula todos los descendientes (tareas bloqueadas en cadena)
function getChain(root, blocking, byCode, visited = new Set()) {
  if (visited.has(root)) return [];
  visited.add(root);
  const direct = blocking[root] || [];
  const chain  = [];
  direct.forEach(code => {
    chain.push(code);
    getChain(code, blocking, byCode, visited).forEach(c => chain.push(c));
  });
  return chain;
}

// ─── Colores por estado ────────────────────────────────────────────────────
const estadoColor = {
  pendiente:           '#6B7280',
  en_progreso:         '#3B82F6',
  bloqueada:           '#EF4444',
  en_revision:         '#F59E0B',
  requiere_correccion: '#F97316',
  completado:          '#10B981',
  archivado:           '#374151',
};

const estadoDot = {
  pendiente:           '⬜',
  en_progreso:         '🔵',
  bloqueada:           '🔴',
  en_revision:         '🟡',
  requiere_correccion: '🟠',
  completado:          '✅',
};

// ─── Sub-componentes ───────────────────────────────────────────────────────
function TaskChip({ code, task, highlight = false }) {
  if (!task) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-500 border border-slate-700">
        {code} <span className="text-slate-600">?</span>
      </span>
    );
  }
  const color = estadoColor[task.estado] || '#6B7280';
  const dot   = estadoDot[task.estado]   || '⬜';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border transition-all"
      style={{
        color,
        borderColor: highlight ? color : 'rgba(107,114,128,0.3)',
        backgroundColor: highlight ? `${color}18` : 'rgba(15,23,42,0.6)',
      }}
      title={task.titulo}
    >
      {dot} {code}
    </span>
  );
}

function ChainRow({ root, chain, byCode, isBottleneck }) {
  const rootTask = byCode[root];
  const maxShow  = 5;

  return (
    <div className={`rounded-xl px-3 py-2.5 border space-y-2 transition-all ${
      isBottleneck
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-slate-800 bg-slate-950/50'
    }`}>
      {/* Raíz */}
      <div className="flex items-start gap-2 flex-wrap">
        {isBottleneck && (
          <span className="text-[8px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded self-center">
            cuello
          </span>
        )}
        <TaskChip code={root} task={rootTask} highlight={isBottleneck} />
        {rootTask && (
          <span className="text-[9px] text-slate-500 truncate max-w-[220px] self-center" title={rootTask.titulo}>
            {rootTask.titulo}
          </span>
        )}
        {rootTask?.ejecutor && (
          <span className="text-[8px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded self-center ml-auto shrink-0">
            {rootTask.ejecutor}
          </span>
        )}
      </div>

      {/* Cadena de descendientes */}
      {chain.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap pl-2 border-l-2 border-slate-800">
          <span className="text-[8px] text-slate-600 font-bold mr-1">bloquea →</span>
          {chain.slice(0, maxShow).map(code => (
            <TaskChip key={code} code={code} task={byCode[code]} />
          ))}
          {chain.length > maxShow && (
            <span className="text-[9px] text-slate-500 font-bold">
              +{chain.length - maxShow} más
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function DependencyIntelligence({ atlasTasks = [] }) {
  const { byCode, blocking } = buildGraph(atlasTasks);

  // Tareas que bloquean al menos 1 descendiente (directo o en cadena)
  const roots = atlasTasks.filter(t => (blocking[t.codigo] || []).length > 0);

  // Calcular cadena completa de cada raíz
  const chains = roots
    .map(t => {
      const chain = getChain(t.codigo, blocking, byCode, new Set());
      return { root: t.codigo, chain, depth: chain.length };
    })
    .filter(c => c.depth > 0)
    .sort((a, b) => b.depth - a.depth); // mayor impacto primero

  // Cuellos de botella: raíces que están bloqueadas o estancadas Y bloquean cadena
  const bottlenecks = new Set(
    chains
      .filter(c => {
        const t = byCode[c.root];
        if (!t) return false;
        const isBlocked  = t.estado === 'bloqueada';
        const isStuck    = t.estado === 'en_progreso' &&
          (Date.now() - new Date(t.updated_at).getTime()) >= 24 * 60 * 60 * 1000;
        const isPending  = t.estado === 'pendiente';
        return (isBlocked || isStuck || isPending) && c.depth >= 1;
      })
      .map(c => c.root)
  );

  // Tareas "unlock key": pendientes/bloqueadas sin dependencias propias — desbloquearlas libera cadenas
  const unlockKeys = chains
    .filter(c => {
      const t = byCode[c.root];
      return t && (!Array.isArray(t.depende_de) || t.depende_de.length === 0);
    })
    .sort((a, b) => b.depth - a.depth)
    .slice(0, 3);

  // Stats resumen
  const totalDeps    = atlasTasks.filter(t => Array.isArray(t.depende_de) && t.depende_de.length > 0).length;
  const totalChained = new Set(chains.flatMap(c => c.chain)).size;
  const maxDepth     = chains[0]?.depth || 0;

  if (chains.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center gap-3">
        <span className="text-slate-600 text-sm">🔗</span>
        <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
          Dependency Intelligence — sin cadenas de bloqueo activas
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-white tracking-tight">🔗 Dependency Intelligence</span>
          {bottlenecks.size > 0 && (
            <span className="text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
              {bottlenecks.size} cuello{bottlenecks.size > 1 ? 's' : ''} detectado{bottlenecks.size > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] text-slate-600 font-bold uppercase tracking-wider">
          <span>{totalDeps} con deps</span>
          <span className="text-slate-700">·</span>
          <span>{totalChained} afectadas</span>
          <span className="text-slate-700">·</span>
          <span>cadena max {maxDepth}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Panel izquierdo: cadenas de mayor impacto */}
        <div className="xl:col-span-2 space-y-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
            Cadenas por impacto
          </div>
          {chains.slice(0, 6).map(c => (
            <ChainRow
              key={c.root}
              root={c.root}
              chain={c.chain}
              byCode={byCode}
              isBottleneck={bottlenecks.has(c.root)}
            />
          ))}
          {chains.length > 6 && (
            <div className="text-[9px] text-slate-600 text-center py-1">
              +{chains.length - 6} cadenas más
            </div>
          )}
        </div>

        {/* Panel derecho: unlock keys */}
        <div className="space-y-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
            🗝 Tareas de desbloqueo
          </div>
          <div className="text-[9px] text-slate-600 leading-relaxed mb-2">
            Sin dependencias propias — completarlas libera la mayor cadena.
          </div>
          {unlockKeys.length === 0 && (
            <div className="text-[9px] text-slate-600">
              Todas las raíces tienen dependencias propias.
            </div>
          )}
          {unlockKeys.map(uk => {
            const t = byCode[uk.root];
            return (
              <div key={uk.root}
                className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <TaskChip code={uk.root} task={t} highlight />
                  <span className="text-[9px] font-black text-emerald-400 shrink-0">
                    libera {uk.depth}
                  </span>
                </div>
                {t && (
                  <div className="text-[9px] text-slate-400 leading-tight line-clamp-2">
                    {t.titulo}
                  </div>
                )}
                {t?.ejecutor && (
                  <div className="text-[8px] text-slate-600 font-bold">
                    → {t.ejecutor}
                  </div>
                )}
              </div>
            );
          })}

          {/* Mini leyenda */}
          <div className="pt-3 border-t border-slate-800 space-y-1">
            <div className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-2">Leyenda</div>
            {[
              ['🔵', 'en_progreso'],
              ['🔴', 'bloqueada'],
              ['🟡', 'en_revision'],
              ['⬜', 'pendiente'],
              ['✅', 'completado'],
            ].map(([dot, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] w-4">{dot}</span>
                <span className="text-[9px] text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
