/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Helper to calculate slightly darker/lighter colors for dynamic themes
const adjustColor = (color: string, amount: number) => {
  return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
};

interface SystemSettings { 
  registrations_open: boolean; 
  maintenance_mode: boolean;
  platform_name: string;
  brand_color: string;
}
interface Ctx { settings: SystemSettings | null; isLoading: boolean; refreshSettings: () => Promise<void>; }

const DEFAULT: SystemSettings = { 
  registrations_open: true, 
  maintenance_mode: false,
  platform_name: 'NexusEdu',
  brand_color: '#4F46E5'
};
const SystemSettingsContext = createContext<Ctx>({ settings: DEFAULT, isLoading: false, refreshSettings: async () => {} });

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(DEFAULT);
  const [isLoading] = useState(false); // starts false — never blocks app

  const fetchSettings = async () => {
    try {
      const result = await Promise.race([
        supabase.from('system_settings').select('key,value'),
        new Promise<null>(r => setTimeout(() => r(null), 4000))
      ]);
      if (result && (result as any).data) {
        const d = (result as any).data;
        const brandColor = d.find((x: any) => x.key === 'brand_color')?.value || DEFAULT.brand_color;
        setSettings({
          registrations_open: d.find((x: any) => x.key === 'registrations_open')?.value !== 'false',
          maintenance_mode:   d.find((x: any) => x.key === 'maintenance_mode')?.value === 'true',
          platform_name:      d.find((x: any) => x.key === 'platform_name')?.value || DEFAULT.platform_name,
          brand_color:        brandColor,
        });

        // Apply theme color to the document root
        document.documentElement.style.setProperty('--primary-color', brandColor);
        document.documentElement.style.setProperty('--primary-color-dark', adjustColor(brandColor, -20));
      } else {
        setSettings(DEFAULT);
      }
    } catch {
      setSettings(DEFAULT);
    }
  };

  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings(); 
  }, []);

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoading, refreshSettings: fetchSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

export const useSystemSettings = () => useContext(SystemSettingsContext);
