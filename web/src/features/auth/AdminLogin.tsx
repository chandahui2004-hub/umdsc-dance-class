import React, { useState } from 'react';
import { PasswordToggle } from '../../components/ui/PasswordToggle';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { call, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { CityBackdrop } from '../../components/art/CityBackdrop';
import { LogoBadge } from '../../components/ui/LogoBadge';
import type { TokenClaims, AdminBootstrap } from '@umdsc/shared';

interface AdminLoginResponse {
  token: string;
  claims: TokenClaims;
  bootstrap?: AdminBootstrap;
}

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const expired = Boolean((location.state as { expired?: boolean } | null)?.expired);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await call<AdminLoginResponse>('auth.adminLogin', {
        username: username.trim(),
        password
      });

      const { token, claims, bootstrap } = res.data;
      session.set(token, claims, remember);

      if (bootstrap) {
        localStorage.setItem(
          `boot:admin:${claims.sub}`,
          JSON.stringify({
            data: bootstrap,
            dataVersion: res.dataVersion
          })
        );
      }

      // Back to the page the admin was on (e.g. Attendance after an expired sign-in)
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from && from.startsWith('/admin') ? from : '/admin/calendar', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden">
      <CityBackdrop />
      <div className="relative z-[var(--z-content)] min-h-[100dvh] flex flex-col items-center justify-end p-4 mb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="flex justify-center mb-3">
            <LogoBadge height={96} />
          </div>
          <div className="inline-block bg-[var(--night-2)] text-[var(--neon-gold)] px-3 py-1 border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] mb-2">
            <span className="font-display text-[10px] md:text-[12px] tracking-widest">★ SYSTEM CONSOLE ★</span>
          </div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--text-1)] px-glow-text" style={{ '--glow': 'var(--neon-cyan)' } as React.CSSProperties}>
            ADMIN ACCESS
          </h1>
        </div>

        <div className="w-full max-w-md">
          <Panel title="AUTHENTICATION" className="px-corners">
            <form onSubmit={handleSubmit} className="space-y-4">
              {expired && !error && (
                <div
                  role="status"
                  className="bg-[var(--night-2)] border-2 border-[var(--neon-gold)] text-[var(--neon-gold)] p-3 text-[14px] font-body font-bold"
                >
                  Your sign-in expired — please sign in again. Ticks you were saving are kept on this phone and will
                  be saved after you sign in.
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[14px] font-body font-bold"
                >
                  {error}
                </div>
              )}

              <Field
                label="Username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={loading}
                required
              />

              <div>
                <Field
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <div className="flex justify-end">
                  <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </div>
              </div>

              <div className="flex items-center min-h-[44px]">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-5 h-5 accent-[var(--neon-gold)] border-2 border-[var(--outline)] mr-3 cursor-pointer"
                />
                <label htmlFor="remember" className="font-display text-[12px] text-[var(--text-1)] cursor-pointer select-none">
                  REMEMBER ME
                </label>
              </div>

              <div className="pt-2">
                <PixelButton
                  variant="primary"
                  size="lg"
                  type="submit"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'AUTHENTICATING...' : 'LOGIN'}
                </PixelButton>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t-2 border-[var(--outline)] text-center">
              <Link
                to="/login"
                className="font-display text-[12px] text-[var(--neon-cyan)] hover:underline inline-flex items-center justify-center py-2 min-h-[44px]"
              >
                [ &lt; DANCER MODE ]
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
