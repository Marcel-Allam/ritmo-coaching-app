'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'coach' | 'client';
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: 'coach' | 'client',
    inviteToken?: string | null
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);

  // Only create the Supabase client when the environment is configured.
  // This prevents the app preview from crashing in Bolt/Vercel previews before env vars are injected.
  const [supabase] = useState(() =>
    isSupabaseConfigured ? createClient() : null
  );

  const fetchProfile = async (userId: string) => {
    if (!supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      // If Supabase is not configured yet, render the app shell in a safe logged-out state.
      if (!supabase) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        setIsInitializing(false);
        return;
      }

      try {
        setIsInitializing(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          const userProfile = await fetchProfile(session.user.id);
          setProfile(userProfile);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, [supabase]);

  useEffect(() => {
    if (isInitializing || !supabase) return;

    let isListening = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isListening) return;

      if (session?.user) {
        setUser(session.user);
        const userProfile = await fetchProfile(session.user.id);
        setProfile(userProfile);
        setLoading(false);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isListening = false;
      subscription?.unsubscribe();
    };
  }, [isInitializing, supabase]);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return {
        error: new Error(
          'Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment.'
        ),
      };
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: 'coach' | 'client',
    inviteToken?: string | null
  ): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return {
        error: new Error(
          'Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment.'
        ),
      };
    }

    try {
      setLoading(true);
      const normalisedEmail = email.trim().toLowerCase();

      const {
        data: { user: newUser },
        error: signUpError,
      } = await supabase.auth.signUp({
        email: normalisedEmail,
        password,
      });

      if (signUpError) {
        return { error: signUpError };
      }

      if (!newUser) {
        return { error: new Error('No user returned from signup') };
      }

      // Create the RITMO profile row that extends the Supabase auth user.
      // This insert must stay aligned with the live public.profiles table schema.
      const { error: profileError } = await supabase.from('profiles').insert({
        id: newUser.id,
        email: normalisedEmail,
        full_name: fullName,
        role,
        created_at: new Date().toISOString(),
      });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        return { error: profileError };
      }

      if (role === 'client' && inviteToken) {
        // Secure client linking rule:
        // The client can only attach their login to a coach-created client record
        // by claiming a valid one-time invite token through the database RPC.
        const { error: inviteError } = await supabase.rpc('claim_client_invite', {
          p_token: inviteToken,
        });

        if (inviteError) {
          console.error('Error claiming client invite:', inviteError);
          return { error: inviteError };
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async (): Promise<{ error: Error | null }> => {
    if (!supabase) {
      setUser(null);
      setProfile(null);
      return { error: null };
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error };
      }

      setUser(null);
      setProfile(null);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
