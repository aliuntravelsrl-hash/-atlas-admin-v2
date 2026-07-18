import { supabase } from '@/lib/customSupabaseClient';
import { ErrorHandler } from '@/utils/ErrorHandler';
import { productionLogger } from '@/utils/productionLogger';

// Helper for UUID validation
const validateUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * HotelService v6.8 - Fixed Deduplication, Logging & UUID Validation
 */
export const hotelService = {
  
  // =================================================================
  //  CORE HOTEL METHODS
  // =================================================================

  async getHotelsForAdmin() {
     try {
       console.log('🔍 [hotelService] Fetching hotels for Admin (hotels_master)...');
       
       const { data, error } = await supabase
        .from('hotels_master')
        .select(`
            id, name, slug, zone, location, stars, rating, publish, status,
            description, long_description, address, phone, email,
            latitude, longitude, video_id, about_image,
            gallery_data, rooms_data, services_data, restaurants_data, page_structure,
            highlights, amenities, created_at, updated_at
        `)
        .order('name');

       if (error) throw error;
       
       return data.map(h => ({ 
           ...h, 
           is_active: h.publish,
           image_url: h.about_image || (Array.isArray(h.gallery_data) && h.gallery_data[0]) || null,
           gallery_data: Array.isArray(h.gallery_data) ? h.gallery_data : [],
           rooms_data: Array.isArray(h.rooms_data) ? h.rooms_data : [],
           services_data: Array.isArray(h.services_data) ? h.services_data : [],
           restaurants_data: Array.isArray(h.restaurants_data) ? h.restaurants_data : [],
           source: 'hotels_master_admin' 
       }));

     } catch (error) {
       console.error('[hotelService] ❌ Error:', error.message);
       ErrorHandler.captureError(error, { component: 'hotelService', action: 'getHotelsForAdmin' });
       throw error;
     }
  },

  async getAllHotels() {
    try {
      productionLogger.logInfo('hotelService', 'Fetching ALL hotels for inventory...');
      const { data, error } = await supabase
        .from('hotels_master')
        .select('id, name, slug, location, description, publish, created_at, updated_at, latitude, longitude, zone, address, about_image')
        .order('name');

      if (error) throw error;

      return data.map(hotel => ({
        id: hotel.id,
        name: hotel.name,
        code: hotel.slug?.toUpperCase().substring(0, 6) || 'N/A',
        city: hotel.zone || 'Unknown',
        country: 'Dominican Republic',
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        description: hotel.description,
        image_url: hotel.about_image, 
        is_active: hotel.publish,
        created_at: hotel.created_at,
        updated_at: hotel.updated_at
      }));
    } catch (error) {
      productionLogger.logError('hotelService', error, { action: 'getAllHotels' });
      return [];
    }
  },

  async getHotelById(id) {
    try {
        if (!id) return null;
        if (!validateUUID(id)) {
            console.error('[hotelService] Invalid UUID format:', id);
            return null;
        }

        const { data, error } = await supabase
            .from('hotels_master')
            .select('*')
            .eq('id', id)
            .maybeSingle();
            
        if(error) throw error;
        
        if (data) {
            console.log('[hotelService] ✅ Hotel obtenido:', data.id);
            data.image_url = data.about_image || (Array.isArray(data.gallery_data) && data.gallery_data[0]) || null;
        }
        
        return data;
    } catch(e) {
        console.error('[hotelService] ❌ Error:', e.message);
        return null;
    }
  },

  async updateHotel(id, updates) {
    try {
      if (!id) throw new Error("Missing ID for updateHotel");
      if (!validateUUID(id)) throw new Error("Invalid UUID format for updateHotel");
      
      console.log('[hotelService] 📝 Actualizando hotel:', id);

      // Sanitize payload
      const payload = { ...updates };
      if ('image_url' in payload) {
          payload.about_image = payload.image_url;
          delete payload.image_url;
      }

      const { data, error } = await supabase
          .from('hotels_master')
          .update(payload)
          .eq('id', id)
          .select();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[hotelService] ❌ Error:', error.message);
      throw error;
    }
  },
  
  // =================================================================
  //  MULTIMEDIA & SYNC
  // =================================================================

  async updateHotelMultimedia(hotelId, payload) {
      try {
          console.log(`[hotelService] 🔌 Conectando tubería: multimedia/${hotelId}...`);
          
          if (!hotelId || !validateUUID(hotelId)) {
             throw new Error("Invalid Hotel ID. Must be a valid UUID.");
          }

          console.log('[hotelService] 📝 Validando esquema JSONB...');
          
          if (payload.gallery_data && !Array.isArray(payload.gallery_data)) {
              throw new Error("Invalid schema: gallery_data must be an array");
          }

          const updates = { updated_at: new Date().toISOString() };
          if (payload.gallery_data !== undefined) updates.gallery_data = payload.gallery_data;
          if (payload.image_url !== undefined) updates.about_image = payload.image_url;
          if (payload.about_image !== undefined) updates.about_image = payload.about_image;
          if (payload.restaurants_data !== undefined) updates.restaurants_data = payload.restaurants_data;
          if (payload.services_data !== undefined) updates.services_data = payload.services_data;
          if (payload.rooms_data !== undefined) updates.rooms_data = payload.rooms_data;
          
          if (payload.video_id !== undefined) {
             updates.video_id = String(payload.video_id);
             console.log(`✅ [hotelService] Video ID guardado: ${updates.video_id}`);
          }
          if (payload.video_url !== undefined) updates.video_url = payload.video_url;

          console.log(`[hotelService] 🔐 Aplicando UUID-Cast: WHERE id = ${hotelId}::uuid`);
          console.log('[hotelService] 💾 Guardando multimedia en public.hotels...');

          const { data, error } = await supabase
              .from('hotels_master')
              .update(updates)
              .eq('id', hotelId)
              .select('id, gallery_data, video_id, video_url, about_image, restaurants_data, services_data, rooms_data')
              .maybeSingle();

          if (error) throw error;
          
          if (!data) {
              throw new Error(`Hotel with ID ${hotelId} not found. Cannot update multimedia.`);
          }

          console.log('[hotelService] 🔗 Vinculando imágenes a habitaciones...');
          const galleryCount = data.gallery_data ? data.gallery_data.length : 0;
          console.log(`[hotelService] ✅ Multimedia sincronizada con éxito (Imágenes: ${galleryCount}, Video ID: ${data.video_id}, Time: ${new Date().toISOString()})`);

          return { 
              success: true, 
              hotelId: data.id, 
              gallery_data: data.gallery_data, 
              video_id: data.video_id 
          };

      } catch (error) {
          console.error('[hotelService] ❌ Error:', error.message);
          ErrorHandler.captureError(error, { component: 'hotelService', action: 'updateHotelMultimedia' });
          throw error;
      }
  },

  async updateRoomsData(hotelId, roomsData) {
      console.log('[hotelService] 🔐 Aplicando UUID-Cast...');
      console.log('[hotelService] 💾 Guardando rooms_data...');
      return this.updateHotel(hotelId, { rooms_data: roomsData });
  },

  // =================================================================
  //  ROOM MANAGEMENT (SQL) - FIXED & REPAIRED
  // =================================================================
  
  async getRoomsByHotelId(hotelId) {
    try {
      if (!hotelId) throw new Error("Hotel ID is required");
      if (!validateUUID(hotelId)) throw new Error("Invalid UUID");

      productionLogger.logInfo('hotelService', `Fetching rooms for hotel: ${hotelId}`);
      
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('base_price', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Deduplication Logic
      const rawCount = data ? data.length : 0;
      const uniqueRooms = Array.from(new Map(data.map(item => [item.id, item])).values());
      const uniqueCount = uniqueRooms.length;

      if (rawCount !== uniqueCount) {
          productionLogger.logWarning('hotelService', `⚠️ Duplicates detected in rooms fetch! Raw: ${rawCount}, Unique: ${uniqueCount}`);
      } else {
          productionLogger.logInfo('hotelService', `✅ Fetched ${uniqueCount} unique rooms.`);
      }

      return uniqueRooms;
    } catch (error) {
      console.error('[hotelService] ❌ Error:', error.message);
      ErrorHandler.captureError(error, { component: 'hotelService', action: 'getRoomsByHotelId', hotel_id: hotelId });
      throw error;
    }
  },

  async createRoom(hotelId, roomData) {
    try {
      if (!hotelId) throw new Error("Hotel ID is required");
      if (!validateUUID(hotelId)) throw new Error("Invalid UUID");

      const payload = {
        hotel_id: hotelId,
        name: roomData.name,
        capacity_adults: parseInt(roomData.capacity_adults || roomData.capacity || 2),
        capacity_kids: parseInt(roomData.capacity_kids || 0),
        base_price: parseFloat(roomData.base_price || 0),
        image_url: roomData.image_url,
        description: roomData.description,
        size_sqm: parseInt(roomData.size_sqm || 0),
        amenities: Array.isArray(roomData.amenities) ? roomData.amenities : [],
        is_active: true
      };
      const { data, error } = await supabase.from('rooms').insert([payload]).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[hotelService] ❌ Error:', error.message);
      ErrorHandler.captureError(error, { component: 'hotelService', action: 'createRoom' });
      throw error;
    }
  },

  async updateRoom(roomId, roomData) {
    try {
      productionLogger.logInfo('hotelService', `Updating room: ${roomId}`);

      // 1. UUID Validation
      if (!roomId) throw new Error("Room ID is required");
      if (!validateUUID(roomId)) throw new Error(`Invalid UUID format for roomId: ${roomId}`);

      // 2. Data Cleaning & Validation
      const payload = {};
      if (roomData.name !== undefined) payload.name = String(roomData.name);
      if (roomData.description !== undefined) payload.description = String(roomData.description);
      if (roomData.capacity_adults !== undefined) payload.capacity_adults = parseInt(roomData.capacity_adults);
      if (roomData.capacity_kids !== undefined) payload.capacity_kids = parseInt(roomData.capacity_kids);
      if (roomData.base_price !== undefined) payload.base_price = parseFloat(roomData.base_price);
      if (roomData.image_url !== undefined) {
          if (typeof roomData.image_url !== 'string') {
               throw new Error("Invalid image_url: must be a string");
          }
          payload.image_url = roomData.image_url;
      }
      if (roomData.is_active !== undefined) payload.is_active = !!roomData.is_active;
      
      // Auto-timestamp
      payload.updated_at = new Date().toISOString();

      // 3. Log Payload
      productionLogger.logInfo('hotelService', 'UPDATE Payload:', payload);

      // 4. Execute Update
      const { data, error } = await supabase
        .from('rooms')
        .update(payload)
        .eq('id', roomId)
        .select()
        .single();

      if (error) throw error;
      
      productionLogger.logInfo('hotelService', `✅ Room updated successfully: ${roomId}`);
      return data;
    } catch (error) {
      console.error('[hotelService] ❌ Error:', error.message);
      ErrorHandler.captureError(error, { component: 'hotelService', action: 'updateRoom', metadata: { roomId, roomData } });
      throw error;
    }
  },

  async deleteRoom(roomId) {
    try {
      if (!roomId) throw new Error("Room ID is required");
      if (!validateUUID(roomId)) throw new Error("Invalid UUID");

      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[hotelService] ❌ Error:', error.message);
      ErrorHandler.captureError(error, { component: 'hotelService', action: 'deleteRoom' });
      throw error;
    }
  },
  
  async getRoomTypes(hotelId) { return this.getRoomsByHotelId(hotelId); },
  async saveRoomType(roomData) {
      if (roomData.id) return this.updateRoom(roomData.id, roomData);
      return this.createRoom(roomData.hotel_id, roomData);
  },
  async deleteRoomType(id) { return this.deleteRoom(id); },
  
  async getHotels() {
     try {
       const { data, error } = await supabase
        .from('hotels_master')
        .select(`
            id, name, slug, zone, location, stars, rating, publish,
            description, video_id, gallery_data, rooms_data,
            highlights, amenities, about_image
        `)
        .eq('publish', true)
        .order('name');
       if (error) throw error;
       return data;
     } catch (error) {
       console.error("Error fetching public hotels:", error);
       throw error;
     }
  },

  async getHotelBySlug(slug) {
    try {
      if (!slug) throw new Error('Slug is required');
      console.log('[hotelService] 🔌 Obteniendo hotel por slug:', slug);
      
      const cleanSlug = slug.toLowerCase().trim();
      const { data, error } = await supabase.from('hotels_master').select('*').eq('slug', cleanSlug).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`Hotel not found: ${cleanSlug}`);
      
      ['gallery_data', 'rooms_data', 'services_data', 'restaurants_data'].forEach(field => {
          if (!Array.isArray(data[field])) data[field] = [];
      });
      data.image_url = data.about_image || (Array.isArray(data.gallery_data) && data.gallery_data[0]) || null;
      
      console.log('[hotelService] ✅ Hotel obtenido:', data.id);
      return data;
    } catch (error) {
      console.error(`[hotelService] ❌ Error fetching hotel ${slug}:`, error.message);
      throw error;
    }
  }
};