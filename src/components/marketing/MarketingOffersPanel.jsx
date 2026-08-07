import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketingService } from '../../services/marketingService';

export const MarketingOffersPanel = () => {
  const navigate = useNavigate();
  
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    hotel_slug: null,
    offer_type: null,
    search: ''
  });

  useEffect(() => {
    loadData();
  }, [filters.status]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Cargar ofertas
      const offersData = await marketingService.getAllOffers({
        status: filters.status,
        page: 1,
        limit: 50
      });
      setOffers(offersData.data || []);
      
      // Cargar estadísticas
      const statsData = await marketingService.getMarketingStats();
      setStats(statsData);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (offerId, currentStatus) => {
    try {
      await marketingService.toggleOfferStatus(offerId, !currentStatus);
      await loadData(); // Recargar datos
    } catch (error) {
      console.error('Error toggling status:', error);
      alert('Error al cambiar estado de la oferta');
    }
  };

  const handleApprove = async (offerId) => {
    if (!confirm('¿Aprobar institucionalmente esta oferta? Queda registrado quién y cuándo.')) return;
    try {
      const approvedBy = window.currentUser?.email || window.currentUser?.name || 'director';
      await marketingService.approveOffer(offerId, approvedBy);
      await loadData(); // Recargar datos
    } catch (error) {
      console.error('Error approving offer:', error);
      alert('Error al aprobar oferta');
    }
  };

  const handleDelete = async (offerId) => {
    if (!confirm('¿Está seguro de eliminar esta oferta?')) return;
    
    try {
      await marketingService.deleteOffer(offerId);
      await loadData(); // Recargar datos
    } catch (error) {
      console.error('Error deleting offer:', error);
      alert('Error al eliminar oferta');
    }
  };

  const filteredOffers = offers.filter(offer => {
    if (filters.hotel_slug && offer.hotel_slug !== filters.hotel_slug) return false;
    if (filters.offer_type && offer.offer_type !== filters.offer_type) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        offer.title?.toLowerCase().includes(search) ||
        offer.hotel_slug?.toLowerCase().includes(search) ||
        offer.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Cargando ofertas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ofertas de Marketing</h1>
          <p className="text-gray-600 mt-1">Gestión centralizada de ofertas</p>
        </div>
        <button 
          onClick={() => navigate('/marketing/offers/new')}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold shadow-sm transition-colors"
        >
          + Nueva Oferta
        </button>
      </div>

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
            <div className="text-sm text-gray-500 font-semibold">Total Ofertas</div>
            <div className="text-3xl font-black text-blue-600 mt-1">{stats.total_offers}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
            <div className="text-sm text-gray-500 font-semibold">Ofertas Activas</div>
            <div className="text-3xl font-black text-green-600 mt-1">{stats.active_offers}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
            <div className="text-sm text-gray-500 font-semibold">Revenue Total</div>
            <div className="text-3xl font-black text-purple-600 mt-1">
              ${stats.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-100">
            <div className="text-sm text-gray-500 font-semibold">Stock Disponible</div>
            <div className="text-3xl font-black text-orange-600 mt-1">{stats.total_stock_available}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Estado */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
            <select
              value={filters.offer_type || ''}
              onChange={(e) => setFilters({...filters, offer_type: e.target.value || null})}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
            >
              <option value="">Todos</option>
              <option value="flash_sale">Flash Sale</option>
              <option value="early_bird">Early Bird</option>
              <option value="last_minute">Last Minute</option>
              <option value="special">Especial</option>
            </select>
          </div>

          {/* Hotel */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Hotel</label>
            <input
              type="text"
              placeholder="Slug del hotel"
              value={filters.hotel_slug || ''}
              onChange={(e) => setFilters({...filters, hotel_slug: e.target.value || null})}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
            />
          </div>

          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Título, hotel..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50"
            />
          </div>
        </div>
      </div>

      {/* Lista de ofertas */}
      <div className="bg-white rounded-lg shadow overflow-x-auto border border-gray-100">
        {filteredOffers.length === 0 ? (
          <div className="text-center p-8 text-gray-500">
            No hay ofertas que coincidan con los filtros
          </div>
        ) : (
          <table className="w-full min-w-max table-auto">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Oferta</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Precio</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Margen Neto</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Fechas</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOffers.map((offer) => (
                <OfferRow
                  key={offer.id}
                  offer={offer}
                  onToggleStatus={handleToggleStatus}
                  onDelete={handleDelete}
                  onApprove={handleApprove}
                  onEdit={() => navigate(`/marketing/offers/${offer.id}/edit`)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const OfferRow = ({ offer, onToggleStatus, onDelete, onApprove, onEdit }) => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    loadMetrics();
  }, [offer.id]);

  const loadMetrics = async () => {
    try {
      const data = await marketingService.getOfferMetrics(offer.id);
      setMetrics(data);
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  };

  const stockPercentage = offer.stock_total > 0
    ? ((offer.stock_sold || 0) / offer.stock_total * 100)
    : 0;

  const isExpired = new Date(offer.valid_until) < new Date();
  const isActive = offer.is_active && !isExpired;

  return (
    <tr className={`hover:bg-gray-50/50 transition-colors ${!isActive ? 'opacity-60 bg-gray-50/30' : ''}`}>
      {/* Estado */}
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
          isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {isActive ? '✅ Activa' : '⏸️ Inactiva'}
        </span>
        {isExpired && (
          <span className="block text-[10px] text-red-600 mt-1 font-semibold">⏰ Expirada</span>
        )}
        {/* Estado institucional (Dual State) - independiente del operativo de arriba */}
        <span className={`block text-[10px] mt-1 font-semibold ${
          offer.approval_status === 'approved' ? 'text-blue-600' : 'text-amber-600'
        }`}>
          {offer.approval_status === 'approved' ? '🏛️ Aprobada' : '🏛️ Sin aprobar'}
        </span>
      </td>

      {/* Oferta */}
      <td className="px-6 py-4">
        <div className="font-semibold text-gray-900">{offer.title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{offer.hotel_slug}</div>
        <div className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 inline-block mt-1 uppercase font-semibold">
          {offer.offer_type?.replace('_', ' ')}
        </div>
      </td>

      {/* Precio */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-bold text-blue-600">
          ${offer.final_price?.toFixed(2)}
        </div>
        {offer.discount_percentage > 0 && (
          <div className="text-xs text-gray-400 line-through">
            ${offer.base_price?.toFixed(2)}
          </div>
        )}
        {offer.discount_percentage > 0 && (
          <div className="text-[10px] text-red-500 font-bold mt-0.5">
            -{offer.discount_percentage}% desc
          </div>
        )}
      </td>

      {/* Margen Neto */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className={`font-bold ${
          offer.net_margin_percentage >= 20 ? 'text-green-600' :
          offer.net_margin_percentage >= 15 ? 'text-yellow-600' :
          'text-red-600'
        }`}>
          {offer.net_margin_percentage?.toFixed(2)}%
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          ${offer.net_margin?.toFixed(2)} USD
        </div>
      </td>

      {/* Stock */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-xs font-semibold text-gray-700">
          {offer.stock_sold || 0} / {offer.stock_total} vendidas
        </div>
        <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full transition-all ${
              stockPercentage > 85 ? 'bg-red-500' :
              stockPercentage > 50 ? 'bg-yellow-500' :
              'bg-green-500'
            }`}
            style={{ width: `${Math.min(stockPercentage, 100)}%` }}
          />
        </div>
        {metrics && (
          <div className="text-[10px] text-gray-400 mt-1 font-semibold">
            Conv: {metrics.conversion_rate}%
          </div>
        )}
      </td>

      {/* Fechas */}
      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
        <div>
          <span className="font-semibold text-gray-400">Inicio:</span>{' '}
          {new Date(offer.valid_from).toLocaleDateString()}
        </div>
        <div className="mt-1">
          <span className="font-semibold text-gray-400">Fin:</span>{' '}
          {new Date(offer.valid_until).toLocaleDateString()}
        </div>
      </td>

      {/* Acciones */}
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex gap-1.5">
          {offer.approval_status !== 'approved' && (
            <button
              onClick={() => onApprove(offer.id)}
              className="p-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              title="Aprobar institucionalmente (Dual State)"
            >
              🏛️
            </button>
          )}
          <button
            onClick={() => onToggleStatus(offer.id, offer.is_active)}
            className={`p-1.5 rounded transition-colors ${
              offer.is_active
                ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
            title={offer.is_active ? 'Pausar oferta' : 'Activar oferta'}
          >
            {offer.is_active ? '⏸️' : '▶️'}
          </button>
          
          <button
            onClick={onEdit}
            className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            title="Editar oferta"
          >
            ✏️
          </button>
          
          <button
            onClick={() => onDelete(offer.id)}
            className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            title="Eliminar oferta"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
};

export default MarketingOffersPanel;
