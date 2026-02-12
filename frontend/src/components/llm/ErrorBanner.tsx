import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

/**
 * Error display banner with retry button.
 * Shown below partial content on mid-stream failures.
 * No auto-retry -- manual only per user decision.
 */
export function ErrorBanner({ message, onRetry, className }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-destructive/20 bg-destructive/10 p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1 space-y-2">
          <p className="text-sm text-destructive">{message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
