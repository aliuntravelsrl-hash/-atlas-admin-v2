import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import HotelCommercialProfileTab from './HotelCommercialProfileTab';

export const IntegrityMonitor = () => {
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditResults, setAuditResults] = useState(null);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [activeTab, setActiveTab] = useState('technical'); // 'technical' | 'commercial'

  useEffect(() => {
    loadHotels();
  }, []);

  const loadHotels = async () => {
    try {
      setLoadingHotels(true);
      const { data, error } = await supabase
        .from('hotels_master')
        .select('id, name, slug, zone, stars')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setHotels(data || []);
      if (data && data.length > 0) {
        setSelectedHotelId(data[0].id);
        runAudit(data[0].id);
      }
      setLoadingHotels(false);
    } catch (error) {
      console.error('Error loading hotels for Integrity Monitor:', error);
      setLoadingHotels(false);
    }
  };

  const runAudit = async (hotelId) => {
    if (!hotelId) return;
    try {
      setAuditing(true);
      
      // Invocar webhook de n8n para auditar a demanda
      try {
        await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/integrity-audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ hotel_id: hotelId })
        });
      } catch (e) {
        console.warn('n8n integrity-audit webhook error (proceeding with local DB check):', e);
      }
      
      // 1. Obtener hotel de hotels_master
      const { data: hotel, error: hotelError } = await supabase
        .from('hotels_master')
        .select('id, name, slug, gallery_data, services_data, restaurants_data, page_structure')
        .eq('id', hotelId)
        .single();

      if (hotelError) throw hotelError;

      // 2. Obtener habitaciones en tabla rooms
      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('id')
        .eq('hotel_id', hotelId);

      if (roomsError) throw roomsError;

      // 3. Obtener tarifas en tabla rates cruzando con roomIds
      let ratesCount = 0;
      if (rooms && rooms.length > 0) {
        const roomIds = rooms.map(r => r.id);
        const { count, error: ratesError } = await supabase
          .from('rates')
          .select('id', { count: 'exact', head: true })
          .in('room_id', roomIds);
        
        if (!ratesError) ratesCount = count || 0;
      }

      // 4. Obtener temporadas en seasons
      const { count: seasonsCount, error: seasonsError } = await supabase
        .from('seasons')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId);

      // --- CALCULADORA DE SELLOS DEL MOLDE DE HIERRO ---

      // Check 1: Galería (mínimo 8 fotos)
      const gallery = hotel.gallery_data || [];
      const galleryCount = Array.isArray(gallery) ? gallery.length : 0;
      const checkGallery = {
        name: 'Galería de Imágenes',
        description: 'Mínimo 8 fotos de alta resolución del hotel.',
        status: galleryCount >= 8 ? 'PASSED' : 'FAILED',
        current: galleryCount,
        required: 8,
        icon: '🖼️'
      };

      // Check 2: Servicios (mínimo 1)
      const services = hotel.services_data || [];
      const servicesCount = Array.isArray(services) ? services.length : 0;
      const checkServices = {
        name: 'Servicios y Amenidades',
        description: 'Listado de servicios generales del resort.',
        status: servicesCount >= 1 ? 'PASSED' : 'INCOMPLETE',
        current: servicesCount,
        required: 1,
        icon: '🛎️'
      };

      // Check 3: Habitaciones (al menos 1 habitación)
      const roomsCount = rooms?.length || 0;
      const checkRooms = {
        name: 'Inventario de Habitaciones',
        description: 'Habitaciones cargadas en la base de datos.',
        status: roomsCount > 0 ? 'PASSED' : 'FAILED',
        current: roomsCount,
        required: 1,
        icon: '🛏️'
      };

      // Check 4: Tarifas (al menos 1 tarifa cargada)
      const checkRates = {
        name: 'Tarifario de Precios',
        description: 'Registros de tarifas activos en tabla de precios.',
        status: ratesCount > 0 ? 'PASSED' : 'FAILED',
        current: ratesCount,
        required: 1,
        icon: '💵'
      };

      // Check 5: Temporadas (al menos 1 definida)
      const seasonsActual = seasonsCount || 0;
      const checkSeasons = {
        name: 'Calendario de Temporadas',
        description: 'Fechas de temporadas altas/bajas configuradas.',
        status: seasonsActual > 0 ? 'PASSED' : 'INCOMPLETE',
        current: seasonsActual,
        required: 1,
        icon: '📅'
      };

      // Check 6: Restaurantes y Gastronomía
      const restaurants = hotel.restaurants_data || [];
      const restCount = Array.isArray(restaurants) ? restaurants.length : 0;
      const checkRestaurants = {
        name: 'Oferta Gastronómica',
        description: 'Información culinaria y restaurantes del resort.',
        status: restCount > 0 ? 'PASSED' : 'INCOMPLETE',
        current: restCount,
        required: 1,
        icon: '🍽️'
      };

      // Check 7: Políticas y Términos
      const hasPolicies = !!(hotel.page_structure?.policies || hotel.page_structure?.rules);
      const checkPolicies = {
        name: 'Políticas y Términos',
        description: 'Condiciones de cancelación y reglas de estadía.',
        status: hasPolicies ? 'PASSED' : 'INCOMPLETE',
        current: hasPolicies ? 1 : 0,
        required: 1,
        icon: '📜'
      };

      const checks = [
        checkGallery,
        checkServices,
        checkRooms,
        checkRates,
        checkSeasons,
        checkRestaurants,
        checkPolicies
      ];

      const passedCount = checks.filter(c => c.status === 'PASSED').length;
      const score = passedCount;
      const canPublish = passedCount >= 4;

      setAuditResults({
        hotelName: hotel.name,
        hotelSlug: hotel.slug,
        score,
        canPublish,
        checks
      });

      setAuditing(false);
    } catch (error) {
      console.error('Error running hotel audit:', error);
      setAuditing(false);
    }
  };

  const filteredHotels = hotels.filter(h =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 bg-slate-950 p-6 rounded-2xl border border-slate-800 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            Integrity Monitor <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full uppercase tracking-wider font-extrabold border border-blue-500/30">Audit</span>
          </h1>
          <p className="text-slate-400 mt-1 font-medium">
            Verificador de consistencia del Molde de Hierro para Hoteles en Aliun Travel.
          </p>
        </div>
        <button
          onClick={() => runAudit(selectedHotelId)}
          disabled={auditing || !selectedHotelId}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold px-5 py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-50"
        >
          {auditing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
            </svg>
          )}
          <span>Re-Audit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Selector de Hotel */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="font-bold text-white text-lg flex items-center gap-2">
            <span>🏨 Selector de Resorts</span>
          </h3>
          
          {/* Buscador */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar hotel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 focus:border-blue-500 text-slate-100 rounded-xl px-4 py-2.5 outline-none transition text-sm font-semibold"
            />
            <span className="absolute right-3.5 top-3.5 text-slate-500">🔍</span>
          </div>

          {/* Lista de Hoteles */}
          <div className="max-h-96 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
            {loadingHotels ? (
              <div className="text-center py-8 text-slate-500 font-medium">Cargando listado...</div>
            ) : filteredHotels.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-medium">No se encontraron hoteles</div>
            ) : (
              filteredHotels.map(h => (
                <button
                  key={h.id}
                  onClick={() => {
                    setSelectedHotelId(h.id);
                    runAudit(h.id);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl transition-all border font-semibold flex items-center justify-between ${
                    selectedHotelId === h.id
                      ? 'bg-blue-600/10 border-blue-500/50 text-white'
                      : 'bg-slate-950 hover:bg-slate-900 border-slate-850 text-slate-400'
                  }`}
                >
                  <span className="truncate">{h.name}</span>
                  <span className="text-xs opacity-60">⭐ {h.stars}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Panel de Resultados de Auditoria */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
          {auditing ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-medium animate-pulse">Auditando bases de datos de Supabase...</p>
            </div>
          ) : auditResults ? (
            <>
              {/* Resumen de Auditoría */}
              <div className="flex flex-col sm:flex-row items-center justify-between p-5 rounded-2xl bg-slate-950 border border-slate-850 gap-4">
                <div>
                  <h3 className="font-extrabold text-white text-xl truncate max-w-sm">{auditResults.hotelName}</h3>
                  <p className="text-xs text-slate-400 mt-1 font-mono">ID: {selectedHotelId} | Slug: {auditResults.hotelSlug}</p>
                </div>
                <div className="flex items-center gap-6">
                  {/* Health Score */}
                  <div className="text-center bg-slate-900 border border-slate-800/80 px-4 py-3 rounded-xl min-w-[100px]">
                    <div className="text-2xl font-black text-white">{auditResults.score}/7</div>
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider mt-0.5">Health Score</div>
                  </div>
                  
                  {/* Publicación Badge */}
                  <div className={`px-4 py-3 rounded-xl text-center min-w-[130px] border ${
                    auditResults.canPublish
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                  }`}>
                    <div className="text-sm font-black uppercase tracking-wider">
                      {auditResults.canPublish ? 'Apto' : 'Rechazado'}
                    </div>
                    <div className="text-[10px] opacity-75 font-semibold mt-0.5">
                      {auditResults.canPublish ? 'Para Publicación' : 'Incompleto'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Selector de Pestañas de Alto Nivel */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setActiveTab('technical')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'technical'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-850'
                  }`}
                >
                  <span>🛠️</span>
                  <span>Integridad Técnica (Molde de Hierro)</span>
                </button>
                <button
                  onClick={() => setActiveTab('commercial')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'commercial'
                      ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-850'
                  }`}
                >
                  <span>💼</span>
                  <span>Relación Comercial B2B & ROI</span>
                </button>
              </div>

              {activeTab === 'commercial' ? (
                <HotelCommercialProfileTab hotel={auditResults} auditResults={auditResults} />
              ) : (
                <>
                  {/* Barra de progreso */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-400">
                      <span>Porcentaje de Integridad Comercial</span>
                      <span>{Math.round((auditResults.score / 7) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-850">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          auditResults.score === 7
                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                            : auditResults.score >= 4
                              ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                              : 'bg-gradient-to-r from-rose-600 to-rose-400'
                        }`}
                        style={{ width: `${(auditResults.score / 7) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Tabla de Verificaciones */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider">Sellos del Molde de Hierro</h4>
                    
                    <div className="divide-y divide-slate-800/60 border border-slate-850 rounded-2xl overflow-hidden bg-slate-950">
                      {auditResults.checks.map((check, index) => (
                        <div key={index} className="flex items-center justify-between p-4 hover:bg-slate-900/50 transition">
                          
                          {/* Izquierda: Info check */}
                          <div className="flex items-start gap-3">
                            <span className="text-2xl mt-0.5">{check.icon}</span>
                            <div>
                              <div className="font-bold text-white text-sm">{check.name}</div>
                              <div className="text-xs text-slate-400 mt-0.5 font-medium">{check.description}</div>
                            </div>
                          </div>

                          {/* Derecha: Estado */}
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="text-sm font-extrabold text-white">{check.current}</span>
                              <span className="text-slate-500 text-xs"> / req: {check.required}</span>
                            </div>
                            <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                              check.status === 'PASSED'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                : check.status === 'INCOMPLETE'
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                            }`}>
                              {check.status}
                            </span>
                          </div>

                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-32 text-slate-500 font-semibold">Seleccione un hotel para ver el reporte de integridad</div>
          )}
        </div>

      </div>

    </div>
  );
};

export default IntegrityMonitor;
