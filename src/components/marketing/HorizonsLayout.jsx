import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';

export const HorizonsLayout = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigation = [
    {
      name: 'Dashboard V2.6',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: '/dashboard26',
      current: location.pathname === '/dashboard26'
    },
    {
      name: 'Métricas CRM 📊',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      ),
      href: '/crm/dashboard',
      current: location.pathname === '/crm/dashboard'
    },
    {
      name: 'Embudo Kanban 📋',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      href: '/crm/pipeline',
      current: location.pathname === '/crm/pipeline'
    },
    {
      name: 'War Room (V4.1)',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      href: '/warroom',
      badge: { text: 'NEW', color: 'bg-violet-600/25 border border-violet-500/30 text-violet-400' },
      current: location.pathname === '/warroom'
    },
    {
      name: 'Mission Control',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
      href: '/mission',
      badge: { text: 'LIVE', color: 'bg-emerald-600/25 border border-emerald-500/30 text-emerald-400' },
      current: location.pathname === '/mission'
    },
    {
      name: 'Integrity Monitor',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      href: '/integrity',
      badge: { text: 'AUDIT', color: 'bg-blue-600/25 border border-blue-500/30 text-blue-400' },
      current: location.pathname === '/integrity'
    },
    {
      name: 'API Toolbox 🔧',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: '/api-toolbox',
      badge: { text: 'API', color: 'bg-emerald-600/25 border border-emerald-500/30 text-emerald-400' },
      current: location.pathname === '/api-toolbox'
    },
    {
      name: 'Hoteles Maestro 🏨',
      icon: '🏨',
      href: '/admin/hotels',
      current: location.pathname === '/admin/hotels'
    },
    {
      name: 'Excursiones 🌴',
      icon: '🌴',
      href: '/admin/excursions',
      current: location.pathname === '/admin/excursions'
    },
    {
      name: 'Reservas Hoteles 🏨',
      icon: '🏨',
      href: '/admin/bookings',
      current: location.pathname === '/admin/bookings'
    },
    {
      name: 'Reservas Excursiones 🌊',
      icon: '🌊',
      href: '/admin/excursion-bookings',
      current: location.pathname === '/admin/excursion-bookings'
    },
    {
      name: '📢 Marketing Mission Control',
      icon: '📢',
      href: '/marketing',
      current: location.pathname === '/marketing'
    },
    {
      name: '🧠 Ariadne Data',
      icon: '🧠',
      href: '/ariadne',
      current: location.pathname === '/ariadne'
    },
    {
      name: 'Galería (Ofertas) 🖼️',
      icon: '🖼️',
      href: '/marketing/offers',
      current: location.pathname.startsWith('/marketing/offers')
    },
    {
      name: 'Knowledge Base 🧠',
      icon: '🧠',
      href: '/admin/knowledge',
      current: location.pathname === '/admin/knowledge'
    },
    {
      name: 'Acciones Rápidas ⚡',
      icon: '⚡',
      href: '/',
      current: location.pathname === '/'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      {/* Header móvil / toggle */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950">
            ✈️
          </div>
          <span className="font-black tracking-wider text-sm">ALIUNADMIN</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-slate-400 hover:text-white focus:outline-none"
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800/80 min-h-screen self-start overflow-y-auto flex flex-col justify-between">
            <div className="p-4 space-y-6">
              
              {/* Logo / Brand */}
              <div className="hidden md:flex items-center gap-3 px-2 py-4 border-b border-slate-800/60">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950">
                  <svg className="w-5 h-5 transform -rotate-45" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-5.5l7 2.5z" />
                  </svg>
                </div>
                <span className="font-black tracking-wider text-white text-lg">ALIUNADMIN</span>
              </div>

              {/* User Profiling */}
              <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-slate-950/50 border border-slate-850">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-extrabold text-sm shadow-md">
                  A
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white">Admin User</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Super Administrator</div>
                </div>
              </div>

              {/* Navigation Items */}
              <nav className="space-y-1.5 pt-4">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl transition-all border font-semibold text-sm group ${
                      item.current
                        ? 'bg-blue-600/15 border-blue-500/40 text-white shadow-lg shadow-blue-500/5'
                        : 'bg-transparent border-transparent hover:bg-slate-950 hover:border-slate-850 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`${item.current ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                    </span>
                    {item.badge && (
                      <span className={`px-2 py-0.5 text-[8px] font-black rounded-md ${item.badge.color}`}>
                        {item.badge.text}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>

            </div>

            {/* Cerrar Sesión Bottom Link */}
            <div className="p-4 border-t border-slate-800/60">
              <Link
                to="/"
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-rose-500 hover:bg-rose-500/5 transition font-semibold text-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Cerrar Sesión</span>
              </Link>
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8 bg-slate-950 overflow-y-auto min-h-screen">
          <Outlet />
        </main>

      </div>
    </div>
  );
};

export default HorizonsLayout;
