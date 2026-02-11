/**
 * Split-screen login page with state machine for auth flow
 * Handles: login, TOTP verification, TOTP setup, and onboarding
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

  // Split-screen login layout
  return (
    <div className="min-h-screen flex">
      {/* Left side - Dark gradient with logo */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 items-center justify-center p-12 relative overflow-hidden">
        {/* Subtle geometric pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l30 30-30 30L0 30 30 0z' fill='%23fff' fill-rule='evenodd'/%3E%3C/svg%3E")`,
            backgroundSize: '30px 30px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 text-center">
          <img
            src="/layer8_logo_dark.jpg"
            alt="Layer8"
            className="w-64 h-auto mx-auto rounded-lg shadow-2xl"
          />
          <p className="mt-6 text-gray-400 text-lg max-w-md">
            Security reporting platform for professional penetration testers
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md">
          {authState === 'idle' ? (
            <Card>
              <CardHeader className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                <p className="text-sm text-muted-foreground">
                  Sign in to your Layer8 account
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <LoginForm onSubmit={handleLogin} />

                {/* Forgot password link - placeholder for future */}
                <div className="text-center">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toast.info('Password reset coming soon')}
                  >
                    Forgot password?
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : authState === 'awaitingTOTP' ? (
            <Card>
              <CardContent className="pt-6">
                <TOTPVerification
                  onSubmit={handleTOTPVerification}
                  onBack={handleBackToLogin}
                  isLoading={verifyTOTPMutation.isPending}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
