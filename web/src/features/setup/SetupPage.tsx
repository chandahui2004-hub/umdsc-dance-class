import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [setupCode, setSetupCode] = useState('');
  const [dbFolderUrl, setDbFolderUrl] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminDisplayName, setAdminDisplayName] = useState('Club Admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode.trim() || !dbFolderUrl.trim() || !adminUsername.trim() || !adminPassword) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await call('setup.init', {
        setupCode: setupCode.trim(),
        dbFolderUrl: dbFolderUrl.trim(),
        adminUsername: adminUsername.trim(),
        adminDisplayName: adminDisplayName.trim() || 'Club Admin',
        adminPassword
      });

      setSuccess(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[100dvh] px-starfield flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Panel title="SETUP COMPLETE" className="px-corners text-center space-y-4">
            <div className="bg-[var(--neon-green)] text-[var(--on-neon)] p-3 font-display text-[12px] border-2 border-[var(--outline)] shadow-[0_2px_0_var(--outline)]">
              INITIALIZATION SUCCESSFUL!
            </div>
            <p className="font-body text-base text-[var(--text-1)]">
              The club database and master sheets have been generated.
            </p>
            <div className="pt-4">
              <PixelButton
                variant="primary"
                size="lg"
                onClick={() => navigate('/admin/login')}
                className="w-full"
              >
                PROCEED TO LOGIN
              </PixelButton>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-starfield flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="font-display text-[24px] md:text-[32px] text-[var(--text-1)] px-glow-text">
          SYSTEM SETUP
        </h1>
        <p className="font-body text-[14px] text-[var(--text-2)] mt-1">
          First-Time Club Database Initialization
        </p>
      </div>

      <div className="w-full max-w-lg">
        <Panel title="FIRST-RUN CONFIG" className="px-corners">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className="bg-[var(--night-2)] border-2 border-[var(--neon-red)] text-[var(--neon-red)] p-3 text-[12px] font-body font-bold"
              >
                {error}
              </div>
            )}

            <Field
              label="Setup Code"
              type="password"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              disabled={loading}
              helper="From Script Properties (SETUP_CODE)"
              required
            />

            <Field
              label="Club DB Google Drive Folder URL or ID"
              type="text"
              value={dbFolderUrl}
              onChange={(e) => setDbFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              disabled={loading}
              required
            />

            <Field
              label="Admin Username"
              type="text"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              disabled={loading}
              required
            />

            <Field
              label="Admin Display Name"
              type="text"
              value={adminDisplayName}
              onChange={(e) => setAdminDisplayName(e.target.value)}
              disabled={loading}
              required
            />

            <Field
              label="Admin Password"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              disabled={loading}
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
                {loading ? 'INITIALIZING...' : 'INITIALIZE SYSTEM'}
              </PixelButton>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
};
