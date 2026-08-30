import { supabase } from '../lib/supabaseClient';

export const marketingService = {
  /**
   * Obtener ofertas activas para marketing
   * @param {Object} filters - Filtros opcionales
   * @param {string} filters.hotel_slug - Filtrar por hotel
   * @param {string} filters.offer_type - Filtrar por tipo
   * @param {number} filters.min_score - Score mínimo
   * @param {number} filters.limit - Límite de resultados (default 20)
   * @returns {Promise<Array>} Lista de ofertas activas
   */
  async getActiveOffers(filters = {}) {
    try {
      const { data, error } = await supabase
        .rpc('rpc_get_marketing_active_offers', {
          p_hotel_slug: filters.hotel_slug || null,
          p_offer_type: filters.offer_type || null,
          p_min_score: filters.min_score || 0,
          p_limit: filters.limit || 20
        });
      
      if (error) {
        console.error('Error fetching active offers:', error);
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error in getActiveOffers:', error);
      throw error;
    }
  },

  /**
   * Calcular score de atractividad de una oferta
   * @param {string} offerId - UUID de la oferta
   * @returns {Promise<Object>} Score y recomendación
   */
  async getOfferScore(offerId) {
    try {
      const { data, error } = await supabase
        .rpc('rpc_calculate_offer_score', {
          p_offer_id: offerId
        });
      
      if (error) {
        console.error('Error calculating offer score:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in getOfferScore:', error);
      throw error;
    }
  },

  /**
   * Obtener todas las ofertas (con paginación)
   * @param {Object} options - Opciones de consulta
   * @param {number} options.page - Número de página (default 1)
   * @param {number} options.limit - Resultados por página (default 20)
   * @param {string} options.status - Filtrar por estado (active, inactive, all)
   * @returns {Promise<Object>} { data, total, page, limit }
   */
  async getAllOffers(options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('marketing_offers')
        .select('*', { count: 'exact' });
      
      // Filtrar por estado
      if (options.status === 'active') {
        query = query.eq('is_published', true);
      } else if (options.status === 'inactive') {
        query = query.eq('is_published', false);
      }
      
      // Ordenar y paginar
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      return {
        data: data || [],
        total: count || 0,
        page,
        limit
      };
    } catch (error) {
      console.error('Error in getAllOffers:', error);
      throw error;
    }
  },

  /**
   * Obtener una oferta por ID
   * @param {string} offerId - UUID de la oferta
   * @returns {Promise<Object>} Oferta completa
   */
  async getOfferById(offerId) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .select('*')
        .eq('id', offerId)
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error in getOfferById:', error);
      throw error;
    }
  },

  /**
   * Crear nueva oferta de marketing
   * ⚠️ Validación automática por trigger backend
   * @param {Object} offerData - Datos de la oferta
   * @returns {Promise<Object>} Oferta creada
   */
  async createOffer(offerData) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .insert({
          hotel_slug: offerData.hotel_slug,
          title: offerData.title,
          description: offerData.description,
          base_cost: offerData.base_cost,
          base_price: offerData.base_price,
          discount_percentage: offerData.discount_percentage || 0,
          payment_method: offerData.payment_method,
          stock_total: offerData.stock_total,
          valid_from: offerData.valid_from,
          valid_until: offerData.valid_until,
          offer_type: offerData.offer_type || 'flash_sale',
          is_active: true,
          is_published: true
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating offer:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in createOffer:', error);
      throw error;
    }
  },

  /**
   * Actualizar oferta existente
   * @param {string} offerId - UUID de la oferta
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<Object>} Oferta actualizada
   */
  async updateOffer(offerId, updates) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .update(updates)
        .eq('id', offerId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error in updateOffer:', error);
      throw error;
    }
  },

  /**
   * Pausar/activar oferta manualmente
   * @param {string} offerId - UUID de la oferta
   * @param {boolean} isActive - Nuevo estado
   * @returns {Promise<Object>} Oferta actualizada
   */
  async toggleOfferStatus(offerId, isPublished) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .update({ 
          is_published: isPublished,
          publish_status: isPublished ? 'publicada' : 'pausada',
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error in toggleOfferStatus:', error);
      throw error;
    }
  },

  /**
   * Aprobar oferta institucionalmente (Dual State - MKT-DUALSTATE-001)
   * Distinto de is_published/publish_status (estado operativo): esto escribe
   * el estado INSTITUCIONAL real (approval_status) y persiste la evidencia
   * en marketing_decision_evidence (MKT-DEP-001 / MARKETING-OFFER-CREATION-CONTRACT-001).
   * @param {string} offerId - UUID de la oferta
   * @param {string} approvedBy - identificador de quien aprueba (ej. email/nombre del Director)
   * @returns {Promise<Object>} Oferta actualizada
   */
  async approveOffer(offerId, approvedBy) {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('marketing_offers')
        .update({
          approval_status: 'approved',
          approved_by: approvedBy,
          approved_at: now,
          updated_at: now
        })
        .eq('id', offerId)
        .select()
        .single();

      if (error) throw error;

      // Registrar evidencia de decisión institucional (MKT-DEP-001 / MARKETING-OFFER-CREATION-CONTRACT-001)
      try {
        await supabase
          .from('marketing_decision_evidence')
          .insert({
            offer_id: offerId,
            decision: 'approved',
            decided_by: approvedBy,
            authority_level: approvedBy === 'director' ? 'director' : 'authorized_operator',
            evidence: {
              action: 'institutional_approval',
              source: 'atlas-admin-panel',
              approved_at: now
            },
            decided_at: now
          });
      } catch (depErr) {
        console.warn('Advertencia registrando marketing_decision_evidence:', depErr);
      }

      return data;
    } catch (error) {
      console.error('Error in approveOffer:', error);
      throw error;
    }
  },

  /**
   * Incrementar stock vendido
   * @param {string} offerId - UUID de la oferta
   * @param {number} quantity - Cantidad vendida (default 1)
   * @returns {Promise<Object>} Oferta actualizada
   */
  async incrementStockSold(offerId, quantity = 1) {
    try {
      const offer = await this.getOfferById(offerId);
      
      if (!offer) {
        throw new Error('Oferta no encontrada');
      }
      
      const newStockSold = (offer.stock_sold || 0) + quantity;
      
      const { data, error } = await supabase
        .from('marketing_offers')
        .update({ 
          stock_sold: newStockSold,
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error in incrementStockSold:', error);
      throw error;
    }
  },

  /**
   * Obtener métricas de una oferta
   * @param {string} offerId - UUID de la oferta
   * @returns {Promise<Object>} Métricas de la oferta
   */
  async getOfferMetrics(offerId) {
    try {
      const { count: conversions, error: countError } = await supabase
        .from('atlas_offers')
        .select('*', { count: 'exact', head: true })
        .eq('marketing_offer_id', offerId)
        .eq('status', 'confirmed');
      
      if (countError) throw countError;
      
      const offer = await this.getOfferById(offerId);
      
      if (!offer) {
        throw new Error('Oferta no encontrada');
      }
      
      const revenue = (conversions || 0) * (offer.final_price || 0);
      
      const conversionRate = offer.stock_total > 0 
        ? ((offer.stock_sold || 0) / offer.stock_total * 100).toFixed(2)
        : 0;
      
      return {
        conversions: conversions || 0,
        stock_sold: offer.stock_sold || 0,
        stock_total: offer.stock_total,
        stock_available: offer.stock_total - (offer.stock_sold || 0),
        revenue: parseFloat(revenue.toFixed(2)),
        conversion_rate: parseFloat(conversionRate),
        net_margin: offer.net_margin,
        net_margin_percentage: offer.net_margin_percentage
      };
    } catch (error) {
      console.error('Error in getOfferMetrics:', error);
      throw error;
    }
  },

  /**
   * Eliminar oferta (soft delete)
   * @param {string} offerId - UUID de la oferta
   * @returns {Promise<Object>} Oferta eliminada
   */
  async deleteOffer(offerId) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .update({ 
          is_active: false,
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', offerId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error in deleteOffer:', error);
      throw error;
    }
  },

  /**
   * Buscar ofertas por texto
   * @param {string} searchText - Texto a buscar
   * @returns {Promise<Array>} Ofertas que coinciden
   */
  async searchOffers(searchText) {
    try {
      const { data, error } = await supabase
        .from('marketing_offers')
        .select('*')
        .or(`title.ilike.%${searchText}%,description.ilike.%${searchText}%,hotel_slug.ilike.%${searchText}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error in searchOffers:', error);
      throw error;
    }
  },

  /**
   * Obtener estadísticas generales de marketing
   * @returns {Promise<Object>} Estadísticas generales
   */
  async getMarketingStats() {
    try {
      const { count: activeCount } = await supabase
        .from('marketing_offers')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true);
      
      const { count: totalCount } = await supabase
        .from('marketing_offers')
        .select('*', { count: 'exact', head: true });
      
      const { data: offers } = await supabase
        .from('marketing_offers')
        .select('final_price, stock_sold');
      
      const totalRevenue = (offers || []).reduce((sum, offer) => {
        return sum + ((offer.final_price || 0) * (offer.stock_sold || 0));
      }, 0);
      
      const { data: activeOffers } = await supabase
        .from('marketing_offers')
        .select('stock_total, stock_sold')
        .eq('is_published', true);
      
      const totalStockAvailable = (activeOffers || []).reduce((sum, offer) => {
        return sum + (offer.stock_total - (offer.stock_sold || 0));
      }, 0);
      
      return {
        total_offers: totalCount || 0,
        active_offers: activeCount || 0,
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        total_stock_available: totalStockAvailable
      };
    } catch (error) {
      console.error('Error in getMarketingStats:', error);
      throw error;
    }
  }
};

export default marketingService;
