import { Square } from 'lucide-react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ErrorBanner } from './ErrorBanner';
import { LoadingIndicator } from './LoadingIndicator';

interface StreamingResponseProps {
  content: string;
  isStreaming: boolean;
  isWaiting: boolean;
  error: string | null;
  usage?: { inputTokens: number; outputTokens: number };
  onStop: () => void;
  onRetry: () => void;
  className?: string;
}

/**
 * Main reusable component for displaying streaming LLM output.
 * Receives all state via props (no internal hook coupling).
 * Used by template adapter, executive reports, and any future LLM features.
 */
export function StreamingResponse({
  content,
  isStreaming,
  isWaiting,
  error,
  usage,
  onStop,
  onRetry,
  className,
}: StreamingResponseProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Pulsing dots while waiting for first token */}
      {isWaiting && !content && <LoadingIndicator />}

      {/* Markdown content area */}
      {content && (
        <div className="prose dark:prose-invert max-w-none">
          <Streamdown mode={isStreaming ? 'streaming' : 'static'} caret={isStreaming ? 'block' : undefined}>
            {content}
          </Streamdown>
        </div>
      )}

      {/* Stop generating button */}
      {isStreaming && content && (
        <Button variant="outline" size="sm" onClick={onStop}>
          <Square className="h-3 w-3" />
          Stop generating
        </Button>
      )}

      {/* Error banner below partial content */}
      {error && <ErrorBanner message={error} onRetry={onRetry} />}

      {/* Token usage after completion */}
      {usage && !isStreaming && (
        <p className="text-xs text-muted-foreground">
          {usage.inputTokens} input tokens &middot; {usage.outputTokens} output tokens
        </p>
      )}
    </div>
  );
}
