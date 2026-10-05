import React, { useEffect, useState } from 'react';
import {
  refreshAccountFromCache,
  signInGoogle,
  switchGoogleAccount,
  useGoogleAccountEmail
} from '../../lib/google/googleAccount';

/** Shows which Google account uploads will use, with a button to sign in or pick another account. */
export const GoogleAccountBar: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const email = useGoogleAccountEmail();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshAccountFromCache();
  }, []);

  const handleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      // Called first inside the tap so iOS Safari allows Google's popup.
      await (email ? switchGoogleAccount() : signInGoogle());
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="google-account-bar"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-[var(--night-1)] border-2 border-[var(--outline)]"
    >
      <div className="min-w-0 font-body text-xs text-[var(--text-2)]">
        <span className="font-display text-[10px] text-[var(--text-1)] uppercase mr-1">Google account:</span>
        {email ? (
          <span data-testid="google-account-email" className="font-mono text-[var(--neon-cyan)] break-all">
            {email}
          </span>
        ) : (
          <span className="italic">not signed in</span>
        )}
        {error && <div className="text-[var(--neon-red)] mt-1">{error}</div>}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className="font-display text-[10px] uppercase min-h-[44px] px-3 shrink-0 bg-[var(--violet-2)] text-[var(--text-1)] border-2 border-[var(--outline)] cursor-pointer disabled:opacity-50 active:translate-y-px"
      >
        {busy ? '...' : email ? 'SWITCH ACCOUNT' : 'SIGN IN'}
      </button>
    </div>
  );
};
