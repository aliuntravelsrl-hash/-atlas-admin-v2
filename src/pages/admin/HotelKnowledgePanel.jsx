import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  BookOpen, 
  HelpCircle, 
  CheckCircle, 
  XCircle, 
  Search, 
  Plus, 
  Edit, 
  Send, 
  MessageSquare, 
  Filter, 
  Trash2,
  ThumbsUp,
  Layers,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

export default function HotelKnowledgePanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('gaps'); // 'gaps', 'knowledge', 'search'
  
  // Lists
  const [gaps, setGaps] = useState([]);
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [hotels, setHotels] = useState([]);
  
  // Loading states
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  
  // Filters
  const [selectedHotelFilter, setSelectedHotelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modal / Form state for resolving gaps
  const [selectedGap, setSelectedGap] = useState(null);
  const [resolveAnswer, setResolveAnswer] = useState('');
  const [resolveCategory, setResolveCategory] = useState('general');
  const [submittingResolve, setSubmittingResolve] = useState(false);
  
  // Form state for creating new knowledge manually
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newHotelId, setNewHotelId] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  // Search state
  const [searchHotelId, setSearchHotelId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Fetch hotels for dropdowns
  useEffect(() => {
    async function fetchHotels() {
      const { data, error } = await supabase
        .from('hotels_master')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        setHotels(data);
      }
    }
    fetchHotels();
  }, []);

  // Fetch gaps
  const fetchGaps = async () => {
    setLoadingGaps(true);
    try {
      // Intentamos consultar hotel_knowledge_gaps
      let query = supabase
        .from('hotel_knowledge_gaps')
        .select('*');
        
      if (selectedHotelFilter) {
        query = query.eq('hotel_nombre', hotels.find(h => h.id === selectedHotelFilter)?.name || '');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setGaps(data || []);
    } catch (error) {
      console.error("Error fetching gaps:", error);
      toast({
        title: "Error al cargar Gaps",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoadingGaps(false);
    }
  };

  // Fetch verified knowledge
  const fetchKnowledge = async () => {
    setLoadingKnowledge(true);
    try {
      let query = supabase
        .from('hotel_knowledge')
        .select(`
          *,
          hotels_master (
            id,
            name
          )
        `);

      if (selectedHotelFilter) query = query.eq('hotel_id', selectedHotelFilter);
      if (categoryFilter) query = query.eq('categoria', categoryFilter);
      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setKnowledgeList(data || []);
    } catch (error) {
      console.error("Error fetching knowledge:", error);
      toast({
        title: "Error al cargar base de conocimiento",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoadingKnowledge(false);
    }
  };

  // Trigger loads based on active tab and filters
  useEffect(() => {
    if (activeTab === 'gaps') {
      fetchGaps();
    } else if (activeTab === 'knowledge') {
      fetchKnowledge();
    }
  }, [activeTab, selectedHotelFilter, categoryFilter, statusFilter]);

  // Resolve a gap: Create verified knowledge and update QA Log
  const handleResolveGap = async (e) => {
    e.preventDefault();
    if (!resolveAnswer.trim()) {
      toast({ title: "Respuesta obligatoria", description: "Por favor escribe una respuesta.", variant: "destructive" });
      return;
    }

    setSubmittingResolve(true);
    try {
      // 1. Buscamos el hotel_id real de la tabla hotel_qa_log
      const { data: qaLog, error: errQa } = await supabase
        .from('hotel_qa_log')
        .select('hotel_id')
        .eq('id', selectedGap.id)
        .single();

      if (errQa || !qaLog?.hotel_id) {
        throw new Error("No se pudo localizar el hotel_id asociado a este gap.");
      }

      // 2. Insertamos en hotel_knowledge
      const { error: errInsert } = await supabase
        .from('hotel_knowledge')
        .insert([{
          hotel_id: qaLog.hotel_id,
          pregunta: selectedGap.pregunta_cliente,
          respuesta: resolveAnswer,
          categoria: resolveCategory,
          is_verified: true,
          status: 'verified',
          fuente: 'manual'
        }]);

      if (errInsert) throw errInsert;

      // 3. Actualizamos en hotel_qa_log
      const { error: errUpdate } = await supabase
        .from('hotel_qa_log')
        .update({
          promovido_a_knowledge: true,
          respondida_bien: true,
          notas_qa: `Resuelto y promovido a la base de conocimiento por QA en fecha ${new Date().toLocaleDateString()}`
        })
        .eq('id', selectedGap.id);

      if (errUpdate) throw errUpdate;

      toast({
        title: "Resuelto con éxito",
        description: "El conocimiento ha sido publicado y el gap marcado como resuelto.",
        className: 'bg-emerald-600 text-white border-none'
      });

      setSelectedGap(null);
      setResolveAnswer('');
      fetchGaps();
    } catch (error) {
      console.error("Error resolving gap:", error);
      toast({
        title: "Error al resolver",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Approve a proposed knowledge entry
  const handleApproveKnowledge = async (id) => {
    try {
      const { error } = await supabase.rpc('aprobar_knowledge', { knowledge_id: id });
      
      if (error) {
        // Fallback si no está la RPC expuesta
        console.warn("RPC aprobar_knowledge not found, running manual update");
        const { error: errManual } = await supabase
          .from('hotel_knowledge')
          .update({ status: 'verified', is_verified: true })
          .eq('id', id);
        if (errManual) throw errManual;
      }

      toast({
        title: "Propuesta aprobada",
        description: "El conocimiento ahora es canónico y verificado.",
        className: 'bg-emerald-600 text-white border-none'
      });
      fetchKnowledge();
    } catch (error) {
      console.error("Error approving knowledge:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Reject/Delete knowledge entry
  const handleRejectKnowledge = async (id) => {
    if (!confirm("¿Seguro que deseas desactivar esta entrada de conocimiento?")) return;
    try {
      const { error } = await supabase.rpc('rechazar_knowledge', { knowledge_id: id });

      if (error) {
        console.warn("RPC rechazar_knowledge not found, running manual update");
        const { error: errManual } = await supabase
          .from('hotel_knowledge')
          .update({ is_active: false, status: 'stale' })
          .eq('id', id);
        if (errManual) throw errManual;
      }

      toast({
        title: "Entrada rechazada",
        description: "El conocimiento ha sido desactivado.",
        className: 'bg-rose-600 text-white border-none'
      });
      fetchKnowledge();
    } catch (error) {
      console.error("Error rejecting knowledge:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Create manual knowledge entry
  const handleCreateKnowledge = async (e) => {
    e.preventDefault();
    if (!newHotelId || !newQuestion.trim() || !newAnswer.trim()) {
      toast({ title: "Campos incompletos", description: "Por favor llena todos los campos obligatorios.", variant: "destructive" });
      return;
    }

    setSubmittingNew(true);
    try {
      const { error } = await supabase
        .from('hotel_knowledge')
        .insert([{
          hotel_id: newHotelId,
          pregunta: newQuestion,
          respuesta: newAnswer,
          categoria: newCategory,
          is_verified: true,
          status: 'verified',
          fuente: 'manual'
        }]);

      if (error) throw error;

      toast({
        title: "Conocimiento Creado",
        description: "Entrada añadida directamente como verificada.",
        className: 'bg-emerald-600 text-white border-none'
      });

      setShowCreateModal(false);
      setNewQuestion('');
      setNewAnswer('');
      setNewHotelId('');
      fetchKnowledge();
    } catch (error) {
      console.error("Error creating knowledge:", error);
      toast({ title: "Error al crear", description: error.message, variant: "destructive" });
    } finally {
      setSubmittingNew(false);
    }
  };

  // Semantic search
  const handleSemanticSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      // Llamamos a la RPC get_hotel_knowledge
      const rpcPayload = {
        pregunta: searchQuery
      };
      if (searchHotelId) {
        rpcPayload.hotel_id = searchHotelId;
      }

      const { data, error } = await supabase.rpc('get_hotel_knowledge', rpcPayload);
      
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error in semantic search:", error);
      toast({
        title: "Error en búsqueda",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-widest mb-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Módulo de Inteligencia Comercial
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            Hotel Knowledge Base <span className="text-amber-500 font-bold font-serif">🧠</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gestión de conocimiento canónico del catálogo y resolución de lagunas semánticas (gaps) reportadas por los agentes.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-amber-950/20 active:scale-95 text-sm border border-amber-500/20"
        >
          <Plus className="w-4 h-4" /> Crear Conocimiento
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-6 mb-8 text-sm font-semibold">
        {[
          { id: 'gaps', label: 'Lagunas de Conocimiento (Gaps)', icon: AlertTriangle, count: gaps.length },
          { id: 'knowledge', label: 'Base Canónica Verificada', icon: BookOpen },
          { id: 'search', label: 'Buscador Semántico', icon: Search }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-4 border-b-2 transition-all duration-200 relative ${
              activeTab === tab.id 
                ? 'border-amber-500 text-amber-500' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-600 text-[10px] font-black text-white">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters (only for gaps & knowledge) */}
      {activeTab !== 'search' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Filtrar por Hotel</label>
            <select
              value={selectedHotelFilter}
              onChange={(e) => setSelectedHotelFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">Todos los hoteles</option>
              {hotels.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          {activeTab === 'knowledge' && (
            <>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Categoría</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todas</option>
                  <option value="general">General</option>
                  <option value="habitaciones">Habitaciones</option>
                  <option value="gastronomia">Gastronomía</option>
                  <option value="servicios">Servicios</option>
                  <option value="politicas">Políticas y Términos</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Estado</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos</option>
                  <option value="verified">Verificado 🟢</option>
                  <option value="proposed">Propuesto 🟡</option>
                  <option value="stale">Obsoleto 🔴</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Contents */}
      
      {/* 1. Gaps Tab */}
      {activeTab === 'gaps' && (
        <div className="space-y-4">
          {loadingGaps ? (
            <div className="text-center py-12 text-slate-400">Cargando lagunas de conocimiento...</div>
          ) : gaps.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/35 border border-dashed border-slate-800 rounded-2xl text-slate-400">
              <CheckCircle className="w-12 h-12 text-teal-500/85 mx-auto mb-3" />
              <p className="font-bold text-slate-200">¡Sin lagunas de conocimiento!</p>
              <p className="text-xs mt-1 text-slate-500">Toda la información consultada por el bot de ventas está cubierta.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {gaps.map(gap => (
                <div 
                  key={gap.id} 
                  className="bg-slate-900/40 border border-slate-800 hover:border-amber-500/30 rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-lg bg-teal-950 text-teal-400 font-extrabold text-[10px] uppercase border border-teal-800/40">
                        🏨 {gap.hotel_nombre}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {new Date(gap.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-white text-sm mb-2 flex items-start gap-1.5">
                      <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      "{gap.pregunta_cliente}"
                    </h3>
                    
                    <p className="text-slate-400 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800/40 italic mb-4">
                      <span className="text-[10px] font-black text-slate-500 block uppercase not-italic mb-1">Respuesta dada por el Bot (Fallback):</span>
                      {gap.respuesta_dada}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-slate-800/40">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      Canal: <strong className="text-slate-400">{gap.fuente_canal}</strong> · Agente: <strong className="text-slate-400">{gap.agente}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedGap(gap)}
                      className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-950 font-extrabold rounded-xl transition-all duration-150 text-xs border border-amber-500/20"
                    >
                      Resolver Gap
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          {loadingKnowledge ? (
            <div className="text-center py-12 text-slate-400">Cargando base de conocimiento...</div>
          ) : knowledgeList.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/35 border border-dashed border-slate-800 rounded-2xl text-slate-400">
              <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="font-bold text-slate-200">Sin conocimiento registrado</p>
              <p className="text-xs mt-1 text-slate-500">Ajusta los filtros o añade conocimiento manualmente para comenzar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {knowledgeList.map(item => (
                <div 
                  key={item.id} 
                  className="bg-slate-900/30 border border-slate-850 hover:border-slate-800 rounded-2xl p-5 transition-all duration-150"
                >
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-slate-950 text-slate-300 font-extrabold text-[10px] border border-slate-800">
                        🏨 {item.hotels_master?.name}
                      </span>
                      <span className="px-2.5 py-0.5 rounded bg-amber-950/20 text-amber-500 font-extrabold text-[10px] uppercase border border-amber-900/30">
                        📂 {item.categoria}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded font-extrabold text-[10px] uppercase border ${
                        item.status === 'verified'
                          ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30'
                          : item.status === 'proposed'
                          ? 'bg-amber-950/30 text-amber-400 border-amber-900/40'
                          : 'bg-rose-950/20 text-rose-400 border-rose-900/30'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-500 font-bold uppercase">
                      Confianza: <strong className="text-teal-400">{item.confidence_score}%</strong> · Origen: <strong className="text-slate-400">{item.fuente}</strong>
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <h3 className="font-extrabold text-white text-sm flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">Q:</span>
                      {item.pregunta}
                    </h3>
                    <p className="text-slate-300 text-xs pl-6 flex items-start gap-2">
                      <span className="text-teal-400 shrink-0">A:</span>
                      {item.respuesta}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800/40">
                    {item.status === 'proposed' && (
                      <button
                        onClick={() => handleApproveKnowledge(item.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white font-extrabold rounded-lg transition-all duration-150 text-xs border border-emerald-500/20"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> Aprobar
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleRejectKnowledge(item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white font-extrabold rounded-lg transition-all duration-150 text-xs border border-rose-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {item.status === 'verified' ? 'Desactivar' : 'Rechazar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <form onSubmit={handleSemanticSearch} className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pregunta o Consulta Semántica</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Escribe tu consulta (Ej: ¿aceptan mascotas grandes en las habitaciones?)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Filtrar por Hotel (Opcional)</label>
                <select
                  value={searchHotelId}
                  onChange={(e) => setSearchHotelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Todos los hoteles</option>
                  {hotels.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={searching}
                className="flex items-center gap-2 px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl transition-all duration-150 active:scale-95 text-xs disabled:opacity-50"
              >
                {searching ? 'Buscando...' : 'Buscar Semánticamente'}
              </button>
            </div>
          </form>

          {/* Search Results */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" /> Resultados de Búsqueda
            </h3>

            {searching ? (
              <div className="text-center py-12 text-slate-400">Buscando en la base de datos vectorial...</div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/20 border border-slate-850 rounded-2xl text-slate-500 text-xs">
                Realiza una búsqueda para ver los resultados semánticos de pgvector.
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((result, idx) => (
                  <div 
                    key={idx} 
                    className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 font-extrabold text-[9px] border border-slate-850">
                          🏨 {result.hotel_nombre}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-teal-950/20 text-teal-400 font-extrabold text-[9px] uppercase border border-teal-900/20">
                          📂 {result.categoria}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-xs">Q: {result.pregunta}</h4>
                      <p className="text-slate-400 text-xs">A: {result.respuesta}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-1 rounded bg-teal-500/10 text-teal-400 text-[10px] font-black border border-teal-500/20">
                        Match: {Math.round(result.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESOLVE GAP MODAL */}
      {selectedGap && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" /> Resolver Laguna de Conocimiento
              </h2>
              <button 
                onClick={() => setSelectedGap(null)} 
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/60 space-y-2">
              <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-400 font-extrabold text-[9px] uppercase tracking-wider border border-teal-800/30">
                🏨 {selectedGap.hotel_nombre}
              </span>
              <p className="font-bold text-white text-sm">"{selectedGap.pregunta_cliente}"</p>
              <p className="text-[10px] text-slate-500">Gap ID: {selectedGap.id} · Fecha: {new Date(selectedGap.created_at).toLocaleString()}</p>
            </div>

            <form onSubmit={handleResolveGap} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Respuesta Oficial y Verificada (Canónica)</label>
                <textarea
                  value={resolveAnswer}
                  onChange={(e) => setResolveAnswer(e.target.value)}
                  placeholder="Escribe aquí la respuesta oficial que dará el bot de ahora en adelante..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Categoría de Información</label>
                  <select
                    value={resolveCategory}
                    onChange={(e) => setResolveCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="general">General</option>
                    <option value="habitaciones">Habitaciones</option>
                    <option value="gastronomia">Gastronomía (Restaurantes)</option>
                    <option value="servicios">Servicios y Facilidades</option>
                    <option value="politicas">Políticas, Términos y Check-in</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setSelectedGap(null)}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingResolve}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" /> {submittingResolve ? 'Publicando...' : 'Publicar y Resolver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MANUAL KNOWLEDGE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" /> Crear Entrada de Conocimiento
              </h2>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateKnowledge} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Hotel Asociado *</label>
                <select
                  value={newHotelId}
                  onChange={(e) => setNewHotelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="">Selecciona un hotel...</option>
                  {hotels.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pregunta o Escenario *</label>
                <input
                  type="text"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Ej: ¿Tienen cunas o camas para bebés?"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Respuesta Verificada *</label>
                <textarea
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="Ej: Sí, disponemos de cunas previa solicitud y sujeta a disponibilidad sin cargo adicional..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Categoría *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    required
                  >
                    <option value="general">General</option>
                    <option value="habitaciones">Habitaciones</option>
                    <option value="gastronomia">Gastronomía (Restaurantes)</option>
                    <option value="servicios">Servicios y Facilidades</option>
                    <option value="politicas">Políticas, Términos y Check-in</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNew}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  {submittingNew ? 'Guardando...' : 'Crear y Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
