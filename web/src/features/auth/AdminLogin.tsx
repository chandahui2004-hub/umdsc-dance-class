import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { call, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import type { TokenClaims, AdminBootstrap } from '@umdsc/shared';

interface AdminLoginResponse {
  token: string;
  claims: TokenClaims;
  bootstrap?: AdminBootstrap;
}

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

      navigate('/admin/today', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--c-bg)] flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <div className="p-2 bg-white border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)]">
            <img
              src="/logo.png"
              alt="UMDSC Club Logo"
              className="w-16 h-16 md:w-20 md:h-20 object-contain"
            />
          </div>
        </div>
        <div className="inline-block bg-[var(--c-navy)] text-[var(--c-yellow)] px-3 py-1 border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] mb-2">
          <span className="font-display text-xs tracking-widest">★ SYSTEM CONSOLE ★</span>
        </div>
        <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
          ADMIN ACCESS
        </h1>
      </div>

      <div className="w-full max-w-md">
        <Panel title="AUTHENTICATION" className="px-corners">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="bg-[var(--c-peach)] border-2 border-[var(--c-red)] text-[var(--c-red)] p-3 text-xs font-body font-bold"
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

            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <div className="flex items-center min-h-[44px]">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-5 h-5 accent-[var(--c-navy)] border-2 border-[var(--c-ink)] mr-3 cursor-pointer"
              />
              <label htmlFor="remember" className="font-display text-[10px] text-[var(--c-ink)] cursor-pointer select-none">
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

          <div className="mt-6 pt-4 border-t-2 border-[var(--c-grey)] text-center">
            <Link
              to="/login"
              className="font-display text-[10px] text-[var(--c-blue)] hover:text-[var(--c-navy)] underline inline-block py-2 min-h-[44px] flex items-center justify-center"
            >
              [ &lt; DANCER MODE ]
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
};
