import { cn } from '@/lib/utils';

interface LoadingIndicatorProps {
  className?: string;
}

/**
 * Pulsing dots animation shown while waiting for the first LLM token.
 * Three dots with staggered animation delays for a sequential pulse effect.
 */
export function LoadingIndicator({ className }: LoadingIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  );
}
