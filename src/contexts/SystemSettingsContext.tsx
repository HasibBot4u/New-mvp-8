/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface SystemSettings { registrations_open: boolean; maintenance_mode: boolean; }
interface Ctx { settings: SystemSettings | null; isLoading: boolean; refreshSettings: () => Promise<void>; }

const DEFAULT: SystemSettings = { registrations_open: true, maintenance_mode: false };
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
        setSettings({
          registrations_open: d.find((x: any) => x.key === 'registrations_open')?.value !== 'false',
          maintenance_mode:   d.find((x: any) => x.key === 'maintenance_mode')?.value === 'true',
        });
      } else {
        setSettings(DEFAULT);
      }
    } catch {
      setSettings(DEFAULT);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoading, refreshSettings: fetchSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

export const useSystemSettings = () => useContext(SystemSettingsContext);
