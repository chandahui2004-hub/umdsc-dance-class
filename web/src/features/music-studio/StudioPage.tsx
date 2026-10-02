import React from 'react';
import { Studio } from './Studio';

export const StudioPage: React.FC = () => {
  return (
    <div className="w-full min-h-screen bg-[var(--night-1)]">
      <Studio />
    </div>
  );
};

export default StudioPage;
