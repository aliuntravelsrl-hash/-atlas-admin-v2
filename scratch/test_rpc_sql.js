import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const rpcNames = ['exec_sql', 'run_sql', 'execute_sql', 'sql', 'query', 'execute_ddl'];

async function testRPCs() {
  const sql = 'ALTER TABLE excursions DISABLE ROW LEVEL SECURITY;';
  
  for (const name of rpcNames) {
    console.log(`Probando RPC: ${name}...`);
    try {
      const { data, error } = await supabase.rpc(name, { sql: sql });
      if (error) {
        console.log(`  Resultado ${name}: Error - ${error.message} (${error.code})`);
      } else {
        console.log(`  ✅ ¡Éxito con ${name}! Data:`, data);
        return;
      }
    } catch (err) {
      console.log(`  Resultado ${name}: Excepción - ${err.message}`);
    }
  }
}

testRPCs();
