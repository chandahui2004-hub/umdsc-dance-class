import type { ApiRequest, ApiResponse, ErrorCode } from '@umdsc/shared';
import { session } from './session';

export class ApiError extends Error {
  code: ErrorCode;
  retryable: boolean;
  latest?: unknown;

  constructor(code: ErrorCode, message: string, retryable: boolean, latest?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
    this.latest = latest;
  }
}

export function newOpId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'op_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'LINK_NO_ACCESS':
        return e.message || 'Club account does not have access to this link.';
      case 'QUOTA':
        return 'Busy right now — retrying…';
      case 'BUSY':
        return 'Server is busy — retrying…';
      case 'UNAUTHORIZED':
        return 'Session expired. Please log in again.';
      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.';
      case 'VALIDATION':
        return e.message || 'Invalid data submitted.';
      case 'NOT_FOUND':
        return 'The requested item was not found.';
      case 'VERSION_CONFLICT':
        return 'Data was modified by someone else. Please refresh and try again.';
      case 'NAME_MISMATCH':
        return "That name doesn't match this matric number.";
      case 'NOT_REGISTERED':
        return 'Matric number is not registered for this month.';
      case 'LOCKED_OUT':
        return 'Too many failed attempts. Please try again later.';
      case 'SETUP_DONE':
        return 'System is already set up.';
      case 'SETUP_REQUIRED':
        return 'System setup required.';
      case 'LINK_INVALID':
        return 'Invalid Google Drive link.';
      case 'LINK_WRONG_KIND':
        return 'The link is not of the required kind (file vs folder).';
      case 'LINK_READ_ONLY':
        return 'The folder is read-only. Edit access is required.';
      case 'INTERNAL':
        return 'An unexpected server error occurred. Please try again.';
      default:
        return e.message || 'An error occurred.';
    }
  }

  if (e instanceof Error) {
    return e.message;
  }

  return 'An unexpected error occurred.';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDelayMs(attempt: number): number {
  // 1s, 2s, 4s, 8s capped at 30s with ±30% jitter
  const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt));
  const jitter = (Math.random() * 0.6 - 0.3); // -0.3 to +0.3
  return Math.max(100, Math.round(baseDelay * (1 + jitter)));
}

export async function call<T>(
  action: string,
  payload?: unknown,
  opts?: { opId?: string; sinceVersion?: number; retries?: number }
): Promise<{ data: T; dataVersion: number }> {
  const apiUrl = (import.meta.env.VITE_API_URL as string) || '';
  const maxRetries = opts?.retries ?? 4;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const currentSession = session.get();
      const reqBody: ApiRequest = {
        action,
        token: currentSession?.token,
        payload,
        opId: opts?.opId,
        sinceVersion: opts?.sinceVersion
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(reqBody),
        redirect: 'follow'
      });

      const json = (await res.json()) as ApiResponse<T>;

      if (json.ok) {
        return {
          data: json.data,
          dataVersion: json.dataVersion
        };
      }

      // Handle server error
      if (json.error.code === 'UNAUTHORIZED') {
        session.notifyUnauthorized();
        throw new ApiError(json.error.code, json.error.message, json.error.retryable, json.error.latest);
      }

      if (json.error.retryable && attempt < maxRetries) {
        await wait(getDelayMs(attempt));
        continue;
      }

      throw new ApiError(json.error.code, json.error.message, json.error.retryable, json.error.latest);
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Network errors (like TypeError: Failed to fetch)
      if (attempt < maxRetries) {
        await wait(getDelayMs(attempt));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Failed to call ${action} after ${maxRetries} retries`);
}
