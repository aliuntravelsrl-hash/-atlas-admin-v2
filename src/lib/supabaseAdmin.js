/**
 * supabaseAdmin.js
 * Cliente Supabase con service_role — para operaciones del panel admin.
 * 
 * SEGURIDAD: Este cliente bypasea RLS. Solo usar en:
 *   - AdminBookingsPanel.jsx
 *   - PaymentGatewayPage.jsx  
 *   - FacturadorPanel.jsx
 * 
 * La key viene de variable de entorno VITE_SUPABASE_SERVICE_KEY.
 * NUNCA hardcodear la service_role key en código.
 * 
 * En EasyPanel: Settings → Environment Variables → agregar VITE_SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oyihiyivdhfxpyiwnmqk.supabase.co';

const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || 
                   import.meta.env.VITE_SUPABASE_ANON_KEY ||
                   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

export default supabaseAdmin;
