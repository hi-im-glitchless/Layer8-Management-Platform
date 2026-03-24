/**
 * TOTP verification dialog for returning users
 * Shows 6-digit code input with "remember me" checkbox
 */

import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface TOTPVerificationProps {
  onSubmit: (code: string, rememberDevice: boolean) => Promise<void>;
  onBack: () => void;
  isLoading?: boolean;
}

export function TOTPVerification({ onSubmit, onBack, isLoading }: TOTPVerificationProps) {
  const [code, setCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (code.length === 6) {
      await onSubmit(code, rememberDevice);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Two-Factor Authentication</h2>
        <p className="text-sm text-slate-400">
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="totp-code" className="text-slate-200">Authentication Code</Label>
          <Input
            ref={inputRef}
            id="totp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={handleCodeChange}
            placeholder="000000"
            className="text-center text-2xl tracking-widest text-white placeholder:text-slate-400 border-white/20 bg-white/5"
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="remember-device"
            checked={rememberDevice}
            onCheckedChange={(checked) => setRememberDevice(checked === true)}
            disabled={isLoading}
          />
          <Label
            htmlFor="remember-device"
            className="text-sm font-normal cursor-pointer text-slate-200"
          >
            Remember this device for 30 days
          </Label>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleSubmit}
            className="w-full"
            disabled={code.length !== 6 || isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="w-full text-slate-200 border-white/20"
            disabled={isLoading}
          >
            Back to Login
          </Button>
        </div>
      </div>
    </div>
  );
}
