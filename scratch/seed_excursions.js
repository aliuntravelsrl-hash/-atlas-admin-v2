import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSeed() {
  console.log("Iniciando seed de excursiones...");
  
  try {
    const jsonPath = 'c:/Users/Admin/Downloads/caribbean_lake_park.json';
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const excursionsData = JSON.parse(rawData);
    
    console.log(`Leídas ${excursionsData.length} excursiones del archivo JSON.`);
    
    for (const ex of excursionsData) {
      console.log(`Procesando excursión: ${ex.name}`);
      
      const payload = {
        slug: ex.slug,
        name: ex.name,
        description: ex.description || null,
        location: ex.location || 'Punta Cana, República Dominicana',
        price_base_usd: ex.price_base_usd !== undefined ? parseFloat(ex.price_base_usd) : null,
        price_child_usd: ex.price_per_child !== undefined ? parseFloat(ex.price_per_child) : null,
        price_infant_usd: ex.price_infants_usd !== undefined ? parseFloat(ex.price_infants_usd) : 0,
        duration: ex.duration_text || null,
        image_url: ex.image_url || null,
        rating: ex.rating !== undefined ? parseFloat(ex.rating) : 4.5,
        reviews_count: ex.google_reviews_count !== undefined ? parseInt(ex.google_reviews_count, 10) : 0,
        category: ex.category || 'water',
        highlights: ex.highlights || [],
        price_includes: ex.included || [],
        price_excludes: ex.exclude_list || [],
        what_to_bring: ex.what_to_bring || [],
        is_active: true,
        zone: 'punta_cana',
        zone_display: 'Punta Cana',
        currency: 'USD',
        price_type: 'per_person'
      };
      
      // Upsert basado en 'slug'
      const { data, error } = await supabase
        .from('excursions')
        .upsert(payload, { onConflict: 'slug' })
        .select();
        
      if (error) {
        console.error(`Error al insertar/actualizar ${ex.name}:`, error.message);
      } else {
        console.log(`✅ Éxito para ${ex.name}. ID: ${data[0]?.id}`);
      }
    }
    
    console.log("Seed completado.");
  } catch (err) {
    console.error("Error general en el proceso de seed:", err);
  }
}

runSeed();
