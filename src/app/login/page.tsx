'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, user, profile, loading } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('invite');
    const mode = searchParams.get('mode');

    setInviteToken(token);

    if (token && mode === 'signup') {
      setIsSignUp(true);
    }
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile && !loading) {
      if (profile.role === 'coach') {
        router.push('/coach');
      } else {
        router.push('/client');
      }
    }
  }, [user, profile, loading, router]);

  const updateCapsLockState = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(event.getModifierState('CapsLock'));
  };

  const getReadableAuthError = (message: string) => {
    if (message.toLowerCase().includes('invalid login credentials')) {
      return 'Invalid login credentials. Check your email, password, and Caps Lock.';
    }

    return message;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(getReadableAuthError(signInError.message));
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!inviteToken) {
        setError('Account creation is invite-only. Ask your coach for a RITMO invite link.');
        setIsSubmitting(false);
        return;
      }

      if (!fullName.trim()) {
        setError('Please enter your full name');
        setIsSubmitting(false);
        return;
      }

      const { error: signUpError } = await signUp(
        email,
        password,
        fullName,
        'client',
        inviteToken
      );
      if (signUpError) {
        setError(getReadableAuthError(signUpError.message));
      } else {
        setError(null);
        // Signup successful, user should be logged in now.
        // The auth context handles the redirect.
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold text-red-600 mb-2">RITMO</h1>
          <p className="text-gray-400">Coaching App</p>
        </div>

        {/* Form Container */}
        <div className="bg-black border border-gray-700 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {isSignUp ? 'Create Invited Client Account' : 'Sign In'}
          </h2>

          {isSignUp && !inviteToken && (
            <div className="mb-4 p-3 bg-red-600 bg-opacity-10 border border-red-600 rounded text-white text-sm font-semibold">
              Account creation is invite-only. Open the invite link your coach sent you.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-600 bg-opacity-10 border border-red-600 rounded text-white text-sm font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            {/* Full Name Input (Sign Up Only) */}
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-white text-sm font-medium mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting || !inviteToken}
                  className="w-full px-4 py-2 bg-white text-black rounded border border-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-50"
                />
              </div>
            )}

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-white text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting || (isSignUp && !inviteToken)}
                required
                className="w-full px-4 py-2 bg-white text-black rounded border border-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-50"
              />
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-white text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={updateCapsLockState}
                onKeyUp={updateCapsLockState}
                onBlur={() => setIsCapsLockOn(false)}
                disabled={isSubmitting || (isSignUp && !inviteToken)}
                required
                className="w-full px-4 py-2 bg-white text-black rounded border border-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:opacity-50"
              />
              {isCapsLockOn && (
                <div className="mt-2 rounded border border-yellow-500 bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-300">
                  Caps Lock is on. Passwords are case-sensitive.
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || (isSignUp && !inviteToken)}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-700 disabled:opacity-50 text-white font-bold rounded transition-colors mt-6"
            >
              {isSubmitting ? 'Loading...' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </button>
          </form>

          {/* Toggle Sign In/Sign Up */}
          <div className="mt-6 text-center text-gray-400 text-sm">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setFullName('');
                  }}
                  className="text-red-600 hover:text-red-500 font-medium"
                >
                  Sign in
                </button>
              </>
            ) : inviteToken ? (
              <>
                Using an invite?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                  }}
                  className="text-red-600 hover:text-red-500 font-medium"
                >
                  Create invited account
                </button>
              </>
            ) : (
              <span>Need an account? Ask your coach for an invite link.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
