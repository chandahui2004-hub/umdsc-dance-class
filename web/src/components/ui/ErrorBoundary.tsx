import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches a crash while drawing a page so the screen never goes blank. Unsaved attendance ticks
 * live in the phone's storage, so RELOAD keeps them.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[var(--night-1)]">
        <div role="alert" className="px-panel p-6 max-w-md w-full space-y-4 border-2 border-[var(--neon-red)]">
          <p className="font-display text-[14px] text-[var(--neon-red)]">Something went wrong on this page.</p>
          <p className="font-body text-[16px] text-[var(--text-1)]">
            Nothing you already saved is lost, and ticks you were submitting are kept on this phone. Reload to carry on.
          </p>
          <p className="font-mono text-[12px] text-[var(--text-2)] break-words">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[48px] px-4 border-2 border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[12px] shadow-[2px_2px_0_var(--outline)] cursor-pointer"
          >
            ↻ RELOAD
          </button>
        </div>
      </div>
    );
  }
}
