import { ErrorCode } from '@umdsc/shared';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable: boolean = false,
    public latest?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function toErrorBody(err: unknown): { code: ErrorCode; message: string; retryable: boolean; latest?: unknown } {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      latest: err.latest
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes('Service invoked too many times') ||
    message.includes('Exceeded maximum execution') ||
    message.includes('Rate limit exceeded')
  ) {
    return {
      code: 'QUOTA',
      message: 'Google service rate limit reached, please retry.',
      retryable: true
    };
  }

  return {
    code: 'INTERNAL',
    message: 'An internal server error occurred.',
    retryable: false
  };
}
