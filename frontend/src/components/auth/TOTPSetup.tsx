/**
 * TOTP setup component for first-time MFA configuration
 * Displays QR code and accepts verification code
 */

import { useState, useEffect, useRef } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TOTPSetupProps {
  qrCodeDataURL?: string;
  onVerify: (code: string) => Promise<void>;
  onSetup: () => Promise<void>;
  isLoading?: boolean;
}

export function TOTPSetup({ qrCodeDataURL, onVerify, onSetup, isLoading }: TOTPSetupProps) {
  const [code, setCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Trigger setup when component mounts (if no QR code yet)
  useEffect(() => {
    if (!qrCodeDataURL && !isLoading) {
      onSetup();
    }
  }, []);

  // Focus input when QR code is loaded
  useEffect(() => {
    if (qrCodeDataURL) {
      inputRef.current?.focus();
    }
  }, [qrCodeDataURL]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  const handleSubmit = async () => {
    if (code.length === 6) {
      await onVerify(code);
    }
  };

  if (!qrCodeDataURL && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generating QR code...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          Set Up Two-Factor Authentication
        </h2>
        <p className="text-sm text-muted-foreground">
          Scan the QR code with your authenticator app
        </p>
      </div>

      {qrCodeDataURL && (
        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="rounded-lg border-2 border-border p-4 bg-white">
              <img
                src={qrCodeDataURL}
                alt="TOTP QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Manual entry option */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecret(!showSecret)}
              className="w-full text-xs text-muted-foreground"
            >
              {showSecret ? (
                <>
                  <EyeOff className="mr-2 h-3 w-3" />
                  Hide manual entry key
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-3 w-3" />
                  Can't scan? Show manual entry key
                </>
              )}
            </Button>
            {showSecret && (
              <div className="rounded-md bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Enter this key manually in your app:
                </p>
                <code className="text-sm font-mono">
                  {/* Note: Secret would need to be passed as prop for this to work */}
                  Contact admin for manual setup
                </code>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Popular authenticator apps:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Google Authenticator</li>
              <li>Microsoft Authenticator</li>
              <li>Authy</li>
              <li>1Password</li>
            </ul>
          </div>

          {/* Verification code input */}
          <div className="space-y-2">
            <Label htmlFor="verify-code">Enter code to verify setup</Label>
            <Input
              ref={inputRef}
              id="verify-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={handleCodeChange}
              placeholder="000000"
              className="text-center text-2xl tracking-widest"
              disabled={isLoading}
            />
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            className="w-full"
            disabled={code.length !== 6 || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify & Enable MFA
          </Button>
        </div>
      )}
    </div>
  );
}
