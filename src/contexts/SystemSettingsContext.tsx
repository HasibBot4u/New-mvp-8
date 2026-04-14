/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface SystemSettings {
  registrations_open: boolean;
  maintenance_mode: boolean;
}

interface SystemSettingsContextType {
  settings: SystemSettings | null;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: SystemSettings = { registrations_open: true, maintenance_mode: false };

const SystemSettingsContext = createContext<SystemSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  refreshSettings: async () => {},
});

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false); // Start FALSE — don't block app startup

  const fetchSettings = async () => {
    // Hard 4-second timeout — never block the app
    const timeoutPromise = new Promise<void>(resolve =>
      setTimeout(() => { setSettings(DEFAULT_SETTINGS); setIsLoading(false); resolve(); }, 4000)
    );

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase.from('system_settings').select('key, value');
        if (data && !error) {
          setSettings({
            registrations_open: data.find(x => x.key === 'registrations_open')?.value !== 'false',
            maintenance_mode: data.find(x => x.key === 'maintenance_mode')?.value === 'true',
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch {
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    })();

    await Promise.race([fetchPromise, timeoutPromise]);
  };

  useEffect(() => {
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoading, refreshSettings: fetchSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

export const useSystemSettings = () => useContext(SystemSettingsContext);
