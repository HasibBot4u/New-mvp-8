/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchProfile = useCallback(async (userId: string, userEmail: string): Promise<Profile> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error || !data) throw error || new Error('no profile');
      return data as Profile;
    } catch {
      // Safe fallback — never return null
      return {
        id: userId,
        email: userEmail,
        display_name: userEmail.split('@')[0] || 'User',
        role: 'user',
        is_enrolled: false,
        is_blocked: false,
        created_at: new Date().toISOString(),
      } as Profile;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Hard safety timeout: if auth init takes >8 seconds, assume logged out
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current && isLoading) {
        console.warn('[Auth] Safety timeout — assuming logged out');
        setSession(null); setUser(null); setProfile(null); setIsLoading(false);
      }
    }, 8000);

    const initAuth = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mountedRef.current) return;
        if (s?.user) {
          setSession(s); setUser(s.user);
          const p = await fetchProfile(s.user.id, s.user.email || '');
          if (mountedRef.current) setProfile(p);
        } else {
          setSession(null); setUser(null); setProfile(null);
        }
      } catch {
        if (mountedRef.current) { setSession(null); setUser(null); setProfile(null); }
      } finally {
        clearTimeout(safetyTimeout);
        if (mountedRef.current) setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return;
      if (newSession?.user) {
        setSession(newSession); setUser(newSession.user);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          const p = await fetchProfile(newSession.user.id, newSession.user.email || '');
          if (mountedRef.current) setProfile(p);
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null); setUser(null); setProfile(null);
      }
      if (mountedRef.current) setIsLoading(false);
    });

    initAuth();

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id, user.email || '');
    setProfile(p);
  }, [user, fetchProfile]);

  const value = React.useMemo(() => ({
    session, user, profile, isLoading, signOut, refreshProfile
  }), [session, user, profile, isLoading, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
