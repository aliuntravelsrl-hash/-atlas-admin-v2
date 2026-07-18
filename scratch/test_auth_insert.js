import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

async function run() {
  const email = 'temp-dev-admin@aliuntravelsrl.com';
  const password = 'TemporaryPassword123!';
  
  console.log(`Intentando registrar usuario: ${email}...`);
  const signUpRes = await supabase.auth.signUp({
    email,
    password
  });
  
  if (signUpRes.error) {
    console.log("Error en signUp:", signUpRes.error.message);
    console.log("Intentando hacer signIn...");
    const signInRes = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (signInRes.error) {
      console.error("Error en signIn:", signInRes.error.message);
      return;
    } else {
      console.log("✅ Sesión iniciada correctamente.");
    }
  } else {
    console.log("✅ Usuario registrado correctamente. Sesión activa.");
  }
  
  console.log("Intentando insertar excursión de prueba...");
  const testPayload = {
    slug: 'test-excursion-temp',
    name: 'Test Excursion Temp',
    category: 'water',
    location: 'Punta Cana',
    price_base_usd: 100,
    is_active: true
  };
  
  const { data, error } = await supabase
    .from('excursions')
    .insert([testPayload])
    .select();
    
  if (error) {
    console.error("❌ Error al insertar con usuario autenticado:", error.message);
  } else {
    console.log("🎉 ¡Éxito! Excursión insertada con ID:", data[0].id);
    
    // Limpiar prueba
    console.log("Limpiando excursión de prueba...");
    await supabase.from('excursions').delete().eq('slug', 'test-excursion-temp');
  }
}

run();
