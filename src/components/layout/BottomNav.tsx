import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Bell, User, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function BottomNav() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'হোম' },
    { to: '/courses', icon: BookOpen, label: 'বিষয়সমূহ' },
    { to: '/notifications', icon: Bell, label: 'নোটিফিকেশন' },
    { to: '/profile', icon: User, label: 'প্রোফাইল' },
  ];

  if (isAdmin) {
    navItems.push({ to: '/admin/dashboard', icon: Settings, label: 'অ্যাডমিন' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50 md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium bangla">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
