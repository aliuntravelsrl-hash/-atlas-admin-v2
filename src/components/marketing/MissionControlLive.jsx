import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AtlasExecutionPulse from './AtlasExecutionPulse';
import DependencyIntelligence from './mission-control/DependencyIntelligence';
import { interpretOVRContract } from '../../utils/ovrInterpreter';

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

const renderMoney = (item) => {
  if (!item) return '0.00';
  const currency = item.currency || 'USD';
  const amount = parseFloat(item.total_amount || 0);
  const amountDop = parseFloat(item.total_amount_dop || 0);

  if (currency === 'DOP') {
    if (amountDop > 0) {
      return `RD$ ${Number(amountDop).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    if (amount < 2000) {
      return `RD$ ${Number(amount * 60).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    return `RD$ ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
  return `$ ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
};

// AbortSignal.timeout no existe en Safari < 16 / Chrome < 105
// Usar un wrapper seguro
const fetchWithTimeout = (url, opts = {}, ms = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// Fechas para RPCs de Ariadne
const isoToday = () => new Date().toISOString().split('T')[0];
const isoStartOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};
const isoStartOfWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
};

// ─── Sub-componentes (fuera del componente padre para evitar re-montajes) ───

const StatusDot = ({ state, label, extra }) => {
  const color = state === 'ok'  ? 'bg-emerald-500' :
                state === null  ? 'bg-slate-600 animate-pulse' :
                'bg-rose-500';
  const text  = state === 'ok'  ? 'text-emerald-400' :
                state === null  ? 'text-slate-500' :
                'text-rose-400';
  return (
    <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className={text}>{label}: {state === 'ok' ? 'OK' : state === null ? '…' : 'ERROR'}</span>
      {extra && <span className="text-[10px] text-slate-500">{extra}</span>}
    </div>
  );
};

// ─── Constantes ─────────────────────────────────────────────────────────────

const N8N_HEALTH_URL = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/mcp-health';
const N8N_STATUS_URL = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/n8n-status';
const CHECKIN_URL    = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/agente-checkin';
const POLL_FAST  = 30_000;
const POLL_MED   = 60_000;
const POLL_SLOW  = 300_000;
const INC_PAGE_SIZE = 6;

// ─── Componente principal ────────────────────────────────────────────────────

export const MissionControlLive = () => {

  const [activeTab, setActiveTab] = useState('workflows');

  const [systemStatus, setSystemStatus] = useState({
    mcp: null, n8n: null, supabase: null,
    mcpVersion: '—', mcpTools: 0, lastChecked: null,
  });

  const [agents,        setAgents]        = useState([]);
  const [n8nWorkflows,  setN8nWorkflows]  = useState([]);
  const [n8nFetchState, setN8nFetchState] = useState('idle');

  const [bookingStats,       setBookingStats]       = useState({ total:0, paid:0, pending:0, confirmed:0, cancelled:0 });
  const [criticalNoVoucher,  setCriticalNoVoucher]  = useState([]);
  const [warningNoVoucher,   setWarningNoVoucher]   = useState([]);
  const [recentActivity,     setRecentActivity]     = useState([]);
  const [actividadSistema,   setActividadSistema]   = useState([]);
  const [actividadTab,       setActividadTab]       = useState('operarios'); // operarios | sistema

  const [incidentes,         setIncidentes]         = useState([]);
  const [resumenIncidentes,  setResumenIncidentes]  = useState({ sin_resolver: 0 });
  const [incidentePage,      setIncidentePage]      = useState(0);
  const [mostrarTodos,       setMostrarTodos]       = useState(false);

  const [atlasTasks, setAtlasTasks] = useState([]);
  const [gapTasks,   setGapTasks]   = useState([]);

  // ── Mesa de Tareas: filtro + modal ─────────────────────────────────────
  const [taskFilter,      setTaskFilter]      = useState('all'); // all | swarm | antigravity | computer
  const [taskStatusFilter, setTaskStatusFilter] = useState('all'); // all | en_progreso | estancada | bloqueada | pendiente | completado
  const [showNewTask,     setShowNewTask]     = useState(false);
  const [newTask,         setNewTask]         = useState({
    titulo: '', descripcion: '', tipo: 'proyecto',
    asignado_tipo: 'computer', asignado_a: 'Computer',
    prioridad: 'media', frente: 'F2-BACKEND-CORE', sprint: '',
  });
  const [newTaskSaving,   setNewTaskSaving]   = useState(false);
  const [newTaskMsg,      setNewTaskMsg]      = useState('');

  const [tasaActual,    setTasaActual]    = useState(null);
  const [tasaInput,     setTasaInput]     = useState('');
  const [tasaGuardando, setTasaGuardando] = useState(false);
  const [tasaMensaje,   setTasaMensaje]   = useState('');

  // NUEVA: Stale payments
  const [stalePayments,    setStalePayments]    = useState([]);
  const [staleLastFetched, setStaleLastFetched] = useState(null);

  // OVR Contract Expanded States
  const [expandedOvrTasks, setExpandedOvrTasks] = useState({});

  // NUEVA: Revenue rápido
  const [revenueStats, setRevenueStats] = useState(null);

  // NUEVA: Heartbeat manual
  const [heartbeatTarget,  setHeartbeatTarget]  = useState('');
  const [heartbeatSending, setHeartbeatSending] = useState(false);
  const [heartbeatMsg,     setHeartbeatMsg]     = useState('');

  // ── POLLING 1 — Health del sistema ──────────────────────────────────────
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res  = await fetchWithTimeout(N8N_HEALTH_URL, {}, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSystemStatus({
          mcp:        data.status === 'ok'                                    ? 'ok' : 'error',
          supabase:   (data.supabase === 'ok' || data.supabase === 'connected') ? 'ok' : 'error',
          n8n:        'ok', // si el webhook de n8n responde, n8n está vivo
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

  // ── POLLING 2 — Personal IA + Incidentes ────────────────────────────────
  useEffect(() => {
    const fetchPersonal = async () => {
      try {
        const { data, error } = await supabase.rpc('rpc_personal_ia_status');
        if (error) throw error;
        const personal = data?.personal || [];
        setAgents(personal.map(p => ({
          name:               p.nombre_agente,
          role:               p.rol + (p.departamento ? ` · ${p.departamento}` : ''),
          status:             ({ online:'Online', idle:'Busy', error:'Offline', offline:'Offline' })[p.estado] || 'Offline',
          lastActive:         relativeTime(p.ultimo_heartbeat),
          incidentesAbiertos: p.incidentes_abiertos || 0,
          contenedor:         p.contenedor || null,
          tareaActual:        p.tarea_actual || null,
        })));
        setIncidentes(data?.incidentes_recientes || []);
        setResumenIncidentes({ sin_resolver: data?.resumen?.incidentes_sin_resolver || 0 });
        setIncidentePage(0);
      } catch (err) {
        console.error('rpc_personal_ia_status:', err);
      }
    };
    fetchPersonal();
    const t = setInterval(fetchPersonal, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ── POLLING 3 — n8n Workflows (G1 FIX) ──────────────────────────────────
  useEffect(() => {
    const fetchWorkflows = async () => {
      setN8nFetchState('loading');
      try {
        const res  = await fetchWithTimeout(N8N_STATUS_URL, {}, 12000);
        const data = await res.json();
        if (Array.isArray(data?.workflows) && data.workflows.length > 0) {
          setN8nWorkflows(data.workflows);
          setN8nFetchState('ok');
        } else if (data?.message === 'Workflow was started') {
          setN8nWorkflows([]);
          setN8nFetchState('async_pending');
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

  // ── POLLING 4 — Tasa del dólar ───────────────────────────────────────────
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

  // ── POLLING 5 — KPIs reservas + gaps + actividad + atlas_tasks ───────────
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const [r1, r2, r3, r4, r5] = await Promise.all([
          supabase.from('bookings').select('*', { count:'exact', head:true }),
          supabase.from('bookings').select('*', { count:'exact', head:true }).eq('payment_status','paid'),
          supabase.from('bookings').select('*', { count:'exact', head:true }).eq('payment_status','pending'),
          supabase.from('bookings').select('*', { count:'exact', head:true }).eq('status','confirmed'),
          supabase.from('bookings').select('*', { count:'exact', head:true }).eq('status','cancelled'),
        ]);
        setBookingStats({
          total:     r1.count || 0,
          paid:      r2.count || 0,
          pending:   r3.count || 0,
          confirmed: r4.count || 0,
          cancelled: r5.count || 0,
        });

        const { data: gapBookings } = await supabase
          .from('bookings')
          .select('id, booking_reference, total_amount, total_amount_dop, currency, created_at, lead_guest_name, voucher_code, voucher_id')
          .eq('payment_status', 'paid')
          .or('voucher_code.is.null,voucher_id.is.null');

        const gaps = gapBookings || [];
        const criticalList = gaps.filter(b => b.voucher_code === null && b.voucher_id === null);
        const warningList  = gaps.filter(b => (b.voucher_code === null) !== (b.voucher_id === null));
        setCriticalNoVoucher(criticalList);
        setWarningNoVoucher(warningList);
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

        // Feed OPERARIOS — bookings por updated_at (cambios de estado reales)
        const { data: recent } = await supabase
          .from('bookings')
          .select('booking_reference, lead_guest_name, status, payment_status, created_at, updated_at, total_amount, total_amount_dop, currency, booking_type, fulfillment_status')
          .order('updated_at', { ascending: false })
          .limit(15);
        setRecentActivity(recent || []);

        // Feed SISTEMA — logs resueltos + tareas completadas < 48h
        const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const [rLogs, rTasks] = await Promise.all([
          supabase.from('logs_operativos')
            .select('id, nivel, evento, mensaje, resuelto, escalado, origen, created_at')
            .gte('created_at', cutoff48h)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase.from('atlas_tasks')
            .select('codigo, titulo, tipo, asignado_tipo, asignado_a, fecha_completado')
            .eq('estado', 'completado')
            .gte('fecha_completado', cutoff48h)
            .order('fecha_completado', { ascending: false })
            .limit(10),
        ]);
        // Unificar en un solo feed ordenado por timestamp
        const sysLogs = (rLogs.data || []).map(l => ({
          _ts: l.created_at, _tipo: 'log', ...l
        }));
        const sysTasks = (rTasks.data || []).map(t => ({
          _ts: t.fecha_completado, _tipo: 'tarea', ...t
        }));
        const unified = [...sysLogs, ...sysTasks]
          .sort((a, b) => new Date(b._ts) - new Date(a._ts))
          .slice(0, 30);
        setActividadSistema(unified);

        const { data: fetchedTasks } = await supabase
          .from('atlas_tasks')
          .select('codigo, titulo, descripcion, asignado_a, asignado_tipo, prioridad, estado, tipo, frente, sprint, bloqueado, bloqueo_razon, updated_at, ejecutor, responsable_arquitectura, depende_de, cerrado_por, evidencia_url, autorizado_por, encargado_por, notas, resultado, workflow_id, resultado_estructurado')
          .not('estado', 'eq', 'archivado')
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

  // ── POLLING 6 — NUEVA: Stale payments ──────────────────────────────────
  useEffect(() => {
    const fetchStale = async () => {
      try {
        const { data, error } = await supabase.rpc('stale_payments', { p_hours: 24 });
        if (!error) {
          setStalePayments(Array.isArray(data) ? data : []);
          setStaleLastFetched(new Date().toLocaleTimeString('es-DO'));
        }
      } catch (err) {
        console.error('stale_payments:', err);
      }
    };
    fetchStale();
    const t = setInterval(fetchStale, POLL_MED);
    return () => clearInterval(t);
  }, []);

  // ── POLLING 7 — NUEVA: Revenue rápido (parámetros correctos del RPC) ───
  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const today     = isoToday();
        const startMonth = isoStartOfMonth();
        const startWeek  = isoStartOfWeek();
        const [rMes, rSem] = await Promise.all([
          supabase.rpc('revenue_by_period', { p_from_date: startMonth, p_to_date: today }),
          supabase.rpc('revenue_by_period', { p_from_date: startWeek,  p_to_date: today }),
        ]);
        if (!rMes.error && !rSem.error) {
          setRevenueStats({
            month: rMes.data?.[0] || null,
            week:  rSem.data?.[0] || null,
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

  // ── Acciones ────────────────────────────────────────────────────────────

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
        p_rate_bp: valor, p_confirmado_por_nombre: 'finanzas', p_confirmado_via: 'mission_control',
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

  const handleCrearTarea = async () => {
    if (!newTask.titulo.trim()) { setNewTaskMsg('El título es requerido'); return; }
    setNewTaskSaving(true);
    setNewTaskMsg('');
    try {
      const { error } = await supabase.rpc('rpc_crear_tarea', {
        p_titulo:             newTask.titulo.trim(),
        p_descripcion:        newTask.descripcion.trim() || null,
        p_tipo:               newTask.tipo,
        p_asignado_tipo:      newTask.asignado_tipo,
        p_asignado_a:         newTask.asignado_a.trim() || null,
        p_prioridad:          newTask.prioridad,
        p_frente:             newTask.frente || null,
        p_sprint:             newTask.sprint.trim() || null,
        p_bloqueado:          false,
        p_bloqueo_razon:      null,
        p_origen_incidente_id: null,
      });
      if (error) throw error;
      // Refrescar lista
      const { data: fetchedTasks } = await supabase
        .from('atlas_tasks')
        .select('codigo, titulo, descripcion, asignado_a, asignado_tipo, prioridad, estado, tipo, frente, sprint, bloqueado, bloqueo_razon, updated_at, ejecutor, responsable_arquitectura, depende_de, cerrado_por, evidencia_url, autorizado_por, encargado_por, notas, resultado, workflow_id, resultado_estructurado')
        .not('estado', 'in', '("completado","archivado")')
        .order('fecha_encargo', { ascending: false });
      setAtlasTasks(fetchedTasks || []);
      setNewTask({ titulo: '', descripcion: '', tipo: 'proyecto', asignado_tipo: 'computer', asignado_a: 'Computer', prioridad: 'media', frente: 'F2-BACKEND-CORE', sprint: '' });
      setShowNewTask(false);
      setNewTaskMsg('');
    } catch (err) {
      setNewTaskMsg('Error al crear tarea: ' + err.message);
      console.error('rpc_crear_tarea:', err);
    } finally {
      setNewTaskSaving(false);
    }
  };

  const handleHeartbeatManual = async () => {
    if (!heartbeatTarget) return;
    setHeartbeatSending(true);
    setHeartbeatMsg('');
    try {
      const res = await fetchWithTimeout(CHECKIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'heartbeat', nombre_agente: heartbeatTarget,
          tarea_actual: 'ping_manual_director', timestamp: new Date().toISOString(),
        }),
      }, 10000);
      const data = await res.json();
      setHeartbeatMsg(data.success !== false
        ? `✓ Heartbeat registrado para ${heartbeatTarget}`
        : `⚠ ${data.error || 'Sin respuesta'}`);
    } catch {
      setHeartbeatMsg('⚠ No se pudo alcanzar el webhook');
    } finally {
      setHeartbeatSending(false);
    }
  };

  // ── Incidentes paginados ────────────────────────────────────────────────
  const incidentesVisibles = mostrarTodos
    ? incidentes
    : incidentes.slice(incidentePage * INC_PAGE_SIZE, (incidentePage + 1) * INC_PAGE_SIZE);
  const totalPaginas = Math.ceil(incidentes.length / INC_PAGE_SIZE);

  const getFilteredTasksCount = () => {
    const H24 = 24 * 60 * 60 * 1000;
    const isStuck = (t) => t.estado === 'en_progreso' && (Date.now() - new Date(t.updated_at).getTime()) >= H24;
    const isActive = (t) => t.estado === 'en_progreso' && (Date.now() - new Date(t.updated_at).getTime()) < H24;
    return atlasTasks.filter(t => {
      const matchesRecipient = taskFilter === 'all' || t.asignado_tipo === taskFilter || (taskFilter === 'computer' && !t.asignado_tipo);
      let matchesStatus = true;
      if (taskStatusFilter === 'en_progreso') matchesStatus = isActive(t);
      else if (taskStatusFilter === 'estancada') matchesStatus = isStuck(t);
      else if (taskStatusFilter === 'bloqueada') matchesStatus = t.estado === 'bloqueada';
      else if (taskStatusFilter === 'pendiente') matchesStatus = t.estado === 'pendiente';
      else if (taskStatusFilter === 'completado') matchesStatus = t.estado === 'completado';
      return matchesRecipient && matchesStatus;
    }).length;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 bg-slate-950 p-6 rounded-2xl border border-slate-800 text-slate-100 shadow-2xl">

      {/* ── Banners SEV1 / SEV2 ─────────────────────────────────────────── */}
      {criticalNoVoucher.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-500 p-4 rounded-xl flex flex-col gap-3 animate-pulse shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 font-extrabold text-xl">🚨</div>
            <div>
              <h4 className="font-extrabold text-white text-base">Brecha SEV1: {criticalNoVoucher.length} reserva(s) pagadas sin voucher</h4>
              <p className="text-xs text-rose-300">voucher_code y voucher_id ausentes. Acción requerida en Hermes.</p>
            </div>
          </div>
          <div className="space-y-2 border-t border-rose-900/60 pt-2.5">
            {criticalNoVoucher.map(b => (
              <div key={b.id} className="text-xs flex items-center justify-between bg-rose-950/60 border border-rose-900/40 px-3 py-1.5 rounded-lg text-rose-300">
                <span className="font-bold">{b.booking_reference || 'REF-N/A'} — {b.lead_guest_name || 'Huésped'}</span>
                <span className="font-mono bg-rose-500/20 px-2 py-0.5 rounded text-[10px]">
                  {renderMoney(b)}
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
                <span className="font-bold">{b.booking_reference || 'REF-N/A'} — {b.lead_guest_name || 'Huésped'}</span>
                <span className="font-mono bg-amber-500/20 px-2 py-0.5 rounded text-[10px]">
                  Falta: {b.voucher_code === null ? 'Código' : 'URL PDF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            Mission Control
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full uppercase tracking-wider font-extrabold border border-emerald-500/30">Live</span>
          </h1>
          <p className="text-slate-400 mt-1 font-medium text-sm">Monitor en tiempo real del ecosistema tecnológico, agentes y base de datos de Aliun Travel.</p>
          {systemStatus.lastChecked && (
            <p className="text-[10px] text-slate-600 mt-0.5">Última verificación: {systemStatus.lastChecked}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot state={systemStatus.mcp}      label="MCP"      extra={systemStatus.mcpVersion !== '—' ? `v${systemStatus.mcpVersion}` : ''} />
          <StatusDot state={systemStatus.supabase} label="Supabase" />
          <StatusDot state={systemStatus.n8n}      label="n8n" />
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-bold text-blue-400">
            Tools: {systemStatus.mcpTools}
          </div>
        </div>
      </div>

      {/* ── KPIs Reservas ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label:'Reservas Totales', value:bookingStats.total,     color:'text-white'     },
          { label:'Pendientes Pago',  value:bookingStats.pending,   color:'text-amber-400' },
          { label:'Pagos Aprobados',  value:bookingStats.paid,      color:'text-emerald-400' },
          { label:'Confirmadas',      value:bookingStats.confirmed, color:'text-blue-400'  },
          { label:'Canceladas',       value:bookingStats.cancelled, color:'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900/60 border border-slate-850 p-4 rounded-xl hover:border-slate-700 transition">
            <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
            <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── NUEVA: Revenue rápido ────────────────────────────────────────── */}
      {revenueStats && (revenueStats.month || revenueStats.week) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label:'Revenue este mes',    data:revenueStats.month },
            { label:'Revenue esta semana', data:revenueStats.week  },
          ].map(({ label, data }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">{label}</div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {data ? `USD ${Number(data.total_revenue||0).toLocaleString(undefined,{minimumFractionDigits:2})}` : '—'}
                </div>
                {data && data.total_deals && (
                  <div className="text-[10px] text-slate-500 mt-0.5">{data.total_deals} deal(s)</div>
                )}
              </div>
              <div className="text-2xl opacity-20">💰</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Gaps / Incidentes (G3 FIX) ──────────────────────────────────── */}
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

        {!mostrarTodos && incidentes.length > INC_PAGE_SIZE && (
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
            <span>Mostrando {Math.min((incidentePage+1)*INC_PAGE_SIZE, incidentes.length)} de {incidentes.length}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setIncidentePage(p => Math.max(0, p-1))} disabled={incidentePage === 0}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 transition text-xs">←</button>
              <span>{incidentePage+1} / {totalPaginas}</span>
              <button onClick={() => setIncidentePage(p => Math.min(totalPaginas-1, p+1))} disabled={incidentePage >= totalPaginas-1}
                className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-30 transition text-xs">→</button>
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
              const borderClass = nivelStyle.split(' ').slice(0,2).join(' ');
              return (
                <div key={inc.id || i} className={`border p-3 rounded-xl space-y-1.5 bg-slate-950 ${borderClass}`}>
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
                      <button onClick={() => handleActualizarIncidente(inc.id, 'resuelto', true)}
                        className="flex-1 text-[8px] font-black uppercase py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition">
                        ✓ Resolver</button>
                      {!inc.escalado && (
                        <button onClick={() => handleActualizarIncidente(inc.id, 'escalado', true)}
                          className="flex-1 text-[8px] font-black uppercase py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition">
                          ⚠ Escalar</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── NUEVA: Stale Payments ────────────────────────────────────────── */}
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
            <span className="text-[9px] text-slate-500 font-bold uppercase">+24 h en pending_review</span>
          </div>
        </div>
        {stalePayments.length === 0 ? (
          <div className="text-xs text-emerald-500 text-center py-4 font-semibold">✓ Sin pagos estancados</div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {stalePayments.map((p, i) => (
              <div key={i} className="bg-slate-950 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white">{p.booking_reference || 'REF-N/A'}</span>
                  <span className="text-slate-500 ml-2">{p.lead_guest_name || p.booking_reference || 'Huésped'}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-amber-400">{renderMoney(p)}</div>
                  <div className="text-[9px] text-slate-500">{Math.round((Date.now() - new Date(p.created_at).getTime()) / 3600000)} h estancado</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tasa del Dólar ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="font-bold text-white text-lg">💵 Tasa del Dólar</h3>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Owner: finanzas</span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">Vigente</div>
            <div className="text-2xl font-black text-emerald-400">{tasaActual ? `RD$ ${tasaActual.rate_sell}` : '—'}</div>
            {tasaActual?.rate_bp_original && (
              <div className="text-[9px] text-slate-500 mt-0.5">Banco Popular: {tasaActual.rate_bp_original} · {new Date(tasaActual.updated_at).toLocaleDateString('es-DO')}</div>
            )}
          </div>
          <div className="flex items-end gap-2 flex-1 min-w-[240px]">
            <div className="flex-1">
              <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Tasa Banco Popular hoy</div>
              <input type="number" step="0.01" value={tasaInput} onChange={e => setTasaInput(e.target.value)} placeholder="Ej: 59.20"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50" />
            </div>
            <button onClick={handleConfirmarTasa} disabled={tasaGuardando}
              className="px-4 py-2 text-xs font-black uppercase rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition disabled:opacity-50">
              {tasaGuardando ? '...' : 'Confirmar (+1)'}
            </button>
          </div>
        </div>
        {tasaMensaje && <div className="text-[10px] text-slate-400 mt-2">{tasaMensaje}</div>}
      </div>

      {/* ── Atlas Execution Pulse ─────────────────────────────────────── */}
      <AtlasExecutionPulse atlasTasks={atlasTasks} />

      {/* ── Dependency Intelligence ───────────────────────────────── */}
      <DependencyIntelligence />

      {/* ── Grid principal ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Columna 1: n8n / Agentes IA */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <button onClick={() => setActiveTab('workflows')}
              className={`font-bold text-sm transition-all pb-1 border-b-2 ${activeTab === 'workflows' ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              🔄 n8n {n8nFetchState === 'ok' ? `(${n8nWorkflows.length})` : n8nFetchState === 'async_pending' ? '(⚠)' : n8nFetchState === 'error' ? '(err)' : '(…)'}
            </button>
            <button onClick={() => setActiveTab('agents')}
              className={`font-bold text-sm transition-all pb-1 border-b-2 ${activeTab === 'agents' ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              🤖 Agentes ({agents.length})
            </button>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {activeTab === 'agents' ? (
              agents.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs animate-pulse">Cargando personal IA...</div>
              ) : (
                agents.map((agent, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex flex-col space-y-2 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          {agent.name}
                          {agent.incidentesAbiertos > 0 && (
                            <span className="px-1.5 py-0.5 text-[8px] font-black rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">{agent.incidentesAbiertos} inc.</span>
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
                    {agent.tareaActual && (
                      <div className="bg-slate-900/60 border border-slate-850/65 p-2 rounded-lg">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Tarea Activa</span>
                        <span className="text-[10px] text-blue-300 font-mono block mt-0.5 truncate" title={agent.tareaActual}>
                          ⚡ {agent.tareaActual}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )
            ) : (
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
                      <div className="text-[8px] mt-1 font-extrabold uppercase text-blue-400">{wf.owner}</div>
                    </div>
                  </div>
                ))
              ) : n8nFetchState === 'async_pending' ? (
                <div className="text-center py-8 space-y-3 px-2">
                  <div className="text-amber-400 text-xs font-bold">⚠ Webhook n8n-status en modo async</div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Devuelve <code className="bg-slate-800 px-1 rounded">Workflow was started</code>. Fix: agregar nodo <em>Respond to Webhook</em> al final del WF.
                  </p>
                  <div className="text-[9px] text-slate-600 font-mono">TASK-N8N-STATUS-FIX</div>
                </div>
              ) : n8nFetchState === 'error' ? (
                <div className="text-center py-8 text-rose-400 text-xs font-bold">Error al contactar n8n</div>
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs animate-pulse">Cargando workflows...</div>
              )
            )}
          </div>
        </div>

        {/* Columna 2: Mesa de Tareas */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">

          {/* Header Mesa de Tareas */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              📋 Mesa de Tareas
              <span className="px-2 py-0.5 text-[9px] font-black rounded-md bg-slate-800 border border-slate-700 text-slate-400">
                {getFilteredTasksCount()}
              </span>
            </h3>
            <button
              onClick={() => { setShowNewTask(v => !v); setNewTaskMsg(''); }}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition">
              {showNewTask ? '✕ Cancelar' : '+ Nueva Tarea'}
            </button>
          </div>

          {/* Filtros por destinatario y estado */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all',         label: 'Todas',       color: 'text-slate-300 border-slate-600' },
                { key: 'computer',    label: '🖥 Computer',  color: 'text-blue-400 border-blue-500/40' },
                { key: 'swarm',       label: '🤖 Swarm',     color: 'text-violet-400 border-violet-500/40' },
                { key: 'antigravity', label: '👤 Director',  color: 'text-amber-400 border-amber-500/40' },
              ].map(f => (
                <button key={f.key}
                  onClick={() => setTaskFilter(f.key)}
                  className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border transition ${
                    taskFilter === f.key
                      ? `bg-slate-700 ${f.color}`
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Filtros por estado de ejecución */}
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-850/50">
              {[
                { key: 'all',         label: 'Cualquier Estado',  color: 'text-slate-300 border-slate-600' },
                { key: 'en_progreso', label: '🟢 Activas',       color: 'text-emerald-400 border-emerald-500/40' },
                { key: 'estancada',   label: '🟡 Estancadas',    color: 'text-amber-400 border-amber-500/40' },
                { key: 'bloqueada',   label: '🔴 Bloqueadas',    color: 'text-rose-400 border-rose-500/40' },
                { key: 'pendiente',   label: '🔲 Pendientes',    color: 'text-slate-400 border-slate-600' },
                { key: 'completado',  label: '✓ Hechas',         color: 'text-blue-400 border-blue-500/40' },
              ].map(f => (
                <button key={f.key}
                  onClick={() => setTaskStatusFilter(f.key)}
                  className={`text-[9px] font-bold px-2 py-0.5 rounded border transition ${
                    taskStatusFilter === f.key
                      ? `bg-slate-800 ${f.color}`
                      : 'bg-slate-950 border-slate-850 text-slate-500 hover:border-slate-750'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Nueva Tarea (inline collapsible) */}
          {showNewTask && (
            <div className="bg-slate-950 border border-blue-500/20 rounded-xl p-4 space-y-3">
              <div className="text-[10px] font-black uppercase text-blue-400 mb-1">Nueva Tarea</div>

              <input
                type="text"
                value={newTask.titulo}
                onChange={e => setNewTask(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Título de la tarea *"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500/50 placeholder:text-slate-600"
              />
              <textarea
                value={newTask.descripcion}
                onChange={e => setNewTask(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Descripción (opcional)"
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500/50 placeholder:text-slate-600 resize-none"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Tipo</div>
                  <select value={newTask.tipo} onChange={e => setNewTask(p => ({ ...p, tipo: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none">
                    <option value="proyecto">📋 Proyecto</option>
                    <option value="operacional">🔧 Operacional</option>
                  </select>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Prioridad</div>
                  <select value={newTask.prioridad} onChange={e => setNewTask(p => ({ ...p, prioridad: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none">
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Destinatario</div>
                  <select value={newTask.asignado_tipo}
                    onChange={e => {
                      const tipo = e.target.value;
                      const defaults = { computer: 'Computer', swarm: 'Hermes Ops', antigravity: 'Director' };
                      setNewTask(p => ({ ...p, asignado_tipo: tipo, asignado_a: defaults[tipo] || '' }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none">
                    <option value="computer">🖥 Computer</option>
                    <option value="swarm">🤖 Swarm</option>
                    <option value="antigravity">👤 Director</option>
                  </select>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Agente / Owner</div>
                  <input type="text" value={newTask.asignado_a}
                    onChange={e => setNewTask(p => ({ ...p, asignado_a: e.target.value }))}
                    placeholder="Ej: Hermes Commercial"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none placeholder:text-slate-600" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Frente</div>
                  <select value={newTask.frente} onChange={e => setNewTask(p => ({ ...p, frente: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none">
                    <option value="F1-FRONTEND">F1 Frontend</option>
                    <option value="F2-BACKEND-CORE">F2 Backend Core</option>
                    <option value="F3-ATRACCION">F3 Atracción</option>
                    <option value="F4-RRHH-IA">F4 RRHH-IA</option>
                    <option value="F5-SEGURIDAD">F5 Seguridad</option>
                  </select>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Sprint</div>
                  <input type="text" value={newTask.sprint}
                    onChange={e => setNewTask(p => ({ ...p, sprint: e.target.value }))}
                    placeholder="Ej: S-JUL-2026"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none placeholder:text-slate-600" />
                </div>
              </div>

              {newTaskMsg && (
                <div className={`text-[10px] font-semibold ${
                  newTaskMsg.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'
                }`}>{newTaskMsg}</div>
              )}
              <button onClick={handleCrearTarea} disabled={newTaskSaving || !newTask.titulo.trim()}
                className="w-full text-[10px] font-black uppercase py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition disabled:opacity-40">
                {newTaskSaving ? 'Guardando...' : '+ Crear Tarea'}
              </button>
            </div>
          )}

          {/* Lista de tareas filtradas */}
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {(() => {
              const H24 = 24 * 60 * 60 * 1000;
              const isStuck = (t) => t.estado === 'en_progreso' && (Date.now() - new Date(t.updated_at).getTime()) >= H24;
              const isActive = (t) => t.estado === 'en_progreso' && (Date.now() - new Date(t.updated_at).getTime()) < H24;

              const filtered = atlasTasks.filter(t => {
                const matchesRecipient = taskFilter === 'all' || t.asignado_tipo === taskFilter || (taskFilter === 'computer' && !t.asignado_tipo);
                let matchesStatus = true;
                if (taskStatusFilter === 'en_progreso') matchesStatus = isActive(t);
                else if (taskStatusFilter === 'estancada') matchesStatus = isStuck(t);
                else if (taskStatusFilter === 'bloqueada') matchesStatus = t.estado === 'bloqueada';
                else if (taskStatusFilter === 'pendiente') matchesStatus = t.estado === 'pendiente';
                else if (taskStatusFilter === 'completado') matchesStatus = t.estado === 'completado';
                return matchesRecipient && matchesStatus;
              });

              if (filtered.length === 0) return (
                <div className="text-center py-8 text-slate-500 text-xs">Sin tareas para este filtro.</div>
              );

              return filtered.map(t => {
                const tipoIcon = t.tipo === 'operacional' ? '🔧' : '📋';
                const tipoColor = t.tipo === 'operacional'
                  ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400';
                const destColor =
                  t.asignado_tipo === 'computer'    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                  t.asignado_tipo === 'swarm'       ? 'bg-violet-500/10 border-violet-500/20 text-violet-400' :
                  t.asignado_tipo === 'antigravity' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                     'bg-slate-800 border-slate-700 text-slate-500';
                const destLabel =
                  t.asignado_tipo === 'computer'    ? '🖥 Computer' :
                  t.asignado_tipo === 'swarm'       ? '🤖 Swarm' :
                  t.asignado_tipo === 'antigravity' ? '👤 Director' :
                                                     '— sin clasificar';

                // Reglas B-6 — Estados de Tarea
                let statusText = '🔲 Pendiente';
                let statusColor = 'text-slate-400';
                let statusBg = 'bg-slate-800/40 border-slate-700/50';
                let showDoneButton = true;

                if (t.estado === 'completado') {
                  if (t.cerrado_por && t.evidencia_url) {
                    statusText = '✓ Hecho';
                    statusColor = 'text-emerald-400';
                    statusBg = 'bg-emerald-500/10 border-emerald-500/20';
                    showDoneButton = false;
                  } else {
                    statusText = '⚠️ Sin verificar';
                    statusColor = 'text-amber-500';
                    statusBg = 'bg-amber-500/10 border-amber-500/20';
                    showDoneButton = true;
                  }
                } else if (t.estado === 'en_progreso') {
                  if (isStuck(t)) {
                    statusText = '🟡 Estancada';
                    statusColor = 'text-amber-400';
                    statusBg = 'bg-amber-500/10 border-amber-500/20';
                  } else {
                    statusText = '🟢 Activa';
                    statusColor = 'text-emerald-400';
                    statusBg = 'bg-emerald-500/10 border-emerald-500/20';
                  }
                  showDoneButton = true;
                }

                return (
                  <div key={t.codigo}
                    className="bg-slate-950 rounded-xl flex flex-col space-y-2.5 hover:border-slate-700 transition p-3.5 border"
                    style={{ borderLeft: `3px solid ${frenteColor(t.frente)}`, borderTop: '1px solid rgb(30 41 59)', borderRight: '1px solid rgb(30 41 59)', borderBottom: '1px solid rgb(30 41 59)' }}>

                    {/* Fila superior: código + prioridad + bloqueado + estado */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-400 text-xs font-mono">{t.codigo}</span>
                        <span className={`px-2 py-0.5 text-[8px] font-black rounded border ${statusBg} ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.bloqueado && (
                          <span className="px-1.5 py-0.5 text-[8px] font-black rounded bg-rose-500/15 border border-rose-500/20 text-rose-400" title={t.bloqueo_razon || 'Bloqueado'}>🔒 BLOQ</span>
                        )}
                        <span className={`px-2 py-0.5 text-[8px] font-black rounded-md border ${
                          t.prioridad === 'alta'  ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                          t.prioridad === 'media' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                                    'bg-blue-500/10 border-blue-500/20 text-blue-500'
                        }`}>{(t.prioridad||'media').toUpperCase()}</span>
                      </div>
                    </div>

                    {/* Título */}
                    <p className="text-xs text-white font-semibold leading-snug">{t.titulo}</p>

                    {/* Descripción (si existe) */}
                    {t.descripcion && !expandedOvrTasks[t.codigo] && (
                      <p className="text-[10px] text-slate-400 leading-relaxed border-l-2 border-slate-800 pl-2">{t.descripcion}</p>
                    )}

                    {/* Toggle Contrato OVR */}
                    {(t.descripcion || t.resultado_estructurado) && (
                      <button
                        onClick={() => setExpandedOvrTasks(p => ({ ...p, [t.codigo]: !p[t.codigo] }))}
                        className="text-[9px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 select-none w-fit border border-blue-500/20 hover:border-blue-500/40 bg-blue-950/20 px-2 py-0.5 rounded transition"
                      >
                        ⚡ {expandedOvrTasks[t.codigo] ? 'Colapsar Evidence Card' : 'Ver Evidence Card (OVR)'}
                      </button>
                    )}

                    {/* Vista Expandida del Contrato OVR (Evidence Card) */}
                    {expandedOvrTasks[t.codigo] && (() => {
                      const ovr = interpretOVRContract(t);
                      if (!ovr || ovr.isLegacy) {
                        return (
                          <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-850 text-[10px] space-y-2 mt-1">
                            <div className="text-[8px] font-black uppercase text-amber-500">⚠️ Modo Compatibilidad Legado (Legacy)</div>
                            {t.descripcion && (
                              <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{t.descripcion}</p>
                            )}
                            <div className="text-slate-500 text-[8px] uppercase font-bold pt-1.5 border-t border-slate-800">
                              No se detectaron bloques de contrato estructurado según OVR-SCHEMA-v1.
                            </div>
                          </div>
                        );
                      }

                      const stages = ['created', 'validated', 'dispatched', 'started', 'completed', 'verified', 'certified'];
                      let currentStageIndex = 0;
                      if (t.estado === 'pendiente') currentStageIndex = 1;
                      else if (t.estado === 'en_progreso') currentStageIndex = 3;
                      else if (t.estado === 'completado') {
                        currentStageIndex = (t.cerrado_por && t.evidencia_url) ? 6 : 4;
                      }

                      return (
                        <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] space-y-3 mt-1 text-slate-300 w-full animate-fade-in">
                          {/* Cabecera del Contrato */}
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-1">
                            <div>
                              <div className="text-[8px] font-black uppercase text-blue-400 tracking-wider flex items-center gap-1">
                                ⚡ OVR EVIDENCE CARD v2
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0">PERSISTED</span>
                              </div>
                              <div className="text-white font-bold text-xs font-mono">{ovr.identity.id}</div>
                            </div>
                            <div className="flex gap-1.5 items-center">
                              {ovr.identity.type && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-400 uppercase font-mono flex items-center gap-1">
                                  {ovr.identity.type}
                                  <span className="text-[5.5px] text-slate-500 font-mono font-bold ml-1">PERSISTED</span>
                                </span>
                              )}
                              {ovr.capability.id && (
                                <span className="px-2 py-0.5 text-[8px] font-black rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 font-mono flex items-center gap-1">
                                  Capability: {ovr.capability.id}
                                  <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase">DERIVED</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Resolver Chain */}
                          {ovr.capability.resolverChain ? (
                            <div className="p-2 bg-slate-950/50 border border-slate-850 rounded-lg text-[9px] font-mono text-slate-400 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                              <span className="text-slate-500 font-bold uppercase text-[7.5px] mr-1 shrink-0">⛓️ Resolver Chain:</span>
                              <span className="text-violet-400 font-bold select-all">{ovr.capability.resolverChain}</span>
                              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1.5 shrink-0">PERSISTED</span>
                            </div>
                          ) : (
                            <div className="p-2 bg-slate-950/30 border border-slate-850 rounded-lg text-[9px] font-mono text-slate-500 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                              <span className="text-slate-500 font-bold uppercase text-[7.5px] mr-1 shrink-0">⛓️ Resolver Chain:</span>
                              <span className="italic text-slate-600">No trazada (sin persistencia en atlas_tasks)</span>
                              <span className="bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1.5 shrink-0">UNKNOWN</span>
                            </div>
                          )}

                          {/* Evidence Confidence Bar */}
                          <div className="p-2.5 bg-slate-950/40 border border-slate-850 rounded-lg flex items-center justify-between gap-4 text-[9px]">
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-500 font-bold uppercase text-[8px] flex items-center gap-1">
                                  📈 Evidence Confidence
                                  <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0">DERIVED</span>
                                </span>
                                <span className={`font-bold ${
                                  ovr.confidence >= 80 ? 'text-emerald-400' :
                                  ovr.confidence >= 50 ? 'text-amber-400' : 'text-rose-400'
                                }`}>{ovr.confidence}%</span>
                              </div>
                              <div className="w-full bg-slate-900 rounded-full h-1.5 border border-slate-800">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    ovr.confidence >= 80 ? 'bg-emerald-500' :
                                    ovr.confidence >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`} 
                                  style={{ width: `${ovr.confidence}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                ovr.confidence >= 80 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' :
                                ovr.confidence >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                       'bg-rose-500/10 border-rose-500/20 text-rose-400'
                              }`}>
                                {ovr.confidence >= 80 ? 'HIGH' : ovr.confidence >= 50 ? 'MEDIUM' : 'LOW'} RISK
                              </span>
                            </div>
                          </div>

                          {/* Metadata Grid: Dispatcher, Agent Knowledge, and Dependencies */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[9px] bg-slate-950/40 p-2 rounded-md border border-slate-850">
                            <div>
                              <span className="text-slate-500 font-bold uppercase block text-[8px] mb-0.5">👤 Dispatcher & Governance</span>
                              <span>
                                Autorizó: <span className="text-slate-300 font-semibold">{ovr.ownership.authorizedBy || 'N/A'}</span>
                                <span className={ovr.ownership.authorizedBySource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                  {ovr.ownership.authorizedBySource}
                                </span>
                              </span>
                              <br />
                              <span>
                                Encargó: <span className="text-slate-300 font-semibold">{ovr.ownership.requestedBy || 'N/A'}</span>
                                <span className={ovr.ownership.requestedBySource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                  {ovr.ownership.requestedBySource}
                                </span>
                              </span>
                              {ovr.governance.activeProtocols.length > 0 && (
                                <>
                                  <br />
                                  <span>
                                    Protocolo: <span className="text-blue-400 font-mono font-semibold">{ovr.governance.activeProtocols.join(', ')}</span>
                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0">PERSISTED</span>
                                  </span>
                                </>
                              )}
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold uppercase block text-[8px] mb-0.5">🧠 Agent Knowledge</span>
                              <span>
                                KBP Frente: <span className="text-slate-300 font-semibold">{ovr.knowledge.kbp}</span>
                                <span className={ovr.knowledge.kbpSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                  {ovr.knowledge.kbpSource}
                                </span>
                              </span>
                              <br />
                              <span>
                                Ejecutor: <span className="text-slate-300 font-semibold">{ovr.knowledge.agent || 'N/A'}</span>
                                <span className={ovr.knowledge.agentSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                  {ovr.knowledge.agentSource}
                                </span>
                              </span>
                              <br />
                              <span>
                                Arquitecto: <span className="text-slate-400 font-semibold">{ovr.governance.architectureOwner}</span>
                                <span className={ovr.governance.architectureOwnerSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                  {ovr.governance.architectureOwnerSource}
                                </span>
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-bold uppercase block text-[8px] mb-0.5">🔗 Dependencies</span>
                              <span>
                                Bloqueado: <span className={ovr.dependencies.blocked ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{ovr.dependencies.blocked ? 'Sí' : 'No'}</span>
                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0">PERSISTED</span>
                              </span>
                              {ovr.dependencies.dependsOn && (
                                <>
                                  <br />
                                  <span>
                                    Depende de: <span className="text-blue-400 font-mono font-semibold">{ovr.dependencies.dependsOn}</span>
                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0">PERSISTED</span>
                                  </span>
                                </>
                              )}
                              {ovr.dependencies.reason && (
                                <>
                                  <br />
                                  <span className="text-rose-300/80 truncate block max-w-full" title={ovr.dependencies.reason}>
                                    Razón: {ovr.dependencies.reason}
                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0">PERSISTED</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Section: Constitutional Fingerprint & Decision Provenance */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[9px]">
                            {/* Constitutional Fingerprint */}
                            <div className="p-2.5 bg-slate-950/40 border border-slate-850 rounded-lg space-y-1.5">
                              <span className="font-sans font-bold text-[8px] uppercase tracking-wider block text-slate-500">🔑 Constitutional Fingerprint</span>
                              <div className="space-y-1 font-mono text-slate-400">
                                <div className="truncate animate-pulse-slow flex items-center justify-between" title={ovr.fingerprint.knowledgeHash}>
                                  <div>
                                    <span className="text-slate-500 font-semibold">Knowledge Hash:</span>{' '}
                                    <span className="text-blue-400 select-all">{ovr.fingerprint.knowledgeHash}</span>
                                  </div>
                                  <span className={ovr.fingerprint.knowledgeHashSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0'}>
                                    {ovr.fingerprint.knowledgeHashSource}
                                  </span>
                                </div>
                                <div className="truncate animate-pulse-slow flex items-center justify-between" title={ovr.fingerprint.bundleHash}>
                                  <div>
                                    <span className="text-slate-500 font-semibold">Bundle Hash:</span>{' '}
                                    <span className="text-blue-400 select-all">{ovr.fingerprint.bundleHash}</span>
                                  </div>
                                  <span className={ovr.fingerprint.bundleHashSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase shrink-0'}>
                                    {ovr.fingerprint.bundleHashSource}
                                  </span>
                                </div>
                                <div className="flex justify-between text-[8px] pt-0.5">
                                  <span>
                                    Manifest: <span className="text-slate-350 font-semibold">{ovr.fingerprint.manifestVersion}</span>
                                    <span className={ovr.fingerprint.manifestVersionSource === 'PERSISTED' ? 'text-emerald-550 font-bold ml-1' : 'text-slate-550 font-bold ml-1'}>
                                      ({ovr.fingerprint.manifestVersionSource})
                                    </span>
                                  </span>
                                  <span>
                                    OVR: <span className="text-slate-350 font-semibold">{ovr.fingerprint.ovrVersion}</span>
                                    <span className={ovr.fingerprint.ovrVersionSource === 'PERSISTED' ? 'text-emerald-550 font-bold ml-1' : 'text-slate-550 font-bold ml-1'}>
                                      ({ovr.fingerprint.ovrVersionSource})
                                    </span>
                                  </span>
                                  <span>
                                    KBP: <span className="text-slate-350 font-semibold">{ovr.fingerprint.kbpVersion}</span>
                                    <span className={ovr.fingerprint.kbpVersionSource === 'PERSISTED' ? 'text-emerald-550 font-bold ml-1' : 'text-slate-550 font-bold ml-1'}>
                                      ({ovr.fingerprint.kbpVersionSource})
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Decision Provenance */}
                            <div className="p-2.5 bg-slate-950/40 border border-slate-850 rounded-lg flex flex-col justify-between">
                              <div>
                                <span className="font-sans font-bold text-[8px] uppercase tracking-wider block text-slate-500 mb-1">⚖️ Decision Provenance</span>
                                <div className="text-slate-400">
                                  <span>
                                    Decision Source: <span className="text-slate-200 font-bold">{ovr.decision.source || 'N/A'}</span>
                                    <span className={ovr.decision.sourceSource === 'PERSISTED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0' : 'bg-slate-800 border border-slate-700 text-slate-400 text-[5.5px] px-1 py-0.25 rounded font-mono font-bold uppercase ml-1 shrink-0'}>
                                      {ovr.decision.sourceSource}
                                    </span>
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-end mt-2 items-center gap-1.5">
                                {ovr.decision.isEmergencyBypass ? (
                                  <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-md font-extrabold uppercase text-[8px] animate-pulse">
                                    ⚠️ Emergency Bypass
                                    <span className="text-[6.5px] text-rose-500 font-mono font-bold ml-1">PERSISTED</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md font-extrabold uppercase text-[8px]">
                                    Standard Governance
                                    <span className="text-[6.5px] text-emerald-500 font-mono font-bold ml-1">PERSISTED</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Execution Blocks */}
                          <div className="space-y-2">
                            {/* Problema Detectado */}
                            {ovr.execution.problem && (
                              <div className="p-2.5 bg-rose-500/5 border border-rose-500/15 rounded-lg text-rose-200/90 leading-relaxed">
                                <span className="font-bold text-[8px] uppercase tracking-wider block text-rose-400 mb-1">⚠️ 1_problema_detectado</span>
                                {ovr.execution.problem}
                              </div>
                            )}

                            {/* Caso de Prueba / Datos Reales */}
                            {ovr.execution.testCase && (
                              <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg font-mono text-[9px] text-slate-300 leading-relaxed">
                                <span className="font-sans font-bold text-[8px] uppercase tracking-wider block text-slate-500 mb-1">📋 2_datos_reales_caso_prueba</span>
                                <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-blue-300/90">{ovr.execution.testCase}</pre>
                              </div>
                            )}

                            {/* Comparativo Incorrecto vs Correcto (git-diff style) */}
                            {(ovr.execution.incorrect || ovr.execution.correct) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="p-2.5 bg-rose-950/15 border border-rose-900/20 rounded-lg text-rose-300/95 leading-relaxed">
                                  <span className="font-bold text-[8px] uppercase tracking-wider block text-rose-500 mb-1">❌ 3_incorrecto (Actual)</span>
                                  {ovr.execution.incorrect || 'No especificado.'}
                                </div>
                                <div className="p-2.5 bg-emerald-950/15 border border-emerald-900/20 rounded-lg text-emerald-300/95 leading-relaxed">
                                  <span className="font-bold text-[8px] uppercase tracking-wider block text-emerald-500 mb-1">✔️ 3_correcto (Esperado)</span>
                                  {ovr.execution.correct || 'No especificado.'}
                                </div>
                              </div>
                            )}

                            {/* Causa Probable */}
                            {ovr.execution.probableCause && (
                              <div className="p-2.5 bg-violet-950/15 border border-violet-900/20 rounded-lg text-violet-300/90 leading-relaxed">
                                <span className="font-bold text-[8px] uppercase tracking-wider block text-violet-400 mb-1">💡 4_causa_probable</span>
                                {ovr.execution.probableCause}
                              </div>
                            )}

                            {/* Archivos a Revisar */}
                            {ovr.execution.filesToReview && ovr.execution.filesToReview.length > 0 && (
                              <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-300 leading-relaxed">
                                <span className="font-sans font-bold text-[8px] uppercase tracking-wider block text-slate-500 mb-1">📂 5_archivos_a_revisar</span>
                                <div className="flex flex-col gap-1.5">
                                  {ovr.execution.filesToReview.map((file, i) => (
                                    <div key={i} className="flex items-center gap-1.5 font-mono text-[9px]">
                                      <span className="text-slate-600">📄</span>
                                      <span className="text-blue-400 font-semibold select-all">{file}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Decision & Evidence */}
                          {(ovr.decision.rationale || ovr.evidence.result || ovr.evidence.url) && (
                            <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-[10px] space-y-2 text-slate-400">
                              {ovr.evidence.url && (
                                <div>
                                  <span className="font-bold text-[8px] uppercase text-blue-500 block">🔗 Evidencia URL</span>
                                  <a href={ovr.evidence.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all font-mono">
                                    {ovr.evidence.url}
                                  </a>
                                </div>
                              )}
                              {ovr.evidence.result && (
                                <div className="pt-1.5 border-t border-slate-850">
                                  <span className="font-bold text-[8px] uppercase text-emerald-500 block">✅ Evidencia de Resolución</span>
                                  {ovr.evidence.result}
                                </div>
                              )}
                              {ovr.decision.rationale && (
                                <div className="pt-1.5 border-t border-slate-850">
                                  <span className="font-bold text-[8px] uppercase text-slate-500 block">🧠 Rationale (Decision)</span>
                                  {ovr.decision.rationale}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Lifecycle Stepper */}
                          <div className="pt-3.5 border-t border-slate-800">
                            <span className="font-bold text-[8px] uppercase tracking-wider block text-slate-500 mb-2">🔄 6_flujo_promocion (Lifecycle Timeline)</span>
                            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                              {stages.map((stage, idx) => {
                                const isActive = idx <= currentStageIndex;
                                const isCurrent = idx === currentStageIndex;
                                return (
                                  <div key={stage} className="flex flex-col items-center flex-1 min-w-[55px]">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border transition ${
                                      isCurrent ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]' :
                                      isActive ? 'bg-emerald-950 border-emerald-500 text-emerald-400' :
                                      'bg-slate-950 border-slate-800 text-slate-600'
                                    }`}>
                                      {idx + 1}
                                    </div>
                                    <span className={`text-[8px] font-bold mt-1.5 uppercase tracking-tight text-center ${
                                      isCurrent ? 'text-blue-400 font-black' :
                                      isActive ? 'text-emerald-500' :
                                      'text-slate-600'
                                    }`}>{stage}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Bloqueo reason */}
                    {t.bloqueado && t.bloqueo_razon && (
                      <p className="text-[9px] text-rose-400/80 bg-rose-950/20 border border-rose-900/30 rounded px-2 py-1">🔒 {t.bloqueo_razon}</p>
                    )}

                    {/* Fila de meta: tipo + destinatario */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 text-[8px] font-black rounded border ${tipoColor}`}>{tipoIcon} {t.tipo||'proyecto'}</span>
                      <span className={`px-2 py-0.5 text-[8px] font-black rounded border ${destColor}`}>{destLabel}</span>
                      {t.asignado_a && t.asignado_a !== destLabel.replace(/^[^ ]+ /, '') && (
                        <span className="text-[9px] text-slate-500">→ {t.asignado_a}</span>
                      )}
                      {t.ejecutor && (
                        <span className="px-2 py-0.5 text-[8px] font-black rounded border bg-blue-950/40 border-blue-800 text-blue-300">Ejecutor: {t.ejecutor}</span>
                      )}
                      {t.cerrado_por && (
                        <span className="text-[9px] text-emerald-500">Cerrado por: {t.cerrado_por}</span>
                      )}
                    </div>

                    {/* Fila inferior: frente + sprint + botón completar */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-900/60">
                      <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold">
                        <span style={{ color: frenteColor(t.frente) }}>{t.frente || '—'}</span>
                        {t.sprint && <span>· {t.sprint}</span>}
                      </div>
                      {showDoneButton ? (
                        <button onClick={() => handleCompletarTarea(t.codigo)}
                          className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition">
                          ✓ {t.estado === 'completado' ? 'Verificar' : 'Hecho'}
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-600 font-bold">Verificado</span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Gaps de Vouchers (compacto, separado) */}
          {gapTasks.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-850">
              <h4 className="font-bold text-white text-sm flex items-center justify-between">
                <span>🎫 Gaps de Vouchers ({gapTasks.length})</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase">SEV1/SEV2</span>
              </h4>
              {gapTasks.map((task, i) => (
                <div key={i} className="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 text-xs">{task.id}</span>
                    <span className={`px-2 py-0.5 text-[8px] font-black rounded-md border ${
                      task.priority === 'SEV1' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                                                 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                    }`}>{task.priority}</span>
                  </div>
                  <p className="text-[10px] text-white leading-relaxed">{task.description}</p>
                  <div className={`text-[9px] font-bold uppercase ${task.priority === 'SEV1' ? 'text-rose-400' : 'text-amber-400'}`}>{task.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Columna 3: Actividad Reciente — dos feeds */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col space-y-4">

          {/* Header con tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base">📡 Actividad Reciente</h3>
            <div className="flex gap-1">
              <button
                onClick={() => setActividadTab('operarios')}
                className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border transition ${
                  actividadTab === 'operarios'
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}>
                👤 Operarios
              </button>
              <button
                onClick={() => setActividadTab('sistema')}
                className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border transition ${
                  actividadTab === 'sistema'
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}>
                ⚙ Sistema
              </button>
            </div>
          </div>

          {/* TTL badge */}
          <div className="text-[9px] text-slate-600 font-bold uppercase">
            {actividadTab === 'sistema' ? '⏱ Ventana: últimas 48 h — se limpia solo' : '⏱ Últimos 15 movimientos de reservas'}
          </div>

          {/* Feed OPERARIOS */}
          {actividadTab === 'operarios' && (
            <div className="space-y-2 flex-1 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {recentActivity.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs italic animate-pulse">Esperando transacciones...</div>
              ) : (
                recentActivity.map((act, idx) => {
                  const isNew = (Date.now() - new Date(act.updated_at).getTime()) < 3600000; // < 1h
                  const actionLabel =
                    act.status === 'confirmed'  ? 'Confirmada' :
                    act.status === 'cancelled'  ? 'Cancelada'  :
                    act.status === 'completed'  ? 'Completada' :
                    act.payment_status === 'paid' ? 'Pago recibido' :
                    act.payment_status === 'pending' ? 'Pago pendiente' : act.status;
                  const actionColor =
                    act.status === 'confirmed' || act.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    act.status === 'cancelled' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                    act.payment_status === 'paid' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    'text-amber-400 bg-amber-500/10 border-amber-500/20';
                  return (
                    <div key={idx} className={`bg-slate-950 border rounded-xl p-3 flex flex-col gap-1.5 transition ${
                      isNew ? 'border-blue-500/30' : 'border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[10px] text-blue-400">{act.booking_reference || 'REF-N/A'}</span>
                        <div className="flex items-center gap-1.5">
                          {isNew && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          <span className="text-[9px] text-slate-500">{relativeTime(act.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-semibold truncate max-w-[120px]">{act.lead_guest_name || 'Huésped'}</span>
                        <span className="text-[10px] font-mono text-slate-300">{renderMoney(act)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded border ${actionColor}`}>{actionLabel}</span>
                        {act.fulfillment_status && act.fulfillment_status !== 'pending' && (
                          <span className="px-2 py-0.5 text-[8px] font-black uppercase rounded border bg-slate-800 border-slate-700 text-slate-400">{act.fulfillment_status}</span>
                        )}
                        {act.booking_type && (
                          <span className="text-[8px] text-slate-600 uppercase">{act.booking_type}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Feed SISTEMA */}
          {actividadTab === 'sistema' && (
            <div className="space-y-2 flex-1 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {actividadSistema.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs italic animate-pulse">Sin actividad del sistema en las últimas 48 h...</div>
              ) : (
                actividadSistema.map((item, idx) => {
                  if (item._tipo === 'log') {
                    const nivelColor =
                      item.nivel === 'CRITICAL' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                      item.nivel === 'WARNING'  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                                  'text-blue-400 bg-blue-500/10 border-blue-500/20';
                    return (
                      <div key={`log-${item.id||idx}`} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase rounded border ${nivelColor}`}>{item.nivel}</span>
                            <span className="text-[8px] font-black uppercase text-slate-500">LOG</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${ item.resuelto ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                            <span className="text-[9px] text-slate-500">{relativeTime(item.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-[10px] font-bold text-white">{item.evento}</div>
                        <p className="text-[9px] text-slate-400 leading-relaxed">{item.mensaje}</p>
                        <div className="flex items-center justify-between text-[8px]">
                          <span className="text-slate-600">{item.origen || 'Sistema'}</span>
                          <span className={item.resuelto ? 'text-emerald-500 font-black' : 'text-rose-500 font-black'}>
                            {item.resuelto ? '✓ Resuelto' : '● Pendiente'}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  // _tipo === 'tarea'
                  const destIcon =
                    item.asignado_tipo === 'computer'    ? '🖥' :
                    item.asignado_tipo === 'swarm'       ? '🤖' :
                    item.asignado_tipo === 'antigravity' ? '👤' : '⚙';
                  const tipoIcon = item.tipo === 'operacional' ? '🔧' : '📋';
                  return (
                    <div key={`task-${item.codigo||idx}`} className="bg-slate-950 border border-emerald-500/15 rounded-xl p-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">TAREA ✓</span>
                          <span className="font-mono text-[9px] text-emerald-400 font-bold">{item.codigo}</span>
                        </div>
                        <span className="text-[9px] text-slate-500">{relativeTime(item.fecha_completado)}</span>
                      </div>
                      <p className="text-[10px] text-white font-semibold leading-snug">{item.titulo}</p>
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                        <span>{tipoIcon} {item.tipo}</span>
                        <span>·</span>
                        <span>{destIcon} {item.asignado_a || item.asignado_tipo || 'Sistema'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="text-center text-[9px] text-slate-600 font-extrabold uppercase tracking-wider pt-2 border-t border-slate-850">
            Mission Control v2.8 · Aliun Travel SRL
          </div>
        </div>
      </div>

      {/* ── NUEVA: Heartbeat Manual ──────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="font-bold text-white text-lg">💓 Heartbeat Manual</h3>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Ping directo → agente-checkin</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Agente objetivo</div>
            <select value={heartbeatTarget} onChange={e => setHeartbeatTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50">
              <option value="">— Seleccionar agente —</option>
              <option value="Hermes Ops">Hermes Ops</option>
              <option value="Hermes Commercial">Hermes Commercial</option>
              <option value="Hermes Marketing">Hermes Marketing</option>
              <option value="Ariadne Data">Ariadne Data</option>
              <option value="Hermes-QA">Hermes-QA</option>
              {agents.filter(a => !['Hermes Ops','Hermes Commercial','Hermes Marketing','Ariadne Data','Hermes-QA'].includes(a.name))
                .map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <button onClick={handleHeartbeatManual} disabled={!heartbeatTarget || heartbeatSending}
            className="px-4 py-2 text-xs font-black uppercase rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition disabled:opacity-40">
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
