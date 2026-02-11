/**
 * Split-screen login page with state machine for auth flow
 * Handles: login, TOTP verification, TOTP setup, and onboarding
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/auth/LoginForm';
import { TOTPVerification } from '@/components/auth/TOTPVerification';
import { OnboardingWizard } from '@/components/auth/OnboardingWizard';
import { useLogin, useVerifyTOTP, useAuth } from '@/features/auth/hooks';
import { toast } from 'sonner';
import type { LoginResponse } from '@/features/auth/types';

type AuthState = 'idle' | 'awaitingTOTP' | 'awaitingTOTPSetup' | 'awaitingPasswordChange';

export function Login() {
  const [authState, setAuthState] = useState<AuthState>('idle');
  const navigate = useNavigate();
  const { loginAsync } = useLogin();
  const verifyTOTPMutation = useVerifyTOTP();
  const { refetch: refetchAuth } = useAuth();

  const handleLogin = async (data: { username: string; password: string }): Promise<LoginResponse> => {
    try {
      const response = await loginAsync(data);

      // Handle different response states
      if (response.requiresTOTP) {
        setAuthState('awaitingTOTP');
      } else if (response.requiresTOTPSetup) {
        setAuthState('awaitingTOTPSetup');
      } else if (response.requiresPasswordChange) {
        setAuthState('awaitingPasswordChange');
      } else if (response.success) {
        // Fully authenticated - redirect to dashboard
        await refetchAuth();
        navigate('/');
      }

      return response;
    } catch (error) {
      toast.error('Invalid credentials');
      throw error;
    }
  };

  const handleTOTPVerification = async (code: string, rememberDevice: boolean) => {
    try {
      await verifyTOTPMutation.mutateAsync({ code, rememberDevice });
      // Success - redirect to dashboard
      await refetchAuth();
      navigate('/');
    } catch (error) {
      toast.error('Invalid authentication code');
      throw error;
    }
  };

  const handleBackToLogin = () => {
    setAuthState('idle');
  };

  const handleOnboardingComplete = async () => {
    // Refresh auth state and navigate to dashboard
    await refetchAuth();
    navigate('/');
  };

  // Show onboarding wizard for first-time setup
  if (authState === 'awaitingTOTPSetup' || authState === 'awaitingPasswordChange') {
    return (
      <OnboardingWizard
        requiresPasswordChange={authState === 'awaitingPasswordChange'}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Split-screen login layout with atmospheric gradient and glassmorphism
  // Login page is always dark regardless of theme — it's the atmospheric entry point
  return (
    <div className="min-h-screen flex bg-black">
      {/* Left side - Pure black background so logo blends seamlessly (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-black items-center justify-center p-12 relative overflow-hidden">
        {/* Logo - blends seamlessly into pure black background */}
        <div className="relative z-10 text-center">
          <img
            src="/layer8_logo_dark.png"
            alt="Layer8"
            className="w-72 h-auto mx-auto object-contain"
          />
          <p className="text-slate-400 text-lg max-w-md mt-8">
            Offensive Security AI Template Engine
          </p>
        </div>
      </div>

      {/* Right side - Dark with subtle blue gradient, glassmorphism form card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 bg-gradient-to-r from-black via-slate-950 to-blue-950/80">
        <div className="w-full max-w-md">
          {/* Mobile-only logo (shown when left side is hidden) */}
          <img
            src="/layer8_logo_dark.png"
            alt="Layer8"
            className="h-10 w-auto mx-auto mb-6 object-contain lg:hidden"
          />

          {authState === 'idle' ? (
            <div className="glass rounded-2xl p-8 shadow-2xl">
              <div className="space-y-1 mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
                <p className="text-sm text-slate-400">
                  Sign in to your account
                </p>
              </div>
              <LoginForm onSubmit={handleLogin} />
            </div>
          ) : authState === 'awaitingTOTP' ? (
            <div className="glass rounded-2xl p-8 shadow-2xl">
              <TOTPVerification
                onSubmit={handleTOTPVerification}
                onBack={handleBackToLogin}
                isLoading={verifyTOTPMutation.isPending}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
