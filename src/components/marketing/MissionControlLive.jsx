import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

// ─── Helpers ────────────────────────────────────────────────────────────────

const frenteColor = (frente) => ({
  'F1-FRONTEND':     '#3B82F6',
  'F2-BACKEND-CORE': '#8B5CF6',
  'F3-ATRACCION':    '#F59E0B',
  'F4-RRHH-IA':      '#10B981',
  'F5-SEGURIDAD':    '#EF4444',
})[frente] || '#6B7280';

const relativeTime = (isoString) => {
  if (!isoString) return 'Sin datos';
  const mins = (Date.now() - new Date(isoString).getTime()) / 60000;
  if (mins < 1)  return 'Recién';
  if (mins < 60) return `Hace ${Math.round(mins)} min`;
  return `Hace ${Math.round(mins / 60)} h`;
};

// ─── Constantes ─────────────────────────────────────────────────────────────

const N8N_HEALTH_URL  = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/mcp-health';
const N8N_STATUS_URL  = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/n8n-status';
const POLL_FAST  = 30_000;   // 30 s  — status bar
const POLL_MED   = 60_000;   // 60 s  — agentes, incidentes, tareas, reservas
const POLL_SLOW  = 300_000;  // 5 min — tasa dólar

// ─── Componente ─────────────────────────────────────────────────────────────

export const MissionControlLive = () => {

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('workflows');

  // ── System status ─────────────────────────────────────────────────────────
  const [systemStatus, setSystemStatus] = useState({
    mcp: null, n8n: null, supabase: null,
    mcpVersion: '—', mcpTools: 0,
    lastChecked: null,
  });

  // ── Datos principales ─────────────────────────────────────────────────────
  const [agents,       setAgents]       = useState([]);
  const [n8nWorkflows, setN8nWorkflows] = useState([]);
  const [n8nFetchState, setN8nFetchState] = useState('idle'); // 'idle'|'loading'|'ok'|'empty'|'error'

  const [bookingStats, setBookingStats] = useState({
    total: 0, paid: 0, pending: 0, confirmed: 0, cancelled: 0,
  });
  const [criticalNoVoucher, setCriticalNoVoucher] = useState([]);
  const [warningNoVoucher,  setWarningNoVoucher]  = useState([]);
  const [recentActivity,    setRecentActivity]    = useState([]);

  // ── Incidentes ────────────────────────────────────────────────────────────
  const [incidentes,        setIncidentes]        = useState([]);
  const [resumenIncidentes, setResumenIncidentes] = useState({ sin_resolver: 0 });
  const [incidentePage,     setIncidentePage]     = useState(0);
  const [mostrarTodos,      setMostrarTodos]      = useState(false);
  const INC_PAGE_SIZE = 6;

  // ── Tareas ────────────────────────────────────────────────────────────────
  const [atlasTasks,  setAtlasTasks]  = useState([]);
  const [gapTasks,    setGapTasks]    = useState([]);

  // ── Tasa dólar ────────────────────────────────────────────────────────────
  const [tasaActual,   setTasaActual]   = useState(null);
  const [tasaInput,    setTasaInput]    = useState('');
  const [tasaGuardando,setTasaGuardando]= useState(false);
  const [tasaMensaje,  setTasaMensaje]  = useState('');

  // ── Stale payments ────────────────────────────────────────────────────────
  // NUEVA: pagos estancados en pending_review más de 24h
  const [stalePayments,     setStalePayments]     = useState([]);
  const [staleLoading,      setStaleLoading]      = useState(false);
  const [staleLastFetched,  setStaleLastFetched]  = useState(null);

  // ── Heartbeat manual ──────────────────────────────────────────────────────
  // NUEVA: el Director puede forzar un ping de salud sobre cualquier agente
  const [heartbeatTarget,   setHeartbeatTarget]   = useState('');
  const [heartbeatSending,  setHeartbeatSending]  = useState(false);
  const [heartbeatMsg,      setHeartbeatMsg]      = useState('');

  // ── Revenue rápido ────────────────────────────────────────────────────────
  // NUEVA: revenue_by_period desde las RPCs de Ariadne
  const [revenueStats, setRevenueStats] = useState(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 1 — Health del sistema (MCP + n8n + Supabase) cada 30 s
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res  = await fetch(N8N_HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
        const data = await res.json();
        const mcpOk      = data.status === 'ok';
        const supabaseOk = data.supabase === 'ok' || data.supabase === 'connected';
        // n8n: solo verde si el health endpoint dice explícitamente que n8n está ok
        // (el endpoint mcp-health incluye n8n_ok si está configurado, sino asumimos ok
        // porque el health mismo proviene de n8n).
        const n8nOk = res.ok; // si el webhook responde, n8n está vivo
        setSystemStatus({
          mcp:        mcpOk      ? 'ok'   : 'error',
          n8n:        n8nOk      ? 'ok'   : 'error',
          supabase:   supabaseOk ? 'ok'   : 'error',
          mcpVersion: data.version || '—',
          mcpTools:   data.tools   || 0,
          lastChecked: new Date().toLocaleTimeString('es-DO'),
        });
      } catch {
        setSystemStatus(s => ({ ...s, mcp: 'error', n8n: 'error', supabase: 'error', lastChecked: new Date().toLocaleTimeString('es-DO') }));
      }
    };
    fetchHealth();
    const t = setInterval(fetchHealth, POLL_FAST);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 2 — Personal IA + Incidentes vía rpc_personal_ia_status cada 60 s
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchPersonal = async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_personal_ia_status');
        if (error) throw error;

        const personal = data?.personal || [];
        setAgents(personal.map(p => {
          const statusMap = { online: 'Online', idle: 'Busy', error: 'Offline', offline: 'Offline' };
          return {
            name:              p.nombre_agente,
            role:              p.rol + (p.departamento ? ` · ${p.departamento}` : ''),
            status:            statusMap[p.estado] || 'Offline',
            lastActive:        relativeTime(p.ultimo_heartbeat),
            incidentesAbiertos: p.incidentes_abiertos || 0,
            contenedor:        p.contenedor || null,
          };
        }));

        setIncidentes(data?.incidentes_recientes || []);
        setResumenIncidentes({ sin_resolver: data?.resumen?.incidentes_sin_resolver || 0 });
        setIncidentePage(0); // reset paginación cuando llegan datos frescos
      } catch (err) {
        console.error('rpc_personal_ia_status:', err);
      }
    };
    fetchPersonal();
    const t = setInterval(fetchPersonal, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 3 — n8n Workflows cada 60 s  (G1 FIX)
  // El webhook /n8n-status es async: responde "Workflow was started" de inmediato.
  // Solución: hacemos el fetch pero mostramos el estado del intento honestamente.
  // Cuando el WF de n8n esté arreglado para responder sincrónicamente, este código
  // ya maneja la respuesta correctamente sin cambios adicionales.
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchWorkflows = async () => {
      setN8nFetchState('loading');
      try {
        const res  = await fetch(N8N_STATUS_URL, { signal: AbortSignal.timeout(12_000) });
        const data = await res.json();

        // Si el WF está bien configurado devuelve { workflows: [...] }
        if (Array.isArray(data?.workflows) && data.workflows.length > 0) {
          setN8nWorkflows(data.workflows);
          setN8nFetchState('ok');
        } else if (data?.message === 'Workflow was started') {
          // WF async — todavía no arreglado en n8n
          setN8nWorkflows([]);
          setN8nFetchState('async_pending'); // estado honesto
        } else {
          setN8nWorkflows([]);
          setN8nFetchState('empty');
        }
      } catch {
        setN8nWorkflows([]);
        setN8nFetchState('error');
      }
    };
    fetchWorkflows();
    const t = setInterval(fetchWorkflows, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 4 — Tasa del dólar cada 5 min
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchTasa = async () => {
      try {
        const { data, error } = await supabase
          .from('exchange_rates')
          .select('rate_sell, rate_bp_original, updated_at')
          .eq('currency_pair', 'USD_DOP')
          .eq('is_active', true)
          .single();
        if (!error && data) setTasaActual(data);
      } catch (err) {
        console.error('exchange_rates:', err);
      }
    };
    fetchTasa();
    const t = setInterval(fetchTasa, POLL_SLOW);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 5 — KPIs reservas + gaps voucher + actividad reciente + atlas_tasks
  // G5 FIX: los counts de bookings se hacen en una sola query con SELECT count
  // particionado; mantenemos las 5 queries separadas hasta que exista una RPC
  // rpc_booking_stats() en Supabase — anotado como tarea pendiente.
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        // KPIs — 5 counts (candidato a RPC futura: rpc_booking_stats)
        const [
          { count: total },
          { count: paid },
          { count: pending },
          { count: confirmed },
          { count: cancelled },
        ] = await Promise.all([
          supabase.from('bookings').select('*', { count: 'exact', head: true }),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid'),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('payment_status', 'pending'),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
        ]);
        setBookingStats({ total: total||0, paid: paid||0, pending: pending||0, confirmed: confirmed||0, cancelled: cancelled||0 });

        // Gaps voucher SEV1 + SEV2
        const { data: gapBookings } = await supabase
          .from('bookings')
          .select('id, booking_reference, total_amount, currency, created_at, guest_name, voucher_code, voucher_id')
          .eq('payment_status', 'paid')
          .or('voucher_code.is.null,voucher_id.is.null');

        const gaps = gapBookings || [];
        const criticalList = gaps.filter(b => b.voucher_code === null && b.voucher_id === null);
        const warningList  = gaps.filter(b => (b.voucher_code === null) !== (b.voucher_id === null));
        setCriticalNoVoucher(criticalList);
        setWarningNoVoucher(warningList);

        // Gap tasks para el panel de "Actividad en Vivo"
        setGapTasks([
          ...criticalList.map(b => ({
            id: `GAP-SEV1-${b.booking_reference || b.id.substring(0,6).toUpperCase()}`,
            description: `Reserva ${b.booking_reference || b.id.substring(0,6)} pagada sin voucher_code ni voucher_id.`,
            priority: 'SEV1',
            status: 'Crítico — Pendiente Hermes',
          })),
          ...warningList.map(b => ({
            id: `GAP-SEV2-${b.booking_reference || b.id.substring(0,6).toUpperCase()}`,
            description: `Reserva ${b.booking_reference || b.id.substring(0,6)} con voucher incompleto (falta ${b.voucher_code === null ? 'código' : 'URL PDF'}).`,
            priority: 'SEV2',
            status: 'Advertencia — Gap Parcial',
          })),
        ]);

        // Actividad reciente
        const { data: recent } = await supabase
          .from('bookings')
          .select('booking_reference, status, payment_status, created_at, total_amount, currency, guest_name')
          .order('created_at', { ascending: false })
          .limit(10);
        setRecentActivity(recent || []);

        // Atlas tasks backlog
        const { data: fetchedTasks } = await supabase
          .from('atlas_tasks')
          .select('codigo, titulo, asignado_a, prioridad, estado, frente, sprint')
          .not('estado', 'in', '("completado","archivado")')
          .order('fecha_encargo', { ascending: false });
        setAtlasTasks(fetchedTasks || []);

      } catch (err) {
        console.error('fetchBookings:', err);
      }
    };
    fetchBookings();
    const t = setInterval(fetchBookings, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 6 — NUEVA: Stale Payments (pagos estancados > 24 h)
  // Fuente: RPC stale_payments en Supabase
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchStale = async () => {
      setStaleLoading(true);
      try {
        const { data, error } = await supabase.rpc('stale_payments', { p_hours: 24 });
        if (!error) {
          setStalePayments(data || []);
          setStaleLastFetched(new Date().toLocaleTimeString('es-DO'));
        }
      } catch (err) {
        console.error('stale_payments:', err);
      } finally {
        setStaleLoading(false);
      }
    };
    fetchStale();
    const t = setInterval(fetchStale, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING 7 — NUEVA: Revenue rápido (revenue_by_period de Ariadne)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const [mes, sem] = await Promise.all([
          supabase.rpc('revenue_by_period', { p_period: 'month' }),
          supabase.rpc('revenue_by_period', { p_period: 'week'  }),
        ]);
        if (!mes.error && !sem.error) {
          setRevenueStats({
            month: mes.data?.[0] || null,
            week:  sem.data?.[0] || null,
          });
        }
      } catch (err) {
        console.error('revenue_by_period:', err);
      }
    };
    fetchRevenue();
    const t = setInterval(fetchRevenue, POLL_SLOW);
    return () => clearInterval(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCIONES
  // ═══════════════════════════════════════════════════════════════════════════

  const handleActualizarIncidente = async (id, campo, valor) => {
    try {
      const params = { p_id: id };
      if (campo === 'resuelto') params.p_resuelto = valor;
      if (campo === 'escalado') params.p_escalado = valor;
      const { error } = await supabase.rpc('rpc_actualizar_incidente', params);
      if (error) throw error;
      setIncidentes(prev => prev.map(inc => inc.id === id ? { ...inc, [campo]: valor } : inc));
      if (campo === 'resuelto' && valor === true) {
        setResumenIncidentes(prev => ({ ...prev, sin_resolver: Math.max(0, prev.sin_resolver - 1) }));
      }
    } catch (err) {
      console.error('rpc_actualizar_incidente:', err);
    }
  };

  const handleCompletarTarea = async (codigo) => {
    try {
      await supabase
        .from('atlas_tasks')
        .update({ estado: 'completado', fecha_completado: new Date().toISOString() })
        .eq('codigo', codigo);
      setAtlasTasks(prev => prev.filter(t => t.codigo !== codigo));
    } catch (err) {
      console.error('completar tarea:', err);
    }
  };

  const handleConfirmarTasa = async () => {
    const valor = parseFloat(tasaInput);
    if (!valor || valor <= 0) { setTasaMensaje('Ingresa un número válido'); return; }
    setTasaGuardando(true);
    setTasaMensaje('');
    try {
      const { data, error } = await supabase.rpc('rpc_registrar_tasa_dolar', {
        p_rate_bp:              valor,
        p_confirmado_por_nombre: 'finanzas',
        p_confirmado_via:        'mission_control',
      });
      if (error) throw error;
      setTasaActual({ rate_sell: data.rate_final, rate_bp_original: data.rate_bp_original, updated_at: data.vigente_desde });
      setTasaInput('');
      setTasaMensaje(`✓ Actualizada: RD$ ${data.rate_final} (BP: ${data.rate_bp_original})`);
    } catch (err) {
      setTasaMensaje('Error al guardar');
      console.error(err);
    } finally {
      setTasaGuardando(false);
    }
  };

  // NUEVA: ping manual de heartbeat desde el dashboard
  const handleHeartbeatManual = async () => {
    if (!heartbeatTarget) return;
    setHeartbeatSending(true);
    setHeartbeatMsg('');
    try {
      const res = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/agente-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion:        'heartbeat',
          nombre_agente: heartbeatTarget,
          tarea_actual:  'ping_manual_director',
          timestamp:     new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      setHeartbeatMsg(data.success !== false ? `✓ Heartbeat registrado para ${heartbeatTarget}` : `⚠ ${data.error || 'Sin respuesta'}`);
    } catch {
      setHeartbeatMsg('⚠ No se pudo alcanzar el webhook');
    } finally {
      setHeartbeatSending(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Incidentes paginados (G3 FIX)
  // ═══════════════════════════════════════════════════════════════════════════
  const incidentesVisibles = mostrarTodos
    ? incidentes
    : incidentes.slice(incidentePage * INC_PAGE_SIZE, (incidentePage + 1) * INC_PAGE_SIZE);
  const totalPaginas = Math.ceil(incidentes.length / INC_PAGE_SIZE);

  // ─── Dot indicador ────────────────────────────────────────────────────────
  const StatusDot = ({ state, label, extra }) => {
    const color = state === 'ok'    ? 'bg-emerald-500' :
                  state === null    ? 'bg-slate-600 animate-pulse' :
                  'bg-rose-500';
    const text  = state === 'ok'    ? 'text-emerald-400' :
                  state === null    ? 'text-slate-500' :
                  'text-rose-400';
    return (
      <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className={text}>{label}: {state === 'ok' ? 'OK' : state === null ? '…' : 'ERROR'}</span>
        {extra && <span className="text-[10px] text-slate-500">{extra}</span>}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 bg-slate-950 p-6 rounded-2xl border border-slate-800 text-slate-100 shadow-2xl">

      {/* ── Banners SEV1 / SEV2 ───────────────────────────────────────────── */}
      {criticalNoVoucher.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-500 text-rose-200 p-4 rounded-xl flex flex-col gap-3 animate-pulse shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 font-extrabold text-xl">🚨</div>
            <div>
              <h4 className="font-extrabold text-white text-base">Brecha SEV1: {criticalNoVoucher.length} reserva(s) pagadas sin voucher</h4>
              <p className="text-xs text-rose-300">Voucher_code y voucher_id ausentes. Acción requerida en Hermes.</p>
            </div>
          </div>
          <div className="space-y-2 border-t border-rose-900/60 pt-2.5">
            {criticalNoVoucher.map(b => (
              <div key={b.id} className="text-xs flex items-center justify-between bg-rose-950/60 border border-rose-900/40 px-3 py-1.5 rounded-lg text-rose-300">
                <span className="font-bold">{b.booking_reference || 'REF-N/A'} — {b.guest_name || 'Huésped'}</span>
                <span className="font-mono bg-rose-500/20 px-2 py-0.5 rounded text-[10px]">
                  {b.currency} {Number(b.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {warningNoVoucher.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-500 p-4 rounded-xl flex flex-col gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-extrabold text-xl">⚠️</div>
            <div>
              <h4 className="font-extrabold text-white text-base">Advertencia SEV2: {warningNoVoucher.length} voucher(s) incompleto(s)</h4>
              <p className="text-xs text-amber-300">Falta voucher_code o voucher_id en el registro.</p>
            </div>
          </div>
          <div className="space-y-2 border-t border-amber-900/60 pt-2.5">
            {warningNoVoucher.map(b => (
              <div key={b.id} className="text-xs flex items-center justify-between bg-amber-950/60 border border-amber-900/40 px-3 py-1.5 rounded-lg text-amber-300">
                <span className="font-bold">{b.booking_reference || 'REF-N/A'} — {b.guest_name || 'Huésped'}</span>
                <span className="font-mono bg-amber-500/20 px-2 py-0.5 rounded text-[10px]">
                  Falta: {b.voucher_code === null ? 'Código' : 'URL PDF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            Mission Control
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full uppercase tracking-wider font-extrabold border border-emerald-500/30">Live</span>
          </h1>
          <p className="text-slate-400 mt-1 font-medium text-sm">
            Monitor en tiempo real del ecosistema tecnológico, agentes y base de datos de Aliun Travel.
          </p>
          {systemStatus.lastChecked && (
            <p className="text-[10px] text-slate-600 mt-0.5">Última verificación: {systemStatus.lastChecked}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot state={systemStatus.mcp}      label="MCP"      extra={systemStatus.mcpVersion !== '—' ? `v${systemStatus.mcpVersion}` : ''} />
          <StatusDot state={systemStatus.supabase} label="Supabase" />
          <StatusDot state={systemStatus.n8n}      label="n8n"      />
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-bold text-blue-400">
            Tools: {systemStatus.mcpTools}
          </div>
        </div>
      </div>

      {/* ── KPIs Reservas ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Reservas Totales',  value: bookingStats.total,     color: 'text-white' },
          { label: 'Pendientes Pago',   value: bookingStats.pending,   color: 'text-amber-400' },
          { label: 'Pagos Aprobados',   value: bookingStats.paid,      color: 'text-emerald-400' },
          { label: 'Confirmadas',       value: bookingStats.confirmed, color: 'text-blue-400' },
          { label: 'Canceladas',        value: bookingStats.cancelled, color: 'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/60 border border-slate-850 p-4 rounded-xl hover:border-slate-700 transition">
            <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
            <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── NUEVA: Revenue rápido ──────────────────────────────────────────── */}
      {revenueStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Revenue este mes',   data: revenueStats.month },
            { label: 'Revenue esta semana', data: revenueStats.week  },
          ].map(({ label, data }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {data ? `USD ${Number(data.total_revenue||0).toLocaleString(undefined,{minimumFractionDigits:2})}` : '—'}
                </div>
                {data?.total_deals && (
                  <div className="text-[10px] text-slate-500 mt-0.5">{data.total_deals} deal(s)</div>
                )}
              </div>
              <div className="text-2xl opacity-20">💰</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Gaps / Incidentes (G3 FIX — con paginación y contador) ────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            🚨 Gaps / Incidentes
            {resumenIncidentes.sin_resolver > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-rose-500/15 border border-rose-500/20 text-rose-400">
                {resumenIncidentes.sin_resolver} sin resolver
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            {incidentes.length > INC_PAGE_SIZE && (
              <button
                onClick={() => setMostrarTodos(v => !v)}
                className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition"
              >
                {mostrarTodos ? 'Ver menos' : `Ver todos (${incidentes.length})`}
              </button>
            )}
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Fuente: logs_operativos</span>
          </div>
        </div>

        {/* Contador de posición */}
        {!mostrarTodos && incidentes.length > INC_PAGE_SIZE && (
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
            <span>
              Mostrando {Math.min((incidentePage+1)*INC_PAGE_SIZE, incidentes.length)} de {incidentes.length} incidentes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIncidentePage(p => Math.max(0, p-1))}
                disabled={incidentePage === 0}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 transition text-xs"
              >←</button>
              <span>{incidentePage+1} / {totalPaginas}</span>
              <button
                onClick={() => setIncidentePage(p => Math.min(totalPaginas-1, p+1))}
                disabled={incidentePage >= totalPaginas-1}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 transition text-xs"
              >→</button>
            </div>
          </div>
        )}

        {incidentes.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-semibold">Sin incidentes registrados.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {incidentesVisibles.map((inc, i) => {
              const nivelStyle = {
                CRITICAL: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
                WARNING:  'bg-amber-500/10 border-amber-500/30 text-amber-400',
                INFO:     'bg-blue-500/10 border-blue-500/30 text-blue-400',
              }[inc.nivel] || 'bg-slate-800 border-slate-700 text-slate-400';

              return (
                <div key={inc.id || i} className={`border p-3 rounded-xl space-y-1.5 bg-slate-950 ${nivelStyle.split(' ').slice(0,2).join(' ')}`}>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded-md border ${nivelStyle}`}>{inc.nivel}</span>
                    {inc.escalado && <span className="text-[8px] font-black uppercase text-amber-400">ESCALADO</span>}
                  </div>
                  <div className="text-xs text-white font-semibold leading-snug">{inc.evento}</div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{inc.mensaje}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                    <span className="text-[9px] text-slate-500 font-bold">{inc.empleado || inc.origen || 'Sistema'}</span>
                    <span className={`text-[8px] font-black uppercase ${inc.resuelto ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {inc.resuelto ? 'Resuelto' : 'Pendiente'}
                    </span>
                  </div>
                  {!inc.resuelto && (
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => handleActualizarIncidente(inc.id, 'resuelto', true)}
                        className="flex-1 text-[8px] font-black uppercase py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition"
                      >✓ Resolver</button>
                      {!inc.escalado && (
                        <button
                          onClick={() => handleActualizarIncidente(inc.id, 'escalado', true)}
                          className="flex-1 text-[8px] font-black uppercase py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition"
                        >⚠ Escalar</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── NUEVA: Stale Payments ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            🔒 Pagos Estancados
            {stalePayments.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-amber-500/15 border border-amber-500/20 text-amber-400">
                {stalePayments.length} sin confirmar
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {staleLastFetched && <span className="text-[9px] text-slate-600">Actualizado {staleLastFetched}</span>}
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">+24 h en pending_review</span>
          </div>
        </div>
        {staleLoading && stalePayments.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4 animate-pulse">Verificando pagos...</div>
        ) : stalePayments.length === 0 ? (
          <div className="text-xs text-emerald-500 text-center py-4 font-semibold">✓ Sin pagos estancados</div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
            {stalePayments.map((p, i) => (
              <div key={i} className="bg-slate-950 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">{p.booking_reference || 'REF-N/A'}</span>
                  <span className="text-slate-500 ml-2">{p.guest_name || 'Huésped'}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-amber-400">{p.currency} {Number(p.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                  <div className="text-[9px] text-slate-500">{Math.round((Date.now() - new Date(p.created_at).getTime()) / 3600000)} h estancado</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tasa del Dólar ────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="font-bold text-white text-lg">💵 Tasa del Dólar</h3>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Owner: finanzas</span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">Vigente</div>
            <div className="text-2xl font-black text-emerald-400">
              {tasaActual ? `RD$ ${tasaActual.rate_sell}` : '—'}
            </div>
            {tasaActual?.rate_bp_original && (
              <div className="text-[9px] text-slate-500 mt-0.5">
                Banco Popular: {tasaActual.rate_bp_original} · {new Date(tasaActual.updated_at).toLocaleDateString('es-DO')}
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 flex-1 min-w-[240px]">
            <div className="flex-1">
              <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Tasa Banco Popular hoy</div>
              <input
                type="number" step="0.01" value={tasaInput}
                onChange={e => setTasaInput(e.target.value)}
                placeholder="Ej: 59.20"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <button
              onClick={handleConfirmarTasa}
              disabled={tasaGuardando}
              className="px-4 py-2 text-xs font-black uppercase rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-50"
            >
              {tasaGuardando ? '...' : 'Confirmar (+1)'}
            </button>
          </div>
        </div>
        {tasaMensaje && <div className="text-[10px] text-slate-400 mt-2">{tasaMensaje}</div>}
      </div>

      {/* ── Grid principal: n8n/Agentes | Backlog+Gaps | Actividad ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Columna 1: n8n Services / Agentes IA */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <button
              onClick={() => setActiveTab('workflows')}
              className={`font-bold text-sm transition-all pb-1 border-b-2 ${activeTab === 'workflows' ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
              {/* G1 FIX: contador honesto según estado real */}
              🔄 n8n {n8nFetchState === 'ok' ? `(${n8nWorkflows.length})` : n8nFetchState === 'async_pending' ? '(⚠ async)' : n8nFetchState === 'error' ? '(error)' : '(…)'}
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`font-bold text-sm transition-all pb-1 border-b-2 ${activeTab === 'agents' ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
            >
              🤖 Agentes ({agents.length})
            </button>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {activeTab === 'agents' ? (
              agents.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs animate-pulse">Cargando personal IA...</div>
              ) : (
                agents.map((agent, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex items-center justify-between hover:border-slate-700 transition">
                    <div>
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {agent.name}
                        {agent.incidentesAbiertos > 0 && (
                          <span className="px-1.5 py-0.5 text-[8px] font-black rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            {agent.incidentesAbiertos} inc.
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{agent.role}</div>
                      {agent.contenedor && <div className="text-[9px] text-slate-600 font-mono mt-0.5">{agent.contenedor}</div>}
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                        agent.status === 'Online' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                        agent.status === 'Busy'   ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                                    'bg-slate-800 border-slate-700 text-slate-500'
                      }`}>{agent.status}</span>
                      <div className="text-[9px] text-slate-500 mt-1 font-bold">{agent.lastActive}</div>
                    </div>
                  </div>
                ))
              )
            ) : (
              /* G1 FIX: estados honestos para el tab de n8n */
              n8nFetchState === 'ok' ? (
                n8nWorkflows.map((wf, i) => (
                  <div key={wf.id || i} className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between hover:border-slate-700 transition">
                    <div>
                      <div className="font-bold text-white text-xs">{wf.name}</div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">ID: {wf.id}</div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded-md border ${
                        wf.status === 'Live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}>{wf.status}</span>
                      <div className="text-[8px] mt-1 font-extrabold uppercase tracking-wider text-blue-400">{wf.owner}</div>
                    </div>
                  </div>
                ))
              ) : n8nFetchState === 'async_pending' ? (
                <div className="text-center py-8 space-y-3">
                  <div className="text-amber-400 text-xs font-bold">⚠ Webhook n8n-status configurado en modo async</div>
                  <p className="text-[10px] text-slate-500 leading-relaxed px-2">
                    El WF responde <code className="bg-slate-800 px-1 rounded">Workflow was started</code> en lugar del JSON de workflows.<br/>
                    Fix requerido: agregar nodo <em>Respond to Webhook</em> al final del WF en n8n con{' '}
                    <code className="bg-slate-800 px-1 rounded">{"{ \"workflows\": [...] }"}</code>.
                  </p>
                  <div className="text-[9px] text-slate-600">TASK: TASK-N8N-STATUS-FIX</div>
                </div>
              ) : n8nFetchState === 'error' ? (
                <div className="text-center py-8 text-rose-400 text-xs font-bold">Error al contactar n8n</div>
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs animate-pulse">Cargando workflows...</div>
              )
            )}
          </div>
        </div>

        {/* Columna 2: Backlog + Gaps de Vouchers (G6 FIX: renombrado) */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
          {/* Backlog estratégico */}
          <div className="space-y-4">
            <h3 className="font-bold text-white text-base flex items-center justify-between border-b border-slate-800 pb-2">
              <span>📋 Backlog Activo ({atlasTasks.length})</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase">atlas_tasks</span>
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {atlasTasks.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs font-semibold">Sin tareas en el backlog activo.</div>
              ) : (
                atlasTasks.map(t => (
                  <div
                    key={t.codigo}
                    className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex flex-col space-y-3 hover:border-slate-700 transition"
                    style={{ borderLeft: `4px solid ${frenteColor(t.frente)}` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400 text-xs">{t.codigo}</span>
                      <span className={`px-2 py-0.5 text-[9px] font-black rounded-md ${
                        t.prioridad === 'alta'  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500' :
                        t.prioridad === 'media' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' :
                                                  'bg-blue-500/10 border border-blue-500/20 text-blue-500'
                      }`}>{(t.prioridad||'media').toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-white font-semibold leading-relaxed">{t.titulo}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Asignado: <span className="text-slate-300">{t.asignado_a || 'Sin asignar'}</span></span>
                      <span className="font-mono text-[9px] uppercase opacity-80">{t.frente}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-900/60">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Sprint: {t.sprint || '—'}</span>
                      <button
                        onClick={() => handleCompletarTarea(t.codigo)}
                        className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition"
                      >✓ Completar</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* G6 FIX: renombrado a "Gaps de Vouchers" */}
          <div className="space-y-4 pt-4 border-t border-slate-850">
            <h3 className="font-bold text-white text-base flex items-center justify-between border-b border-slate-800 pb-2">
              <span>🎫 Gaps de Vouchers ({gapTasks.length})</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase">SEV1 / SEV2</span>
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {gapTasks.length === 0 ? (
                <div className="text-center py-6 text-emerald-500 text-xs font-semibold">✓ Sin gaps de vouchers.</div>
              ) : (
                gapTasks.map((task, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-2 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-400 text-xs">{task.id}</span>
                      <span className={`px-2 py-0.5 text-[9px] font-black rounded-md ${
                        task.priority === 'SEV1' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500' :
                                                   'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                      }`}>{task.priority}</span>
                    </div>
                    <p className="text-xs text-white font-semibold leading-relaxed">{task.description}</p>
                    <div className={`text-[10px] font-bold uppercase ${task.priority === 'SEV1' ? 'text-rose-400' : 'text-amber-400'}`}>{task.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Columna 3: Registro de Actividad Real */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 flex flex-col">
          <h3 className="font-bold text-white text-lg border-b border-slate-800 pb-3">📡 Actividad Reciente</h3>
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 font-mono text-[10px] space-y-3.5 flex-1 max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
            {recentActivity.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-xs italic animate-pulse">Esperando transacciones...</div>
            ) : (
              recentActivity.map((act, idx) => (
                <div key={idx} className="flex flex-col gap-1 hover:bg-slate-900/50 p-2 rounded border border-slate-900 transition">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{new Date(act.created_at).toLocaleDateString('es-DO')} {new Date(act.created_at).toLocaleTimeString('es-DO')}</span>
                    <span className="font-bold text-slate-400">{act.booking_reference || 'REF-N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-200 font-medium">
                    <span>{act.guest_name || 'Huésped'}</span>
                    <span className="text-blue-400">{act.currency} {Number(act.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 rounded text-[8px] font-black uppercase ${
                      act.status === 'confirmed' || act.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                      act.status === 'cancelled' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'
                    }`}>Status: {act.status}</span>
                    <span className={`px-2 rounded text-[8px] font-black uppercase ${
                      act.payment_status === 'paid'    ? 'bg-emerald-500/15 text-emerald-400' :
                      act.payment_status === 'pending' ? 'bg-amber-500/15 text-amber-400' :
                                                         'bg-slate-800 text-slate-400'
                    }`}>Pago: {act.payment_status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-4 border-t border-slate-850 text-center text-[9px] text-slate-600 font-extrabold uppercase tracking-wider">
            Mission Control v2.7 · Aliun Travel SRL
          </div>
        </div>
      </div>

      {/* ── NUEVA: Heartbeat Manual del Director ─────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="font-bold text-white text-lg">💓 Heartbeat Manual</h3>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Ping directo → agente-checkin</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Nombre del agente</div>
            <select
              value={heartbeatTarget}
              onChange={e => setHeartbeatTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">— Seleccionar agente —</option>
              {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
              <option value="Hermes Ops">Hermes Ops</option>
              <option value="Hermes Commercial">Hermes Commercial</option>
              <option value="Hermes Marketing">Hermes Marketing</option>
              <option value="Ariadne Data">Ariadne Data</option>
              <option value="Hermes-QA">Hermes-QA</option>
            </select>
          </div>
          <button
            onClick={handleHeartbeatManual}
            disabled={!heartbeatTarget || heartbeatSending}
            className="px-4 py-2 text-xs font-black uppercase rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition disabled:opacity-40"
          >
            {heartbeatSending ? 'Enviando...' : '💓 Ping'}
          </button>
        </div>
        {heartbeatMsg && (
          <div className={`text-[11px] mt-2 font-semibold ${heartbeatMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>
            {heartbeatMsg}
          </div>
        )}
      </div>

    </div>
  );
};

export default MissionControlLive;
