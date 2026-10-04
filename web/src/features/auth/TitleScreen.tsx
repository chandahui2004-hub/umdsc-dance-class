import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { call, errorMessage } from '../../lib/api';
import { session } from '../../lib/session';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { CityBackdrop } from '../../components/art/CityBackdrop';
import { Boombox } from '../../components/art/Boombox';
import { LogoBadge } from '../../components/ui/LogoBadge';
import type { TokenClaims, DancerBootstrap } from '@umdsc/shared';

interface DancerLoginResponse {
  token: string;
  claims: TokenClaims;
  bootstrap?: DancerBootstrap;
}

export const TitleScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [matricRaw, setMatricRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !matricRaw.trim()) {
      setError('Please enter both Full Name and Matric Number.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await call<DancerLoginResponse>('auth.dancerLogin', {
        fullName: fullName.trim(),
        matric: matricRaw.trim(),
        matricRaw: matricRaw.trim()
      });

      const { token, claims, bootstrap } = res.data;
      session.set(token, claims, true);

      if (bootstrap) {
        localStorage.setItem(
          `boot:dancer:${claims.sub}`,
          JSON.stringify({
            data: bootstrap,
            dataVersion: res.dataVersion
          })
        );
      }

      const target = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden">
      <CityBackdrop />
      <div className="relative z-[var(--z-content)] min-h-[100dvh] flex flex-col items-center justify-center p-4 py-8 md:py-12">
        {/* 8-bit Title Header */}
        <div className="text-center mb-5 flex flex-col items-center">
          <div className="flex justify-center mb-2.5">
            <div className="hidden sm:block">
              <LogoBadge height={96} />
            </div>
            <div className="sm:hidden">
              <LogoBadge height={80} />
            </div>
          </div>
          <div className="inline-block bg-[var(--night-2)] text-[var(--neon-gold)] px-3 py-1.5 border-2 border-[var(--outline)] shadow-[3px_3px_0_var(--outline)] mb-2.5">
            <span className="font-display text-[10px] md:text-[10px] tracking-widest">★ 8-BIT EDITION ★</span>
          </div>
          <h1
            className="font-display text-2xl md:text-3xl text-[var(--text-1)] tracking-wider mb-1 px-glow-text"
            style={{ '--glow': 'var(--neon-gold)' } as React.CSSProperties}
          >
            UMDSC
          </h1>
          <p className="font-display text-[10px] md:text-[10px] text-[var(--text-2)] tracking-wider">
            DANCE CLASS SYSTEM
          </p>
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <Boombox size={64} className="drop-shadow-[0_0_12px_rgba(62,230,255,0.7)]" />
            <span
              className="font-display text-[10px] md:text-[12px] text-[var(--neon-gold)] px-glow-text px-blink tracking-widest min-h-[16px]"
              style={{ '--glow': 'var(--neon-gold)' } as React.CSSProperties}
            >
              ▼ PRESS START ▼
            </span>
          </div>
        </div>

        {/* Player Select Panel */}
        <div className="w-full max-w-md">
          <Panel title="PLAYER SELECT" className="px-corners">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[14px] font-body font-bold"
                >
                  {error}
                </div>
              )}

              <Field
                label="Full Name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. SARAH BINTI AHMAD"
                disabled={loading}
                required
              />

              <Field
                label="Matric Number"
                type="text"
                autoComplete="username"
                value={matricRaw}
                onChange={(e) => setMatricRaw(e.target.value)}
                placeholder="e.g. 17201234"
                disabled={loading}
                helper="e.g. 17201234 or U2000000"
                required
              />

              <div className="pt-2">
                <PixelButton
                  variant="primary"
                  size="lg"
                  type="submit"
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'LOADING...' : 'ENTER'}
                </PixelButton>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t-2 border-[var(--outline)] text-center">
              <Link
                to="/admin/login"
                className="font-display text-[12px] text-[var(--neon-cyan)] hover:underline inline-flex items-center justify-center py-2 min-h-[44px]"
              >
                [ ADMIN MODE ]
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
