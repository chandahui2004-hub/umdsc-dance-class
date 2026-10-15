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
import type { TokenClaims, DancerBootstrap, SuggestionItem } from '@umdsc/shared';

interface DancerLoginResponse {
  token: string;
  claims: TokenClaims;
  bootstrap?: DancerBootstrap;
}

export const TitleScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const matricInputRef = React.useRef<HTMLInputElement>(null);

  const [loginMode, setLoginMode] = useState<'member' | 'walkin'>('member');
  const [fullName, setFullName] = useState('');
  const [matricRaw, setMatricRaw] = useState('');
  const [walkInCode, setWalkInCode] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [activeField, setActiveField] = useState<'name' | 'matric' | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced suggestion query
  React.useEffect(() => {
    if (loginMode !== 'member' || !activeField) {
      setSuggestions([]);
      return;
    }

    const query = activeField === 'name' ? fullName.trim() : matricRaw.trim();
    const minLen = activeField === 'name' ? 2 : 3;

    if (query.length < minLen) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await call<{ suggestions: SuggestionItem[] }>('auth.suggestDancers', {
          query,
          type: activeField
        });
        if (res.data?.suggestions) {
          setSuggestions(res.data.suggestions);
          setShowSuggestions(res.data.suggestions.length > 0);
        }
      } catch {
        // Silently ignore autocomplete network issues
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [fullName, matricRaw, activeField, loginMode]);

  const doLogin = async (targetName: string, targetMatric: string) => {
    setShowSuggestions(false);
    if (!targetName.trim() || !targetMatric.trim()) {
      setError('Please enter both Full Name and Matric Number.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await call<DancerLoginResponse>('auth.dancerLogin', {
        fullName: targetName.trim(),
        matric: targetMatric.trim(),
        matricRaw: targetMatric.trim()
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

  const selectSuggestion = (item: SuggestionItem) => {
    const chosenMatric = item.matric || item.matricMasked || '';
    setFullName(item.fullName);
    setMatricRaw(chosenMatric);
    setShowSuggestions(false);
    setActiveField(null);
    // Directly sign in when clicking a suggestion
    doLogin(item.fullName, chosenMatric);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(fullName, matricRaw);
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInCode.trim() || !walkInName.trim()) {
      setError('Please enter both Class Code and Your Name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await call<DancerLoginResponse>('auth.walkInLogin', {
        code: walkInCode.trim().toUpperCase(),
        name: walkInName.trim()
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
            {/* Login Mode Toggle */}
            <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-[var(--night-1)] border-2 border-[var(--outline)]">
              <button
                type="button"
                onClick={() => { setLoginMode('member'); setError(null); }}
                className={`py-2 px-1 font-display text-[11px] tracking-wider text-center cursor-pointer transition-none ${
                  loginMode === 'member'
                    ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                ★ MEMBER PASS
              </button>
              <button
                type="button"
                onClick={() => { setLoginMode('walkin'); setError(null); }}
                className={`py-2 px-1 font-display text-[11px] tracking-wider text-center cursor-pointer transition-none ${
                  loginMode === 'walkin'
                    ? 'bg-[var(--neon-cyan)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                ⚡ WALK-IN PASS
              </button>
            </div>

            {loginMode === 'member' ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[14px] font-body font-bold"
                  >
                    {error}
                  </div>
                )}

                <div className="relative">
                  <Field
                    label="Full Name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onFocus={() => {
                      setActiveField('name');
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setActiveField('name');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowSuggestions(false);
                    }}
                    placeholder="e.g. SARAH BINTI AHMAD"
                    disabled={loading}
                    required
                  />
                </div>

                <div className="relative">
                  <Field
                    label="Matric Number"
                    type="text"
                    autoComplete="username"
                    ref={matricInputRef}
                    value={matricRaw}
                    onFocus={() => {
                      setActiveField('matric');
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onChange={(e) => {
                      setMatricRaw(e.target.value);
                      setActiveField('matric');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowSuggestions(false);
                    }}
                    placeholder="e.g. 17201234"
                    disabled={loading}
                    helper="e.g. 17201234 or U2000000"
                    required
                  />
                </div>

                {showSuggestions && suggestions.length > 0 && (
                  <div
                    className="px-panel p-2 space-y-1 bg-[var(--night-2)] border-2 border-[var(--neon-gold)] shadow-[3px_3px_0_var(--outline)]"
                    role="listbox"
                    aria-label="Dancer suggestions"
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-[var(--outline)] text-[10px] font-display text-[var(--neon-gold)]">
                      <span>★ TOP MATCHING DANCERS:</span>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(false)}
                        className="text-[var(--text-3)] hover:text-[var(--text-1)] uppercase cursor-pointer"
                      >
                        [CLOSE]
                      </button>
                    </div>
                    <div className="space-y-1 pt-1">
                      {suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="w-full text-left p-2 px-well hover:border-[var(--neon-cyan)] hover:bg-[var(--night-1)] flex items-center justify-between gap-2 transition-none cursor-pointer"
                        >
                          <span className="font-display text-[12px] text-[var(--text-1)] font-bold truncate">
                            {s.fullName}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--neon-cyan)] bg-[var(--night-2)] px-1.5 py-0.5 border border-[var(--outline)] flex-shrink-0">
                            {s.matric || s.matricMasked}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
            ) : (
              <form onSubmit={handleWalkInSubmit} className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[14px] font-body font-bold"
                  >
                    {error}
                  </div>
                )}

                <Field
                  label="Class Code"
                  type="text"
                  value={walkInCode}
                  onChange={(e) => setWalkInCode(e.target.value.toUpperCase())}
                  placeholder="e.g. LCK-7X9"
                  disabled={loading}
                  helper="Enter the 6-character code provided by your instructor"
                  required
                />

                <Field
                  label="Your Name"
                  type="text"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. ALEX TAN"
                  disabled={loading}
                  helper="Your name for today's attendance record"
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
                    {loading ? 'CHECKING CODE...' : 'ENTER CLASS'}
                  </PixelButton>
                </div>
              </form>
            )}

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
