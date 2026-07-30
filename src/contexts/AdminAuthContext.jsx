import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Obtener sesión inicial de Supabase de forma nativa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && mounted) {
        verifyAdminStatus(session.user);
      } else if (mounted) {
        setUser(null);
        setLoading(false);
      }
    });

    // Escuchar cambios en el estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && mounted) {
        await verifyAdminStatus(session.user);
      } else if (mounted) {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const verifyAdminStatus = async (authUser) => {
    try {
      // Consultamos el perfil del administrador en la tabla pública usando el nuevo campo auth_user_id
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('id, email, name, role, is_active')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error verificando rol de administrador:', error);
        setUser(null);
        setLoading(false);
        return;
      }

      if (!adminData) {
        console.warn('⚠️ Usuario autenticado en Supabase Auth pero no existe perfil en admin_users.');
        setUser(null);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (!adminData.is_active) {
        console.warn('⚠️ Cuenta de administrador desactivada:', adminData.email);
        setUser(null);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Vinculación exitosa del estado de sesión
      const sessionUser = {
        id: adminData.id,
        email: adminData.email,
        name: adminData.name,
        role: adminData.role,
        auth_user_id: authUser.id,
        loginTime: Date.now()
      };
      
      setUser(sessionUser);
      setLoading(false);
    } catch (e) {
      console.error('💥 Excepción verificando admin:', e);
      setUser(null);
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    console.log(`🔐 Intentando inicio de sesión nativo de Supabase Auth para: ${email}`);
    setLoading(true);
    try {
      // 1. Intentar autenticar con Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('❌ Error de Supabase Auth en Login:', error.message);
        setLoading(false);
        return { success: false, error: 'Credenciales inválidas o error de red' };
      }

      if (!data.user) {
        setLoading(false);
        return { success: false, error: 'No se pudo obtener el usuario de sesión' };
      }

      // 2. Verificar rol e is_active antes de dar por completado el login del flujo de admin
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('role, is_active')
        .eq('auth_user_id', data.user.id)
        .maybeSingle();

      if (adminError || !adminData) {
        console.warn('⚠️ Sin perfil administrador:', adminError);
        await supabase.auth.signOut();
        setLoading(false);
        return { success: false, error: 'Su usuario no tiene perfil de administrador en el sistema' };
      }

      if (!adminData.is_active) {
        console.warn('⚠️ Intentando logear cuenta inactiva');
        await supabase.auth.signOut();
        setLoading(false);
        return { success: false, error: 'Esta cuenta de administrador está desactivada' };
      }

      return { success: true };

    } catch (err) {
      console.error('💥 Error crítico en Login:', err);
      setLoading(false);
      return { success: false, error: 'Error del servidor al intentar ingresar' };
    }
  };

  const logout = async () => {
    console.log('👋 Cerrando sesión de administrador');
    setUser(null);
    await supabase.auth.signOut();
  };

  // Exponer isAdmin de forma reactiva y en minúsculas para mayor robustez
  const isAdmin = user?.role ? ['admin', 'super_admin'].includes(user.role.toLowerCase()) : false;

  return (
    <AdminAuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user, isAdmin }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
