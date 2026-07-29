import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LeadDetail from './LeadDetail';

const TABS_CONFIG = [
  { id: 'captacion', label: 'Captación 📥', activeColor: 'border-blue-500 text-blue-400 bg-blue-500/5 hover:text-blue-300' },
  { id: 'comercial', label: 'Comercial 💼', activeColor: 'border-cyan-500 text-cyan-400 bg-cyan-500/5 hover:text-cyan-300' },
  { id: 'financiero', label: 'Financiero 💳', activeColor: 'border-pink-500 text-pink-400 bg-pink-500/5 hover:text-pink-300' },
  { id: 'operativo', label: 'Operativo ⚙️', activeColor: 'border-violet-500 text-violet-400 bg-violet-500/5 hover:text-violet-300' },
  { id: 'perdido', label: 'Perdidos ❌', activeColor: 'border-rose-500 text-rose-400 bg-rose-500/5 hover:text-rose-355' }
];

const STAGE_CONFIG = {
  captacion: {
    entrante:   { label: 'Entrante', stages: ['nuevo'],               webhook: null,  color: 'border-slate-800/80 bg-slate-900/10 text-slate-400' },
    calificado: { label: 'Calificado', stages: ['calificado','contactado'], webhook: 'WH-1', color: 'border-blue-500/20 bg-blue-500/5 text-blue-400' }
  },
  comercial: {
    cotizado:   { label: 'Cotizado', stages: ['cotizacion_enviada','factura_enviada'], webhook: 'WH-2', color: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400' },
    negociando: { label: 'Negociando', stages: ['negociando'],           webhook: 'WH-3', color: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400' }
  },
  financiero: {
    abono:      { label: 'Abono Recibido', stages: ['abono_recibido','deposito_recibido','validacion_pago'], webhook: null,  color: 'border-pink-500/20 bg-pink-500/5 text-pink-400' },
    saldo:      { label: 'Saldo Pendiente', stages: ['saldo_pendiente'],      webhook: 'WH-4', color: 'border-orange-500/20 bg-orange-500/5 text-orange-400' }
  },
  operativo: {
    fulfillment:{ label: 'En Fulfillment', stages: ['en_fulfillment','voucher_enviado'],   webhook: 'WH-5', color: 'border-violet-500/20 bg-violet-500/5 text-violet-400' },
    completado: { label: 'Completado', stages: ['completado'],           webhook: 'WH-6', color: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' }
  },
  perdido: {
    perdido:    { label: 'Perdido', stages: ['perdido'],               webhook: null,  color: 'border-rose-500/20 bg-rose-500/5 text-rose-400' }
  }
};

const STAGE_LEVELS = {
  nuevo: 1,
  calificado: 1,
  contactado: 1,
  cotizacion_enviada: 2,
  factura_enviada: 2,
  negociando: 2,
  validacion_pago: 3,
  abono_recibido: 3,
  deposito_recibido: 3,
  saldo_pendiente: 3,
  en_fulfillment: 4,
  voucher_enviado: 4,
  completado: 4,
  perdido: 5
};

const SOURCE_BADGES = {
  widget: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  whatsapp: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  meta_ad: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  referral: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  manual: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

const isSkippingStages = (currentStage, targetStage) => {
  const currentLevel = STAGE_LEVELS[currentStage] || 1;
  const targetLevel = STAGE_LEVELS[targetStage] || 1;

  if (targetLevel <= currentLevel) return false;
  if (targetStage === 'perdido') return false;
  if (targetLevel - currentLevel > 1) return true;
  return false;
};

export const PipelineKanban = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('captacion');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  
  // Custom Toast State
  const [toast, setToast] = useState(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  
  // Modal de Nuevo Lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    source: 'manual',
    hotel_interest: '',
    budget_range: '',
    message: ''
  });
  const [hotels, setHotels] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchVal = params.get('search');
    if (searchVal) {
      setSearchTerm(searchVal);
    }
    fetchLeads();
    fetchHotels();
  }, []);

  const showNotification = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select(`
          id, full_name, phone, stage,
          hotel_interest, check_in, check_out,
          adults, children, destination,
          budget_range, source, created_at, stage_updated_at,
          score, score_label,
          bookings(id, booking_reference, total_amount_usd, total_amount_dop)
        `)
        .order('stage_updated_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
      showNotification('Error al cargar los leads desde Supabase');
    } finally {
      setLoading(false);
    }
  };

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from('hotels_master')
        .select('slug, name')
        .eq('is_active', true);
      if (!error) setHotels(data || []);
    } catch (err) {
      console.error('Error fetching hotels:', err);
    }
  };

  // Parsea budget_range a número para acumular en DOP
  const parseBudget = (lead) => {
    if (lead.budget_range) {
      const cleanStr = String(lead.budget_range).replace(/[^0-9.]/g, '');
      const val = parseFloat(cleanStr);
      if (!isNaN(val) && val > 0) {
        return val;
      }
    }
    return parseFloat(lead.bookings?.[0]?.total_amount_dop || 0);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const currentStage = lead.stage;

    // Regla 1: Bloqueo de saltos de etapas comerciales
    if (isSkippingStages(currentStage, targetStage)) {
      showNotification('Transición Bloqueada: No puedes saltar grupos de etapas comerciales.');
      setDragOverStage(null);
      setDraggedLeadId(null);
      return;
    }

    // Regla 2: ABONO RECIBIDO y etapas financieras afines requieren payment_ledger
    if (['abono_recibido', 'deposito_recibido', 'validacion_pago'].includes(targetStage)) {
      const bookingId = lead.bookings?.[0]?.id;
      if (!bookingId) {
        showNotification('Transición Bloqueada: El lead no tiene ninguna reserva vinculada.');
        setDragOverStage(null);
        setDraggedLeadId(null);
        return;
      }

      try {
        setLoading(true);
        const { count, error } = await supabase
          .from('payment_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('booking_id', bookingId);

        if (error) throw error;

        if (!count || count === 0) {
          showNotification('Transición Bloqueada: No se registran abonos conciliados en el ledger.');
          setDragOverStage(null);
          setDraggedLeadId(null);
          fetchLeads();
          return;
        }
      } catch (err) {
        console.error('Error validating payment ledger:', err);
        showNotification('Error al comunicar con el ledger contable.');
        setDragOverStage(null);
        setDraggedLeadId(null);
        fetchLeads();
        return;
      } finally {
        setLoading(false);
      }
    }

    // Actualización local optimista
    const updatedLeads = leads.map(l => {
      if (l.id === leadId) {
        return { ...l, stage: targetStage, stage_updated_at: new Date().toISOString() };
      }
      return l;
    });
    setLeads(updatedLeads);
    setDragOverStage(null);
    setDraggedLeadId(null);

    // Persistir en base de datos
    try {
      const { error: rpcError } = await supabase.rpc('avanzar_pipeline', {
        p_lead_id: leadId,
        p_new_stage: targetStage,
        p_actor: 'director'
      });

      if (rpcError) {
        console.warn('avanzar_pipeline RPC falló, aplicando fallback directo:', rpcError);
        const { error: updateError } = await supabase
          .from('crm_leads')
          .update({ stage: targetStage, stage_updated_at: new Date().toISOString() })
          .eq('id', leadId);

        if (updateError) throw updateError;

        await supabase.from('crm_activities').insert({
          lead_id: leadId,
          type: 'sistema',
          content: `Etapa cambiada a: ${targetStage} (vía fallback directo)`,
          created_by: 'director'
        });
      }

      showNotification('Etapa actualizada con éxito', 'success');
      fetchLeads();
    } catch (err) {
      console.error('Error persisting stage change:', err);
      showNotification('Error al guardar el cambio en el servidor');
      fetchLeads();
    }
  };

  // Crear Lead
  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .insert([{
          ...newLeadForm,
          stage: 'nuevo',
          created_at: new Date().toISOString(),
          stage_updated_at: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        await supabase.from('crm_activities').insert({
          lead_id: data[0].id,
          type: 'sistema',
          content: 'Lead creado manualmente desde el Panel de Horizons',
          created_by: 'director'
        });
      }

      setShowCreateModal(false);
      setNewLeadForm({
        full_name: '',
        phone: '',
        email: '',
        source: 'manual',
        hotel_interest: '',
        budget_range: '',
        message: ''
      });
      showNotification('Lead registrado exitosamente', 'success');
      fetchLeads();
    } catch (err) {
      alert('Error al crear lead: ' + err.message);
    }
  };

  // Filtrado
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = 
        lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone?.includes(searchTerm) ||
        (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesSource = selectedSource === 'all' || lead.source === selectedSource;
      
      return matchesSearch && matchesSource;
    });
  }, [leads, searchTerm, selectedSource]);

  // Alertas por días en etapa
  const getStageAlert = (stage, updated_at) => {
    if (!updated_at) return null;
    const days = Math.floor((Date.now() - new Date(updated_at)) / 86400000);
    if (['cotizacion_enviada', 'factura_enviada'].includes(stage) && days > 2) {
      return { type: 'warn', label: `⚠️ ${days}d en cotización` };
    }
    if (stage === 'negociando' && days > 3) {
      return { type: 'danger', label: `🔴 ${days}d en objeción` };
    }
    return days > 0 ? { type: 'info', label: `⏱️ ${days}d en etapa` } : { type: 'info', label: '⏱️ hoy' };
  };

  const getScoreBadge = (scoreLabel) => {
    const score = String(scoreLabel || '').toUpperCase();
    if (score === 'HOT') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    if (score === 'WARM') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  const activeColumns = STAGE_CONFIG[activeTab] || {};

  return (
    <div className="space-y-6 text-slate-100 relative">
      
      {/* Custom Floating Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl border flex items-center gap-3 shadow-xl transition-all duration-300 animate-slideUp ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-950/90 border-rose-500/30 text-rose-400'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span className="text-xs font-black tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Funnel de Ventas</h1>
          <p className="text-slate-400 mt-1 font-medium">Commercial Intelligence Workspace (COS-v3.5)</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLeads}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl font-bold text-sm text-slate-300 transition-colors"
          >
            🔄 Actualizar
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm text-slate-950 transition-colors shadow-lg shadow-emerald-500/10"
          >
            ➕ Nuevo Lead
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl">
        <div className="flex-1 w-full relative">
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 px-4 py-2.5 pl-10 rounded-xl text-slate-200 placeholder-slate-555 text-sm focus:outline-none focus:border-blue-500/50"
          />
          <span className="absolute left-3.5 top-3 text-slate-550 text-sm">🔍</span>
        </div>
        <div className="w-full md:w-48">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 px-3 py-2.5 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">Todas las Fuentes</option>
            <option value="widget">Widget Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="meta_ad">Meta Ads</option>
            <option value="referral">Referidos</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800/80 pb-3">
        {TABS_CONFIG.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                isActive 
                  ? tab.activeColor 
                  : 'border-transparent text-slate-500 hover:text-slate-350 hover:bg-slate-900/30'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Kanban Board Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold animate-pulse text-xs uppercase tracking-widest">Sincronizando Workspace...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
          {Object.entries(activeColumns).map(([colId, colConfig]) => {
            const colLeads = filteredLeads.filter(l => colConfig.stages.includes(l.stage));
            const budgetSum = colLeads.reduce((sum, l) => sum + parseBudget(l), 0);
            const isOver = dragOverStage === colConfig.stages[0]; // drop target principal

            return (
              <div 
                key={colId}
                onDragOver={(e) => handleDragOver(e, colConfig.stages[0])}
                onDrop={(e) => handleDrop(e, colConfig.stages[0])}
                onDragLeave={() => setDragOverStage(null)}
                className={`flex flex-col w-full min-h-[500px] bg-slate-900/20 border rounded-3xl transition-all p-4 space-y-4 ${
                  isOver ? 'border-blue-500/40 bg-blue-500/5 scale-[1.005]' : 'border-slate-850'
                }`}
              >
                {/* Column Header */}
                <div className={`flex flex-col pb-3 border-b border-slate-850`}>
                  <div className="flex justify-between items-center">
                    <span className="font-black text-sm uppercase tracking-widest text-white flex items-center gap-2">
                      {colConfig.label}
                    </span>
                    {colConfig.webhook && (
                      <span className="text-[9px] font-mono text-slate-500 border border-slate-800 px-2 py-0.5 rounded-lg bg-slate-950/30">
                        {colConfig.webhook}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs text-slate-500 font-bold">
                    <span>{colLeads.length} leads</span>
                    {budgetSum > 0 && (
                      <span className="text-emerald-450 font-mono">
                        RD$ {budgetSum.toLocaleString('es-DO')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards List */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                  {colLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 border border-dashed border-slate-800/80 rounded-2xl text-xs text-slate-600">
                      Arrastrar leads aquí
                    </div>
                  ) : (
                    colLeads.map(lead => {
                      const alert = getStageAlert(lead.stage, lead.stage_updated_at);
                      
                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className={`bg-slate-950 border rounded-2xl p-4 hover:border-slate-700 cursor-pointer shadow-md group transition-all duration-200 ${
                            selectedLeadId === lead.id ? 'border-blue-500/60 bg-blue-950/20' : 'border-slate-850/90'
                          }`}
                        >
                          {/* Top Row: Source and Score */}
                          <div className="flex items-center justify-between mb-2.5">
                            <span className={`text-[9px] font-black border uppercase tracking-wider px-2 py-0.5 rounded-lg ${
                              SOURCE_BADGES[lead.source] || 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {lead.source}
                            </span>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${getScoreBadge(lead.score_label)}`}>
                              {lead.score_label || 'COLD'}
                            </span>
                          </div>

                          {/* Lead Name */}
                          <div className="space-y-0.5">
                            <h4 className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">
                              {lead.full_name}
                            </h4>
                            <p className="text-xs text-slate-500 font-semibold font-mono">{lead.phone}</p>
                          </div>

                          {/* Hotel Interest & Dates */}
                          {(lead.hotel_interest || lead.check_in) && (
                            <div className="mt-3 pt-2.5 border-t border-slate-900/60 space-y-1 text-[11px] text-slate-400 font-semibold">
                              {lead.check_in && (
                                <div className="flex items-center gap-1.5 font-mono text-slate-500">
                                  <span>📅</span>
                                  <span>{lead.check_in} a {lead.check_out || '—'}</span>
                                </div>
                              )}
                              {lead.hotel_interest && (
                                <div className="flex items-center gap-1.5">
                                  <span>🏨</span>
                                  <span className="truncate uppercase text-slate-300">{lead.hotel_interest}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Occupancy and Alert */}
                          <div className="mt-3 flex items-center justify-between text-[10px] border-t border-slate-900/30 pt-2">
                            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                              <span>👥</span>
                              <span>{lead.adults || 1} Ad {lead.children > 0 && `· ${lead.children} Ch`}</span>
                            </div>
                            {alert && (
                              <span className={`px-2 py-0.5 rounded font-black uppercase text-[9px] ${
                                alert.type === 'danger' 
                                  ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20' 
                                  : alert.type === 'warn'
                                  ? 'bg-amber-500/10 text-amber-450 border border-amber-500/20'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {alert.label}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel Detalle Lateral */}
      {selectedLeadId && (
        <LeadDetail 
          leadId={selectedLeadId} 
          onClose={() => setSelectedLeadId(null)}
          onRefresh={fetchLeads}
        />
      )}

      {/* Modal Crear Lead */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">Registrar Nuevo Lead</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm focus:outline-none"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateLead} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.full_name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, full_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Teléfono (WhatsApp) *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. +18095551234"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Correo Electrónico</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="ejemplo@correo.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Origen / Fuente</label>
                  <select
                    value={newLeadForm.source}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="manual">Manual / Teléfono</option>
                    <option value="widget">Widget Web</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="referral">Referido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Hotel de Interés</label>
                  <select
                    value={newLeadForm.hotel_interest}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, hotel_interest: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="">Ninguno / Explorando</option>
                    {hotels.map(h => (
                      <option key={h.slug} value={h.slug}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Rango de Presupuesto</label>
                  <input
                    type="text"
                    value={newLeadForm.budget_range}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, budget_range: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. RD$ 40,000"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Mensaje o Requerimientos</label>
                <textarea
                  value={newLeadForm.message}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, message: e.target.value })}
                  rows="3"
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-650 focus:outline-none focus:border-blue-500/50"
                  placeholder="Detalles sobre el viaje o fechas deseadas..."
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl font-bold transition-colors"
                >
                  Registrar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PipelineKanban;
