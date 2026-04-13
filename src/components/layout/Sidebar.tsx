import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Atom, 
  Beaker, 
  Calculator, 
  User,
  X,
  Bell,
  BookOpen
} from 'lucide-react';
import { NexusLogo } from '../shared/NexusLogo';
import { useAuth } from '../../contexts/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { profile, signOut } = useAuth();
  const { catalog } = useCatalog();

  const getSubjectIcon = (name: string) => {
    if (name.includes('Physics') || name.includes('পদার্থ')) return Atom;
    if (name.includes('Chemistry') || name.includes('রসায়ন')) return Beaker;
    if (name.includes('Math') || name.includes('গণিত')) return Calculator;
    return BookOpen;
  };

  const dynamicSubjects = (catalog?.subjects || []).map(s => ({
    name: s.name_bn || s.name,
    path: `/subject/${s.slug}`,
    icon: getSubjectIcon(s.name)
  }));

  const navItems = [
    { name: 'ড্যাশবোর্ড', path: '/dashboard', icon: LayoutDashboard },
    ...dynamicSubjects,
    { name: 'নোটিফিকেশন', path: '/notifications', icon: Bell },
    { name: 'আমার প্রোফাইল', path: '/profile', icon: User },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
          <NexusLogo withSubtitle={false} className="scale-90 origin-left" />
          <button 
            onClick={onClose}
            className="md:hidden p-2 -mr-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 768) onClose();
                }}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bangla transition-colors
                  ${isActive 
                    ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
              {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.display_name}</p>
              <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut()}
            className="w-full py-2 px-4 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-600 text-sm font-medium rounded-lg transition-colors bangla"
          >
            সাইন আউট
          </button>
        </div>
      </aside>
    </>
  );
};
