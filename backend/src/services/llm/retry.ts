import { backOff } from 'exponential-backoff';

export interface RetryConfig {
  maxAttempts?: number;
  startingDelay?: number;
  maxDelay?: number;
  jitter?: 'full' | 'none';
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('503') ||
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('econnrefused')
  );
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    startingDelay = 500,
    maxDelay = 10000,
    jitter = 'full',
  } = config;

  return backOff(fn, {
    numOfAttempts: maxAttempts,
    startingDelay,
    maxDelay,
    jitter,
    retry: (error, attemptNumber) => {
      const shouldRetry = isTransientError(error);
      if (shouldRetry) {
        console.log(
          `Retry attempt ${attemptNumber}/${maxAttempts} for error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return shouldRetry;
    },
  });
}
