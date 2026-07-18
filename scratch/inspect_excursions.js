import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  console.log("Intentando inserción mínima...");
  const payload = {
    slug: 'test-min-slug',
    name: 'Test Minimal Excursion'
  };

  const { data, error } = await supabase
    .from('excursions')
    .insert([payload])
    .select();

  if (error) {
    console.error("❌ Error en inserción mínima:", error.message);
  } else {
    console.log("✅ ¡Éxito en inserción mínima! ID:", data[0].id);
    await supabase.from('excursions').delete().eq('slug', 'test-min-slug');
  }
}

testInsert();
