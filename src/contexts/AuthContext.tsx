/* eslint-disable react-refresh/only-export-components */
import React, { 
  createContext, useContext, useEffect, useState, useRef, useCallback 
} from 'react';
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

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export const AuthProvider: React.FC<{ 
  children: React.ReactNode 
}> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // START TRUE — critical
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchProfile = useCallback(async (
    userId: string,
    userEmail: string
  ): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as Profile;
    } catch {
      // Return minimal safe fallback — is_enrolled MUST be false for security
      return {
        id: userId,
        email: userEmail,
        display_name: userEmail.split('@')[0],
        role: 'user',
        is_enrolled: false,  // MUST be false on error
        is_blocked: false,
        created_at: new Date().toISOString(),
      } as Profile;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const prof = await fetchProfile(user.id, user.email || '');
    setProfile(prof);
  }, [user, fetchProfile]);

  useEffect(() => {
    mountedRef.current = true;

    const initAuth = async () => {
      try {
        // Step 1: Get current session synchronously from localStorage
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (!mountedRef.current) return;

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          // Fetch profile (may be cached or fresh)
          const prof = await fetchProfile(currentSession.user.id, currentSession.user.email || '');
          if (mountedRef.current) setProfile(prof);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('[Auth] initAuth error:', err);
        if (mountedRef.current) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } finally {
        // CRITICAL: always set isLoading false, no matter what
        if (mountedRef.current) setIsLoading(false);
      }
    };

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mountedRef.current) return;
        if (newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);
          // Fetch profile if it's a new login, token refresh, or initial session
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            const prof = await fetchProfile(newSession.user.id, newSession.user.email || '');
            if (mountedRef.current) setProfile(prof);
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
        if (mountedRef.current) setIsLoading(false);
      }
    );

    initAuth();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const value = React.useMemo(() => ({
    session,
    user,
    profile,
    isLoading,
    signOut,
    refreshProfile,
  }), [session, user, profile, isLoading, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
