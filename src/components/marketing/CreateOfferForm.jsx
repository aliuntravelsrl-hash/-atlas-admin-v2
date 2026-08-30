import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePaymentMethodsConfig } from '../../hooks/usePaymentMethodsConfig';
import { useFinancialValidation } from '../../hooks/useFinancialValidation';
import { FINANCIAL_RULES } from '../../constants/financialRules';

export const CreateOfferForm = () => {
  const navigate = useNavigate();
  
  // Estado del formulario
  const [formData, setFormData] = useState({
    // Información básica
    hotel_slug: '',
    title: '',
    description: '',
    
    // Financiero (CRÍTICO)
    base_cost: 0,
    base_price: 0,
    discount_percentage: 0,
    payment_method: 'visa',
    
    // Calculado automáticamente
    final_price: 0,
    fee_amount: 0,
    gross_margin: 0,
    net_margin: 0,
    net_margin_percentage: 0,
    
    // Inventario
    stock_total: 10,
    valid_from: '',
    valid_until: '',
    offer_type: 'flash_sale'
  });

  const [validation, setValidation] = useState({
    canPublish: false,
    errors: [],
    warnings: [],
    minimumPrice: null
  });

  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState([]);

  // Hooks
  const { paymentMethods, loading: loadingMethods } = usePaymentMethodsConfig();
  const { recalculateMargins } = useFinancialValidation(formData, setFormData, setValidation);

  // Cargar hoteles al montar
  useEffect(() => {
    loadHotels();
  }, []);

  // Recalcular cuando cambian campos financieros
  useEffect(() => {
    if (formData.base_cost > 0 && formData.base_price > 0) {
      recalculateMargins();
    }
  }, [
    formData.base_cost,
    formData.base_price,
    formData.discount_percentage,
    formData.payment_method,
    formData.valid_from,
    formData.valid_until,
    recalculateMargins
  ]);

  const loadHotels = async () => {
    try {
      const { data, error } = await supabase
        .from('hotels_master')
        .select('slug, name')
        .eq('publish', true)
        .order('name');
      
      if (error) throw error;
      setHotels(data || []);
    } catch (error) {
      console.error('Error loading hotels:', error);
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // VALIDACIÓN FINAL antes de enviar
    if (!validation.canPublish) {
      alert('❌ No se puede publicar: corrija los errores financieros primero');
      return;
    }
    
    if (!formData.net_margin || formData.net_margin <= 0) {
      alert('❌ Error: margen neto no calculado correctamente');
      return;
    }
    
    if (formData.net_margin_percentage < FINANCIAL_RULES.MINIMUM_NET_MARGIN_PERCENTAGE) {
      alert(`❌ Margen neto insuficiente: ${formData.net_margin_percentage.toFixed(2)}%`);
      return;
    }
    
    try {
      setLoading(true);
      
      // INSERTAR en marketing_offers
      const { data, error } = await supabase
        .from('marketing_offers')
        .insert({
          hotel_slug: formData.hotel_slug,
          title: formData.title,
          description: formData.description,
          base_cost: formData.base_cost,
          original_price: formData.base_price,
          discount_percentage: formData.discount_percentage,
          payment_method: formData.payment_method,
          stock_total: formData.stock_total,
          valid_from: formData.valid_from,
          valid_until: formData.valid_until,
          offer_type: formData.offer_type,
          approval_status: 'draft',
          publish_status: 'publicada',
          is_published: true
        })
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
      alert('✅ Oferta creada y publicada exitosamente (Pendiente de Aprobación Institucional)');
      navigate('/marketing/offers');
      
    } catch (error) {
      console.error('Error publishing offer:', error);
      if (error.message) {
        alert(`❌ Error: ${error.message}`);
      } else {
        alert('❌ Error al publicar oferta. Verifique los datos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!formData.hotel_slug || !formData.title) {
      alert('❌ Indique al menos el hotel y un título para guardar el borrador');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_offers')
        .insert({
          hotel_slug: formData.hotel_slug,
          title: formData.title,
          description: formData.description || '',
          base_cost: formData.base_cost || 0,
          original_price: formData.base_price || 0,
          discount_percentage: formData.discount_percentage || 0,
          payment_method: formData.payment_method || 'transferencia',
          stock_total: formData.stock_total || 1,
          valid_from: formData.valid_from,
          valid_until: formData.valid_until,
          offer_type: formData.offer_type || 'last_minute',
          approval_status: 'draft',
          publish_status: 'no_publicada',
          is_published: false
        })
        .select()
        .single();

      if (error) throw error;
      alert('💾 Borrador guardado exitosamente (Estado: Borrador / No publicada)');
      navigate('/marketing/offers');
    } catch (error) {
      console.error('Error saving draft:', error);
      alert(`❌ Error al guardar borrador: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  // Calcular duración de la oferta
  const calculateDuration = () => {
    if (!formData.valid_from || !formData.valid_until) return null;
    
    const from = new Date(formData.valid_from);
    const to = new Date(formData.valid_until);
    return Math.ceil((to - from) / (1000 * 60 * 60 * 24));
  };

  const duration = calculateDuration();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Crear Oferta de Marketing</h1>
        <p className="text-gray-600 mt-2">
          Todas las ofertas pasan validación financiera automática antes de la publicación
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECCIÓN 1: Información Básica */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-100">
          <h2 className="text-xl font-bold border-b pb-2 text-gray-800">Información Básica</h2>
          
          {/* Hotel */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Hotel <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.hotel_slug}
              onChange={(e) => handleFieldChange('hotel_slug', e.target.value)}
              className="w-full border rounded-lg p-2 bg-gray-50/50"
              required
            >
              <option value="">Seleccionar hotel...</option>
              {hotels.map((hotel) => (
                <option key={hotel.slug} value={hotel.slug}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Título de la Oferta <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="Ej: Hot Sale Febrero - Todo Incluido"
              className="w-full border rounded-lg p-2 bg-gray-50/50"
              maxLength={200}
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Descripción <span className="text-red-600">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={4}
              className="w-full border rounded-lg p-2 bg-gray-50/50"
              placeholder="Describe los detalles de la oferta..."
              required
            />
          </div>
        </div>

        {/* SECCIÓN 2: Financiero (CRÍTICO) */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-100">
          <h2 className="text-xl font-bold border-b pb-2 text-gray-800">
            💰 Información Financiera (CRÍTICO)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Costo Base */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Costo Base del Hotel <span className="text-red-600">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Costo neto real que cobra el hotel por la reserva
              </p>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  value={formData.base_cost}
                  onChange={(e) => handleFieldChange('base_cost', parseFloat(e.target.value) || 0)}
                  className="w-full border rounded-lg p-2 pl-8 bg-gray-50/50"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </div>

            {/* Precio Base de Venta */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Precio Base de Venta <span className="text-red-600">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Precio de venta al público antes de aplicar el descuento
              </p>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 font-semibold">$</span>
                <input
                  type="number"
                  value={formData.base_price}
                  onChange={(e) => handleFieldChange('base_price', parseFloat(e.target.value) || 0)}
                  className={`w-full border rounded-lg p-2 pl-8 bg-gray-50/50 ${
                    validation.errors.some(e => e.includes('Precio') || e.includes('margen')) ? 'border-red-500' : ''
                  }`}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              {validation.minimumPrice && formData.base_cost > 0 && (
                <p className="text-xs text-gray-500 mt-1 font-semibold">
                  💡 Precio mínimo recomendado: ${validation.minimumPrice.toFixed(2)}
                </p>
              )}
            </div>

            {/* Método de Pago */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Método de Pago Principal <span className="text-red-600">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Afecta el fee absorbido según pasarela
              </p>
              <select
                value={formData.payment_method}
                onChange={(e) => handleFieldChange('payment_method', e.target.value)}
                className="w-full border rounded-lg p-2 bg-gray-50/50"
                disabled={loadingMethods}
              >
                {loadingMethods ? (
                  <option>Cargando métodos...</option>
                ) : (
                  paymentMethods.map((method) => (
                    <option key={method.method_code} value={method.method_code}>
                      {method.method_name} ({method.fee_percentage}% fee)
                    </option>
                  ))
                )}
              </select>
              {formData.fee_amount > 0 && (
                <p className="text-xs text-orange-600 mt-1 font-semibold">
                  Fee de pasarela absorbido: ${formData.fee_amount.toFixed(2)}
                </p>
              )}
            </div>

            {/* Descuento */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Descuento (%)
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Porcentaje de descuento sobre precio de venta (Máx {FINANCIAL_RULES.MAX_DISCOUNT_PERCENTAGE}%)
              </p>
              <input
                type="number"
                value={formData.discount_percentage}
                onChange={(e) => handleFieldChange('discount_percentage', parseFloat(e.target.value) || 0)}
                className="w-full border rounded-lg p-2 bg-gray-50/50"
                min="0"
                max={FINANCIAL_RULES.MAX_DISCOUNT_PERCENTAGE}
                step="1"
              />
              {formData.discount_percentage > 0 && formData.final_price > 0 && (
                <p className="text-xs text-blue-600 mt-1 font-semibold">
                  Precio final con descuento: ${formData.final_price.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* PANEL DE MARGEN - SIEMPRE VISIBLE */}
        <div className={`p-5 rounded-lg border-2 ${
          validation.canPublish 
            ? 'bg-green-50 border-green-500 text-green-900' 
            : 'bg-red-50 border-red-500 text-red-900'
        }`}>
          <h3 className="font-bold mb-3 text-lg">📊 Análisis Financiero del Margen</h3>
          
          <div className="space-y-2 text-sm font-medium">
            {/* Margen Bruto */}
            <div className="flex justify-between">
              <span className="opacity-85">Margen Bruto:</span>
              <span className={`font-bold ${formData.gross_margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ${formData.gross_margin?.toFixed(2) || '0.00'}
              </span>
            </div>
            
            {/* Fee Absorbido */}
            <div className="flex justify-between">
              <span className="opacity-85">Comisión de Pasarela (Fee):</span>
              <span className="font-bold text-orange-600">
                -${formData.fee_amount?.toFixed(2) || '0.00'}
              </span>
            </div>
            
            {/* Margen Neto */}
            <div className="flex justify-between border-t border-current/20 pt-2">
              <span className="font-bold">Margen Neto (Utilidad Real):</span>
              <span className={`font-extrabold text-lg ${formData.net_margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                ${formData.net_margin?.toFixed(2) || '0.00'}
              </span>
            </div>
            
            {/* Porcentaje de Margen NETO */}
            <div className="flex justify-between">
              <span>% Margen Neto:</span>
              <span className={`font-black text-lg ${
                formData.net_margin_percentage >= FINANCIAL_RULES.RECOMMENDED_NET_MARGIN_PERCENTAGE ? 'text-green-700' : 
                formData.net_margin_percentage >= FINANCIAL_RULES.MINIMUM_NET_MARGIN_PERCENTAGE ? 'text-yellow-600' : 
                'text-red-700'
              }`}>
                {formData.net_margin_percentage?.toFixed(2) || '0.00'}%
              </span>
            </div>
          </div>
          
          {/* Errores */}
          {validation.errors.length > 0 && (
            <div className="mt-4 space-y-1 bg-red-100/50 p-3 rounded-lg border border-red-200">
              {validation.errors.map((error, idx) => (
                <p key={idx} className="text-red-700 text-xs font-semibold">❌ {error}</p>
              ))}
            </div>
          )}
          
          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="mt-4 space-y-1 bg-yellow-100/50 p-3 rounded-lg border border-yellow-200">
              {validation.warnings.map((warning, idx) => (
                <p key={idx} className="text-yellow-700 text-xs font-semibold">⚠️ {warning}</p>
              ))}
            </div>
          )}
          
          {/* Estado de Publicación */}
          <div className="mt-4 pt-4 border-t border-current/10 flex items-center justify-between">
            {validation.canPublish ? (
              <div className="flex items-center text-green-700 font-bold">
                <span className="text-xl mr-2">✅</span>
                <span>Cumple con las directrices financieras (Margen &gt;= 15%)</span>
              </div>
            ) : (
              <div className="flex items-center text-red-700 font-bold">
                <span className="text-xl mr-2">❌</span>
                <span>No cumple con las directrices financieras</span>
              </div>
            )}
          </div>
        </div>

        {/* SECCIÓN 3: Inventario y Fechas */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-100">
          <h2 className="text-xl font-bold border-b pb-2 text-gray-800">Inventario y Fechas</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Stock Total */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Stock Total <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                value={formData.stock_total}
                onChange={(e) => handleFieldChange('stock_total', parseInt(e.target.value) || 0)}
                className="w-full border rounded-lg p-2 bg-gray-50/50"
                min="1"
                required
              />
            </div>

            {/* Válida Desde */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Válida Desde <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.valid_from}
                onChange={(e) => handleFieldChange('valid_from', e.target.value)}
                className={`w-full border rounded-lg p-2 bg-gray-50/50 ${
                  validation.errors.some(e => e.includes('Fecha')) ? 'border-red-500' : ''
                }`}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {/* Válida Hasta */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Válida Hasta <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={(e) => handleFieldChange('valid_until', e.target.value)}
                className={`w-full border rounded-lg p-2 bg-gray-50/50 ${
                  validation.errors.some(e => e.includes('Fecha')) ? 'border-red-500' : ''
                }`}
                min={formData.valid_from || new Date().toISOString().split('T')[0]}
                required
              />
              {duration !== null && (
                <p className={`text-xs mt-1.5 font-semibold ${
                  duration > FINANCIAL_RULES.MAX_OFFER_DURATION_DAYS ? 'text-red-600' : 'text-gray-500'
                }`}>
                  Duración: {duration} días
                  {duration > FINANCIAL_RULES.MAX_OFFER_DURATION_DAYS && ' (Máximo permitido: 30 días)'}
                </p>
              )}
            </div>
          </div>

          {/* Tipo de Oferta */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Tipo de Oferta
            </label>
            <select
              value={formData.offer_type}
              onChange={(e) => handleFieldChange('offer_type', e.target.value)}
              className="w-full border rounded-lg p-2 bg-gray-50/50"
            >
              <option value="flash_sale">Flash Sale</option>
              <option value="early_bird">Early Bird</option>
              <option value="last_minute">Last Minute</option>
              <option value="special">Especial</option>
            </select>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex gap-3 pt-6 border-t border-gray-100 justify-end">
          {/* Cancelar */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold transition-colors"
          >
            Cancelar
          </button>
          
          {/* Guardar como Borrador */}
          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold transition-colors"
          >
            💾 Guardar Borrador
          </button>
          
          {/* Publicar (CON validaciones) */}
          <button
            type="submit"
            disabled={!validation.canPublish || loading}
            className={`px-6 py-2.5 rounded-lg font-bold shadow-sm transition-colors ${
              validation.canPublish && !loading
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-transparent'
            }`}
          >
            {loading ? '⏳ Publicando...' : '🚀 Publicar Oferta'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOfferForm;
