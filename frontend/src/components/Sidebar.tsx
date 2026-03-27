import { NavLink } from 'react-router-dom';

const navItems = [
     { to: '/', icon: 'auto_fix_high', label: 'Forge' },
     { to: '/library', icon: 'auto_stories', label: 'Library' },
];

const Sidebar = () => {
     return (
          <aside className="hidden md:flex flex-col h-[calc(100vh-5rem)] w-64 bg-[#0e0c20]/80 backdrop-blur-2xl border-r border-[#48455c]/15 py-6 fixed left-0">
               <nav className="flex-1 space-y-1">
                    {navItems.map(({ to, icon, label }) => (
                         <NavLink
                              key={to}
                              to={to}
                              end
                              className={({ isActive }) =>
                                   `flex items-center gap-4 px-6 py-3 transition-all duration-300 ${isActive
                                        ? 'bg-primary/10 text-primary border-r-4 border-primary'
                                        : 'text-on-surface/40 hover:text-on-surface/80 hover:bg-[#1f1c37] border-r-4 border-transparent'
                                   }`
                              }
                         >
                              <span className="material-symbols-outlined text-[20px]">{icon}</span>
                              <span className="font-label text-xs font-semibold tracking-wider uppercase">{label}</span>
                         </NavLink>
                    ))}
               </nav>

               <div className="px-6 mb-8">
                    <NavLink
                         to="/"
                         className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-label text-xs font-bold tracking-widest uppercase shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center"
                    >
                         New Story
                    </NavLink>
               </div>

               <div className="mt-auto pt-8 border-t border-[#48455c]/15 space-y-1">
                    <button className="w-full flex items-center gap-4 px-6 py-3 text-on-surface/40 hover:text-on-surface/80 hover:bg-[#1f1c37] transition-all duration-300">
                         <span className="material-symbols-outlined text-[20px]">settings</span>
                         <span className="font-label text-xs font-semibold tracking-wider uppercase">Settings</span>
                    </button>
               </div>
          </aside>
     );
};

export default Sidebar;
