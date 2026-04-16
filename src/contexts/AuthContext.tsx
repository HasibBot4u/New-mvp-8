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

// Wraps any promise with a timeout. On timeout resolves to null (never rejects).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms))
  ]);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const FALLBACK_PROFILE = useCallback((u: User): Profile => ({
    id: u.id,
    email: u.email ?? '',
    display_name: u.email?.split('@')[0] ?? 'User',
    role: 'user',
    is_enrolled: false,
    is_blocked: false,
    created_at: new Date().toISOString(),
  }), []);

  const fetchProfile = useCallback(async (u: User): Promise<Profile> => {
    const result = await withTimeout(
      supabase.from('profiles').select('*').eq('id', u.id).single() as unknown as Promise<any>,
      5000
    );
    if (result && result.data && !result.error) return result.data as Profile;
    return FALLBACK_PROFILE(u);
  }, [FALLBACK_PROFILE]);

  useEffect(() => {
    mountedRef.current = true;

    const boot = async () => {
      try {
        const result = await withTimeout(supabase.auth.getSession(), 6000);
        if (!mountedRef.current) return;

        const s = result?.data?.session ?? null;
        if (s?.user) {
          setSession(s);
          setUser(s.user);
          const p = await fetchProfile(s.user);
          if (mountedRef.current) setProfile(p);
        } else {
          setSession(null); setUser(null); setProfile(null);
        }
      } catch {
        if (mountedRef.current) { setSession(null); setUser(null); setProfile(null); }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;

      if (event === 'TOKEN_REFRESH_FAILED') {
        // Token is irreversibly broken, force sign out to clean state
        supabase.auth.signOut().catch(() => {});
        setSession(null); setUser(null); setProfile(null);
        setIsLoading(false);
        return;
      }

      if (newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        // Fetch profile asynchronously — do NOT await here (avoids stale closure bug)
        fetchProfile(newSession.user).then(p => {
          if (mountedRef.current) setProfile(p);
        });
      } else if (event === 'SIGNED_OUT') {
        setSession(null); setUser(null); setProfile(null);
      }
      if (mountedRef.current) setIsLoading(false);
    });

    boot();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user);
    if (mountedRef.current) setProfile(p);
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
