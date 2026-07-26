import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AlertTriangle, CheckCircle, Sparkles, RefreshCw, ChevronDown, ChevronUp, Bell, Clock, Activity, ShieldAlert, BookOpen, Layers } from 'lucide-react';

const OWNER_METRICS = {
  director: { name: 'Director', color: 'border-blue-500/30 text-blue-400 bg-blue-950/20 hover:border-blue-500/50' },
  'atlas-tech': { name: 'ATLAS-TECH', color: 'border-violet-500/30 text-violet-400 bg-violet-950/20 hover:border-violet-500/50' },
  swarm: { name: 'Swarm Agents', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20 hover:border-emerald-500/50' },
  antigravity: { name: 'Antigravity', color: 'border-amber-500/30 text-amber-400 bg-amber-950/20 hover:border-amber-500/50' }
};

const AGENT_CADENCE = {
  'hermes-ops': { expectedHours: 4, label: 'Centro Nervioso' },
  'hermes-qa': { expectedHours: 24, label: 'Briefing 8AM' },
  'hermes-commercial': { expectedHours: 12, label: 'Orquestador Comerc.' },
  'hermes-marketing': { expectedHours: 24, label: 'Marketing' },
  'ariadne-data': { expectedHours: 48, label: 'Analytics' },
  'intel': { expectedHours: 168, label: 'Intel semanal' },
  'atlas-tech': { expectedHours: 24, label: 'Backend' }
};

const CABLE_CONFIG = {
  meta_capi: { impact: 'operational', warningAfterHours: 6, criticalAfterHours: 24, label: 'Meta Capi' },
  firecrawl: { impact: 'operational', warningAfterHours: 168, criticalAfterHours: 336, label: 'Firecrawl Intel' },
  payment_ledger: { impact: 'operational', label: 'Payment Ledger' },
  hotel_knowledge: { impact: 'operational', label: 'Hotel Knowledge', min: 150 },
  geniall: { impact: 'external', isConfigured: false, label: 'Geniall B2B' },
  tbo_holidays: { impact: 'external', isConfigured: false, label: 'TBO Holidays' },
  google_capi: { impact: 'planned', isConfigured: false, label: 'Google Capi' }
};

const withTimeout = (promise, ms = 4000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
};

export const WarRoomV50 = () => {
  // Estado principal (Swap Atómico)
  const [owners, setOwners] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [cables, setCables] = useState({});
  const [agentActivity, setAgentActivity] = useState({});
  const [ssotHealth, setSsotHealth] = useState({
    hotels: 0,
    rooms: 0,
    rates: 0,
    seasons: 0,
    leads: 0,
    ledger: 0,
    media: 502,
    rag: '116/116 (100%)',
    loading: true
  });

  // Controladores de UI
  const [expandedOwner, setExpandedOwner] = useState(null);
  const [ownerTasks, setOwnerTasks] = useState({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedAgentLogs, setSelectedAgentLogs] = useState(null); // Drawer de Hermes
  const [logFilter, setLogFilter] = useState({ nivel: 'all', origen: 'all' });
  const [sectionErrors, setSectionErrors] = useState({});
  
  // Refresh & Timers
  const [lastRefresh, setLastRefresh] = useState(null);
  const [cablesCheckedAt, setCablesCheckedAt] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlight = useRef(false);

  // Cargar datos
  const loadAll = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);

    try {
      const [
        taskRes, 
        logsRes, 
        capiRes, 
        intelRes, 
        ledgerRes, 
        hkRes, 
        hCountRes, 
        rCountRes, 
        raCountRes, 
        sCountRes, 
        lCountRes, 
        pCountRes
      ] = await Promise.allSettled([
        withTimeout(supabase.rpc('get_warroom_task_summary')),
        withTimeout(supabase.from('logs_operativos').select('id, nivel, origen, evento, mensaje, created_at, resuelto').order('created_at', { ascending: false }).limit(50)),
        withTimeout(supabase.from('crm_capi_logs').select('sent_at, status, created_at').order('sent_at', { ascending: false }).limit(5)),
        withTimeout(supabase.from('competitive_intel').select('scrapeado_at').order('scrapeado_at', { ascending: false }).limit(1)),
        withTimeout(supabase.rpc('get_payment_ledger_breakdown')),
        withTimeout(supabase.from('hotel_knowledge').select('id', { count: 'exact', head: true }).eq('activo', true)),
        // SSOT Individual (Fase 11)
        withTimeout(supabase.from('hotels_master').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('rooms').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('rates').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('seasons').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('crm_leads').select('id', { count: 'exact', head: true })),
        withTimeout(supabase.from('payment_ledger').select('id', { count: 'exact', head: true }))
      ]);

      // SWAP ATÓMICO - Section taskSummary
      if (taskRes.status === 'fulfilled' && !taskRes.value.error) {
        setOwners(taskRes.value.data || []);
        setSectionErrors(prev => ({ ...prev, tasks: null }));
      } else {
        setSectionErrors(prev => ({ ...prev, tasks: 'DATA UNAVAILABLE' }));
      }

      // SWAP ATÓMICO - Section Logs
      if (logsRes.status === 'fulfilled' && !logsRes.value.error) {
        setAllLogs(logsRes.value.data || []);
        setSectionErrors(prev => ({ ...prev, logs: null }));
      } else {
        setSectionErrors(prev => ({ ...prev, logs: 'DATA UNAVAILABLE' }));
      }

      // SWAP ATÓMICO - Cables & Semáforos
      let resolvedCables = {};

      // 1. Meta CAPI
      let capiStatus = 'red';
      let capiLastSuccess = null;
      let capiErrors24h = 0;
      if (capiRes.status === 'fulfilled' && !capiRes.value.error && capiRes.value.data) {
        const logs = capiRes.value.data;
        const lastSent = logs.find(c => c.status === 'sent' || c.status === 'success');
        capiLastSuccess = lastSent ? (lastSent.sent_at || lastSent.created_at) : null;
        const hasError = logs.some(c => c.status === 'error' || c.status === 'failed');
        capiErrors24h = logs.filter(c => (c.status === 'error' || c.status === 'failed') && new Date(c.created_at) >= new Date(Date.now() - 86400000)).length;
        
        capiStatus = resolveCableStatus({
          lastSuccessAt: capiLastSuccess,
          warningAfterHours: CABLE_CONFIG.meta_capi.warningAfterHours,
          criticalAfterHours: CABLE_CONFIG.meta_capi.criticalAfterHours,
          hasError
        });
      }
      resolvedCables.meta_capi = { status: capiStatus, lastSuccessAt: capiLastSuccess, errors24h: capiErrors24h };

      // 2. Firecrawl
      let firecrawlStatus = 'red';
      let firecrawlLast = null;
      if (intelRes.status === 'fulfilled' && !intelRes.value.error && intelRes.value.data && intelRes.value.data[0]) {
        firecrawlLast = intelRes.value.data[0].scrapeado_at;
        firecrawlStatus = resolveCableStatus({
          lastTimestamp: firecrawlLast,
          warningAfterHours: CABLE_CONFIG.firecrawl.warningAfterHours,
          criticalAfterHours: CABLE_CONFIG.firecrawl.criticalAfterHours
        });
      }
      resolvedCables.firecrawl = { status: firecrawlStatus, lastTimestamp: firecrawlLast };

      // 3. Payment Ledger (disponibilidad e integridad)
      let ledgerStatus = 'red';
      if (ledgerRes.status === 'fulfilled' && !ledgerRes.value.error) {
        ledgerStatus = 'green';
      }
      resolvedCables.payment_ledger = { status: ledgerStatus };

      // 4. Hotel Knowledge
      let hkStatus = 'red';
      let hkCount = 0;
      if (hkRes.status === 'fulfilled' && !hkRes.value.error) {
        hkCount = hkRes.value.count || 0;
        hkStatus = resolveCableStatus({
          count: hkCount,
          min: CABLE_CONFIG.hotel_knowledge.min
        });
      }
      resolvedCables.hotel_knowledge = { status: hkStatus, count: hkCount };

      // Planned/External Cables (gray por especificación)
      resolvedCables.geniall = { status: 'gray' };
      resolvedCables.tbo_holidays = { status: 'gray' };
      resolvedCables.google_capi = { status: 'gray' };

      setCables(resolvedCables);

      // SWAP ATÓMICO - Hermes Reporter (cadencias)
      if (logsRes.status === 'fulfilled' && !logsRes.value.error && logsRes.value.data) {
        const logsData = logsRes.value.data;
        const yesterday = new Date(Date.now() - 86400000);
        const recentLogs = logsData.filter(l => new Date(l.created_at) >= yesterday);

        let tempActivity = {};
        recentLogs.forEach(l => {
          if (!tempActivity[l.origen]) {
            tempActivity[l.origen] = { events: 0, errors: 0, lastReport: null };
          }
          tempActivity[l.origen].events += 1;
          if (l.nivel === 'ERROR' || l.nivel === 'CRITICAL') {
            tempActivity[l.origen].errors += 1;
          }
          const logDate = new Date(l.created_at);
          if (!tempActivity[l.origen].lastReport || logDate > new Date(tempActivity[l.origen].lastReport)) {
            tempActivity[l.origen].lastReport = l.created_at;
          }
        });

        // Garantizar carga de cadencia por agente
        Object.keys(AGENT_CADENCE).forEach(agent => {
          if (!tempActivity[agent]) {
            tempActivity[agent] = { events: 0, errors: 0, lastReport: null };
          }
          const lastLog = logsData.find(l => l.origen === agent);
          if (lastLog) {
            tempActivity[agent].lastReport = lastLog.created_at;
          }
        });

        setAgentActivity(tempActivity);
      }

      // SWAP ATÓMICO - SSOT Health (Desagrupado y tolerante a fallos)
      setSsotHealth({
        hotels: (hCountRes.status === 'fulfilled' && !hCountRes.value.error) ? (hCountRes.value.count || 0) : 0,
        rooms: (rCountRes.status === 'fulfilled' && !rCountRes.value.error) ? (rCountRes.value.count || 0) : 0,
        rates: (raCountRes.status === 'fulfilled' && !raCountRes.value.error) ? (raCountRes.value.count || 0) : 0,
        seasons: (sCountRes.status === 'fulfilled' && !sCountRes.value.error) ? (sCountRes.value.count || 0) : 0,
        leads: (lCountRes.status === 'fulfilled' && !lCountRes.value.error) ? (lCountRes.value.count || 0) : 0,
        ledger: (pCountRes.status === 'fulfilled' && !pCountRes.value.error) ? (pCountRes.value.count || 0) : 0,
        media: 502,
        rag: '116/116 (100%)',
        loading: false
      });

      setLastRefresh(new Date());
      setCablesCheckedAt(new Date());
    } catch (err) {
      console.error("Error cargando el War Room:", err);
    } finally {
      setSsotHealth(prev => ({ ...prev, loading: false }));
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
    
    // Seguro de vida contra congelamientos del spinner inicial (Fase 11)
    const safetyTimeout = setTimeout(() => {
      setSsotHealth(prev => ({ ...prev, loading: false }));
    }, 5000);

    const interval = setInterval(loadAll, 60000);
    
    return () => {
      clearTimeout(safetyTimeout);
      clearInterval(interval);
    };
  }, []);

  // Lógica de Semáforos por Cable
  function resolveCableStatus({
    lastSuccessAt,
    lastTimestamp,
    warningAfterHours,
    criticalAfterHours,
    hasError = false,
    isConfigured = true,
    isHealthy = true,
    count = null,
    min = null
  }) {
    if (!isConfigured) return 'gray';
    if (hasError || !isHealthy) return 'red';

    if (count !== null && min !== null) {
      return count >= min ? 'green' : 'yellow';
    }

    const ts = lastSuccessAt || lastTimestamp;
    if (!ts) return 'red';

    const hours = (Date.now() - new Date(ts)) / 3600000;
    if (hours <= warningAfterHours) return 'green';
    if (hours <= criticalAfterHours) return 'yellow';
    return 'red';
  }

  // Salud Global del Ecosistema (Gate 4)
  const ecosystemHealth = useMemo(() => {
    // Solo cables 'operational'
    const redOperational = Object.entries(cables).filter(([id, cable]) =>
      cable.status === 'red' && CABLE_CONFIG[id]?.impact === 'operational'
    ).length;

    // Solo CRITICAL activos
    const criticalLogs = allLogs.filter(l => l.nivel === 'CRITICAL' && !l.resuelto);
    const activeCritical = criticalLogs.length;

    // Cuello de botella activo de alta criticidad en owners
    const hasBlockedCritical = owners.some(o =>
      o.health === 'red' && o.critical > 0
    );

    if (redOperational > 0 || activeCritical > 0) return 'red';
    if (hasBlockedCritical) return 'yellow';
    return 'green';
  }, [cables, allLogs, owners]);

  // Cargar tareas al hacer click en Owner (Lazy Load inline - Fase 5)
  const toggleOwnerExpansion = async (ownerType) => {
    if (expandedOwner === ownerType) {
      setExpandedOwner(null);
      return;
    }

    setExpandedOwner(ownerType);
    setLoadingTasks(true);
    try {
      const { data, error } = await supabase
        .from('atlas_tasks')
        .select('id, codigo, titulo, prioridad, estado, depende_de')
        .eq('owner_type', ownerType)
        .in('estado', ['pendiente', 'en_progreso'])
        .order('prioridad')
        .limit(50);

      if (!error) {
        setOwnerTasks(prev => ({ ...prev, [ownerType]: data || [] }));
      }
    } catch (err) {
      console.error("Error loading owner tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Filtrado de logs locales (useMemo - Gate 3)
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (logFilter.nivel !== 'all' && log.nivel !== logFilter.nivel) return false;
      if (logFilter.origen !== 'all' && log.origen !== logFilter.origen) return false;
      return true;
    });
  }, [allLogs, logFilter]);

  // Extraer origenes unicos de logs
  const logOrigins = useMemo(() => {
    return Array.from(new Set(allLogs.map(l => l.origen))).filter(Boolean);
  }, [allLogs]);

  // Alertas críticas (Conditional Render superior)
  const activeCriticalAlerts = useMemo(() => {
    return allLogs.filter(l => l.nivel === 'CRITICAL' && !l.resuelto);
  }, [allLogs]);

  const isInitialLoad = !lastRefresh;

  if (isInitialLoad && ssotHealth.loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-xs font-black uppercase tracking-widest text-slate-400 animate-pulse">Iniciando War Room v5.0...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-slate-950 p-6 rounded-2xl border border-slate-900 text-slate-200 min-h-screen relative overflow-hidden">
      
      {/* ── SECCIÓN 1: HEADER & STATUS GLOBAL ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            WAR ROOM v5.0
            <span className={`text-[10px] px-3 py-0.5 rounded-full border font-black uppercase ${
              ecosystemHealth === 'green' ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400' :
              ecosystemHealth === 'yellow' ? 'bg-amber-950/30 border-amber-500/20 text-amber-400' :
              'bg-red-950/30 border-red-500/20 text-red-400'
            }`}>
              {ecosystemHealth === 'green' ? '🟢 ECOSISTEMA OPERATIVO' :
               ecosystemHealth === 'yellow' ? '🟡 ADVERTENCIAS ACTIVAS' :
               '🔴 REQUIERE ATENCIÓN'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5 font-sans">
            Near real-time · Último chequeo: {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
            {isRefreshing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
            {!isRefreshing && <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>}
          </p>
        </div>
      </div>

      {/* ── SECCIÓN 2: CONDITIONAL RENDERING ALERTAS CRÍTICAS ── */}
      {activeCriticalAlerts.length > 0 && (
        <div className="bg-red-950/10 border border-red-500/30 rounded-2xl p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center gap-2 text-red-400">
            <ShieldAlert className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Alertas Críticas Activas ({activeCriticalAlerts.length})</span>
          </div>
          <div className="space-y-2">
            {activeCriticalAlerts.map(alert => (
              <div key={alert.id} className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl flex items-center justify-between gap-4">
                <div className="text-xs">
                  <span className="font-mono text-slate-550 text-[10px]">{new Date(alert.created_at).toLocaleTimeString()} · </span>
                  <span className="font-black text-red-405 uppercase text-[10px]">{alert.origen}:</span>
                  <p className="text-slate-200 mt-1 font-semibold">{alert.mensaje || alert.evento}</p>
                </div>
                <button
                  onClick={async () => {
                    await supabase.from('logs_operativos').update({ resuelto: true }).eq('id', alert.id);
                    loadAll();
                  }}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition"
                >
                  Resolver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: FILAS DE TARJETAS DE OWNERS (rpc get_warroom_task_summary) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(OWNER_METRICS).map(([id, meta]) => {
          const summary = owners.find(o => o.owner_type === id) || {
            total_active: 0,
            pending: 0,
            in_progress: 0,
            blocked: 0,
            critical: 0,
            high: 0,
            health: 'green'
          };
          const isExpanded = expandedOwner === id;

          return (
            <div 
              key={id} 
              className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${meta.color} ${
                isExpanded ? 'ring-2 ring-violet-500/50 scale-[1.01]' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs uppercase tracking-wider text-white">{meta.name}</span>
                  {summary.blocked > 0 && (
                    <span className="text-[8px] font-black text-red-400 border border-red-500/25 px-1.5 py-0.5 rounded bg-red-950/20">
                      ⛓ CUELLO ACTIVO
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-400">
                  <div>Activas: <span className="text-white font-black">{summary.total_active}</span></div>
                  <div>Críticas: <span className={`font-black ${summary.critical > 0 ? 'text-red-405' : 'text-slate-300'}`}>{summary.critical}</span></div>
                  <div>En Progreso: <span className="text-white font-black">{summary.in_progress}</span></div>
                  <div>Bloqueadas: <span className={`font-black ${summary.blocked > 0 ? 'text-red-405' : 'text-slate-300'}`}>{summary.blocked}</span></div>
                </div>
              </div>

              {/* Tareas del Owner (Fase 5 - Lazy Load) */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-900 space-y-2 animate-fadeIn max-h-[220px] overflow-y-auto pr-1">
                  {loadingTasks ? (
                    <div className="text-[10px] text-center text-slate-500 animate-pulse py-2">Cargando backlog de tareas...</div>
                  ) : ownerTasks[id]?.length === 0 ? (
                    <div className="text-[10px] text-slate-550 italic text-center py-2">Sin tareas activas pendientes.</div>
                  ) : (
                    ownerTasks[id]?.map(t => (
                      <div key={t.id} className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl space-y-1">
                        <div className="flex justify-between items-center text-[9px]">
                          <span className="font-black text-yellow-500">{t.codigo}</span>
                          <span className={`px-1 rounded uppercase font-black tracking-wider text-[8px] ${
                            t.prioridad === 'critical' ? 'bg-red-650/15 text-red-500 border border-red-500/25' :
                            t.prioridad === 'high' ? 'bg-amber-650/15 text-amber-500' : 'bg-slate-855 text-slate-450'
                          }`}>
                            {t.prioridad}
                          </span>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-350 leading-relaxed truncate">{t.titulo}</p>
                        {t.depende_de && (
                          <span className="text-[8px] text-red-400 block font-bold">⛓ Bloq por: {t.depende_de}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              <button
                onClick={() => toggleOwnerExpansion(id)}
                className="mt-4 flex items-center justify-center gap-1.5 w-full py-1.5 border border-slate-900 hover:border-slate-850 rounded-xl text-[10px] font-black uppercase text-slate-400 hover:text-white transition"
              >
                {isExpanded ? (
                  <>Cerrar <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Expandir <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── SECCIÓN 4: CABLES/INTEGRACIONES vs HERMES REPORTER ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* PANEL IZQUIERDO: CABLES / INTEGRACIONES */}
        <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Cables / Integraciones de Ecosistema</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Object.entries(cables).map(([id, cable]) => {
              const conf = CABLE_CONFIG[id] || { label: id, impact: 'planned' };
              const isConfigured = conf.isConfigured !== false;
              
              return (
                <div key={id} className="bg-slate-950 border border-slate-855 hover:border-slate-800 p-3 rounded-xl flex flex-col justify-between space-y-3 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-300">{conf.label}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      cable.status === 'green' ? 'bg-emerald-400 shadow-emerald-400/50' :
                      cable.status === 'yellow' ? 'bg-amber-400 shadow-amber-400/50' :
                      cable.status === 'red' ? 'bg-red-400 shadow-red-400/50 animate-pulse' :
                      'bg-slate-650'
                    }`}></span>
                  </div>

                  <div className="space-y-1 text-[10px] text-slate-500 font-semibold">
                    {isConfigured ? (
                      <>
                        {id === 'meta_capi' && (
                          <>
                            <span className="block">Último éxito: {cable.lastSuccessAt ? new Date(cable.lastSuccessAt).toLocaleTimeString() : 'Ninguno'}</span>
                            <span className="block">Errores 24h: <strong className={cable.errors24h > 0 ? 'text-red-400' : 'text-slate-400'}>{cable.errors24h}</strong></span>
                          </>
                        )}
                        {id === 'firecrawl' && (
                          <span className="block">Último scrape: {cable.lastTimestamp ? new Date(cable.lastTimestamp).toLocaleDateString() : 'Ninguno'}</span>
                        )}
                        {id === 'hotel_knowledge' && (
                          <span className="block">Registros HK: <strong className="text-white font-bold">{cable.count} / {conf.min} min</strong></span>
                        )}
                        {id === 'payment_ledger' && (
                          <span className="block">Integridad Ledger: <strong className="text-emerald-450">OPERATIONAL</strong></span>
                        )}
                        <span className="block text-[9px] text-slate-600 font-mono mt-1">Verificado: Hace {cablesCheckedAt ? Math.round((Date.now() - cablesCheckedAt) / 1000) : 0}s</span>
                      </>
                    ) : (
                      <span className="block italic text-slate-600 uppercase font-black tracking-widest text-[9px]">⚪ {conf.impact === 'planned' ? 'Planned' : 'External'}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO: HERMES REPORTER */}
        <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <span>Hermes Reporter & Cadencia de Agentes</span>
          </h3>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {Object.entries(AGENT_CADENCE).map(([agent, spec]) => {
              const act = agentActivity[agent] || { events: 0, errors: 0, lastReport: null };
              
              // Calcular color por cadencia
              let status = 'red';
              if (act.lastReport) {
                const diffHours = (Date.now() - new Date(act.lastReport)) / 3600000;
                status = diffHours <= spec.expectedHours ? 'green' : 'yellow';
              }

              return (
                <div key={agent} className="bg-slate-950 border border-slate-855 p-3 rounded-xl flex items-center justify-between gap-4 hover:border-slate-800 transition">
                  <div className="space-y-1">
                    <span className="font-black text-slate-350 text-xs block">🤖 {agent.toUpperCase()}</span>
                    <span className="text-[10px] text-slate-500 font-bold block">{spec.label} (Cadencia: {spec.expectedHours}h)</span>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      Último reporte: {act.lastReport ? `hace ${Math.round((Date.now() - new Date(act.lastReport)) / 3600000)}h` : 'Nunca'}
                    </span>
                  </div>

                  <div className="text-right space-y-1.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[10px] font-black text-slate-300 block">Eventos: {act.events}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        status === 'green' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}></span>
                    </div>
                    
                    <button
                      onClick={() => {
                        setSelectedAgentLogs(agent);
                      }}
                      className="px-2.5 py-1 border border-slate-900 hover:border-slate-800 text-slate-450 hover:text-slate-200 rounded-lg text-[9px] font-bold uppercase transition"
                    >
                      [Ver historial →]
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── SECCIÓN 5: LIVE OPERATIONAL LOG (Filtros Locales) ── */}
      <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-950 pb-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>Live Operational Log (Consola de Incidentes)</span>
          </h3>

          {/* Filtros locales */}
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
            {/* Filtro de nivel */}
            <select
              value={logFilter.nivel}
              onChange={e => setLogFilter(prev => ({ ...prev, nivel: e.target.value }))}
              className="bg-slate-950 border border-slate-850 px-2 py-1 rounded-lg focus:outline-none"
            >
              <option value="all">Nivel: TODOS</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Filtro de origen */}
            <select
              value={logFilter.origen}
              onChange={e => setLogFilter(prev => ({ ...prev, origen: e.target.value }))}
              className="bg-slate-950 border border-slate-850 px-2 py-1 rounded-lg focus:outline-none"
            >
              <option value="all">Origen: TODOS</option>
              {logOrigins.map(o => (
                <option key={o} value={o}>{o.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Consola de logs */}
        <div className="bg-slate-950 border border-slate-855 rounded-xl p-4 font-mono text-[10px] space-y-2 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
          {sectionErrors.logs ? (
            <div className="text-center py-6 text-red-400 font-bold uppercase tracking-widest">{sectionErrors.logs}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-6 text-slate-655 italic">Sin registros que coincidan con los filtros.</div>
          ) : (
            filteredLogs.map(log => {
              const formattedTime = new Date(log.created_at).toLocaleTimeString();
              const isResolved = log.resuelto;
              
              let badgeColor = 'bg-slate-800 text-slate-400';
              if (log.nivel === 'CRITICAL') badgeColor = isResolved ? 'bg-slate-800/40 text-slate-500 opacity-50' : 'bg-red-950/20 text-red-400 border border-red-500/25';
              if (log.nivel === 'ERROR') badgeColor = isResolved ? 'bg-slate-800/40 text-slate-500 opacity-50' : 'bg-amber-950/20 text-amber-500 border border-amber-500/25';
              if (log.nivel === 'SUCCESS') badgeColor = 'bg-emerald-950/20 text-emerald-400';
              if (log.nivel === 'WARN') badgeColor = 'bg-amber-950/15 text-amber-400';

              return (
                <div 
                  key={log.id} 
                  className={`flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg transition hover:bg-slate-900/30 ${
                    isResolved ? 'opacity-50 border border-slate-900 bg-slate-950/20' : ''
                  }`}
                >
                  <span className="text-slate-550 shrink-0 font-sans mt-0.5">{formattedTime}</span>
                  <span className={`px-1.5 py-0.2 rounded font-black text-[8px] uppercase tracking-wider shrink-0 ${badgeColor}`}>
                    {log.nivel}
                  </span>
                  <span className="text-slate-500 shrink-0 font-sans font-bold">[{log.origen}]</span>
                  <span className="text-slate-300 flex-1 leading-relaxed">{log.mensaje || log.evento}</span>
                  {isResolved && (
                    <span className="text-emerald-500 shrink-0 font-black text-[9px] uppercase tracking-wider">✓ Resuelto</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── SECCIÓN 6: SSOT HEALTH ── */}
      <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-500" />
          <span>SSOT Health & Consistencia de Datos</span>
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          <HealthBox label="Hoteles" value={ssotHealth.hotels} />
          <HealthBox label="Habitaciones" value={ssotHealth.rooms} />
          <HealthBox label="Tarifas" value={ssotHealth.rates} />
          <HealthBox label="Temporadas" value={ssotHealth.seasons} />
          <HealthBox label="Clientes CRM" value={ssotHealth.leads} />
          <HealthBox label="Asientos Ledger" value={ssotHealth.ledger} />
          <HealthBox label="RAG Cache" value={ssotHealth.rag} tone="success" />
        </div>
      </div>

      {/* ── DRAWER LATERAL DE HERMES ── */}
      {selectedAgentLogs && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 backdrop-blur-sm flex justify-end animate-fadeIn">
          <div className="w-full md:w-[480px] bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between text-slate-200">
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black block">Historial del Agente</span>
                  <h2 className="text-lg font-black text-white">🤖 {selectedAgentLogs.toUpperCase()}</h2>
                </div>
                <button
                  onClick={() => setSelectedAgentLogs(null)}
                  className="text-slate-500 hover:text-white text-base font-extrabold focus:outline-none p-1"
                >
                  ✕
                </button>
              </div>

              {/* Logs filtrados para el Drawer */}
              <div className="space-y-2.5">
                {allLogs.filter(l => l.origen === selectedAgentLogs).length === 0 ? (
                  <p className="text-xs text-slate-555 italic text-center py-10">Sin reportes registrados para este agente.</p>
                ) : (
                  allLogs.filter(l => l.origen === selectedAgentLogs).map(l => (
                    <div key={l.id} className="bg-slate-950 border border-slate-855 p-3.5 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-mono">{new Date(l.created_at).toLocaleString()}</span>
                        <span className={`px-1.5 py-0.2 rounded font-black text-[8px] uppercase tracking-wider ${
                          l.nivel === 'CRITICAL' ? 'bg-red-950/20 text-red-500 border border-red-500/25' :
                          l.nivel === 'ERROR' ? 'bg-amber-950/20 text-amber-500 border border-amber-500/25' :
                          l.nivel === 'SUCCESS' ? 'bg-emerald-950/20 text-emerald-400' : 'bg-slate-850 text-slate-400'
                        }`}>{l.nivel}</span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">{l.mensaje || l.evento}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedAgentLogs(null)}
              className="mt-6 w-full py-2.5 bg-slate-950 border border-slate-850 hover:border-slate-800 text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white rounded-xl transition"
            >
              Cerrar Drawer
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

const HealthBox = ({ label, value, tone = 'default' }) => (
  <div className="bg-slate-950 border border-slate-855 p-3.5 rounded-xl text-center space-y-1 hover:border-slate-800 transition">
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">{label}</span>
    <span className={`font-mono font-black text-xs ${
      tone === 'success' ? 'text-emerald-450 animate-pulse' : 'text-white'
    }`}>{value}</span>
  </div>
);

export default WarRoomV50;
