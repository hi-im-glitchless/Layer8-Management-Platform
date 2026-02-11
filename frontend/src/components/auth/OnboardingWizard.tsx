/**
 * Multi-step onboarding wizard for first login
 * Guides users through password change, TOTP setup, and welcome
 */

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PasswordChange } from './PasswordChange';
import { TOTPSetup } from './TOTPSetup';
import { useChangePassword, useSetupTOTP, useVerifyTOTPSetup } from '@/features/auth/hooks';
import { toast } from 'sonner';

interface OnboardingWizardProps {
  requiresPasswordChange?: boolean;
  onComplete: () => void;
}

type Step = 'password' | 'totp' | 'welcome';

export function OnboardingWizard({
  requiresPasswordChange = false,
  onComplete,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>(
    requiresPasswordChange ? 'password' : 'totp'
  );
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>();

  const changePasswordMutation = useChangePassword();
  const setupTOTPMutation = useSetupTOTP();
  const verifyTOTPMutation = useVerifyTOTPSetup();

  const steps: Step[] = requiresPasswordChange
    ? ['password', 'totp', 'welcome']
    : ['totp', 'welcome'];

  const currentStepIndex = steps.indexOf(currentStep);

  const handlePasswordChange = async (newPassword: string) => {
    try {
      await changePasswordMutation.mutateAsync({ newPassword });
      toast.success('Password set successfully');
      setCurrentStep('totp');
    } catch (error) {
      toast.error('Failed to set password');
      throw error;
    }
  };

  const handleTOTPSetup = async () => {
    try {
      const response = await setupTOTPMutation.mutateAsync();
      setQrCodeDataURL(response.qrCodeDataURL);
    } catch (error) {
      toast.error('Failed to generate QR code');
      throw error;
    }
  };

  const handleTOTPVerify = async (code: string) => {
    try {
      await verifyTOTPMutation.mutateAsync(code);
      toast.success('MFA enabled successfully');
      setCurrentStep('welcome');
    } catch (error) {
      toast.error('Invalid code. Please try again.');
      throw error;
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="text-2xl font-bold">Layer8</div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    index < currentStepIndex
                      ? 'border-primary bg-primary text-primary-foreground'
                      : index === currentStepIndex
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-12 transition-colors ${
                      index < currentStepIndex
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold">Welcome to Layer8</h1>
            <p className="text-sm text-muted-foreground">
              Let's secure your account in a few simple steps
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step content */}
          <div className="min-h-[400px]">
            {currentStep === 'password' && (
              <div className="space-y-4 fade-in">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Set Your Password</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose a strong password to protect your account
                  </p>
                </div>
                <PasswordChange
                  onSubmit={handlePasswordChange}
                  isLoading={changePasswordMutation.isPending}
                />
              </div>
            )}

            {currentStep === 'totp' && (
              <div className="fade-in">
                <TOTPSetup
                  qrCodeDataURL={qrCodeDataURL}
                  onSetup={handleTOTPSetup}
                  onVerify={handleTOTPVerify}
                  isLoading={setupTOTPMutation.isPending || verifyTOTPMutation.isPending}
                />
              </div>
            )}

            {currentStep === 'welcome' && (
              <div className="flex flex-col items-center justify-center space-y-6 py-12 fade-in">
                <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/20">
                  <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500" />
                </div>
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-semibold">You're All Set!</h2>
                  <p className="text-muted-foreground max-w-md">
                    Your account is now secured with two-factor authentication.
                    You can now use Layer8 to streamline your security reporting workflow.
                  </p>
                </div>
                <Button onClick={handleComplete} size="lg" className="mt-4">
                  Get Started
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
