import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listRPCs() {
  console.log("Consultando funciones del esquema public...");
  // Consultar pg_proc a través de una consulta a la API de PostgREST
  // pg_proc no está expuesto directamente por defecto en PostgREST, 
  // pero podemos intentar usar la vista de rutinas de information_schema
  const { data, error } = await supabase
    .from('information_schema.routines')
    .select('routine_name, routine_type')
    .eq('routine_schema', 'public');

  if (error) {
    console.error("Error consultando information_schema.routines:", error);
  } else {
    console.log("Funciones encontradas en public:");
    console.log(data);
  }
}

listRPCs();
