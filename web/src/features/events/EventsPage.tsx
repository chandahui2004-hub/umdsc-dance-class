import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DanceStyle } from '@umdsc/shared';
import { call } from '../../lib/api';
import { PixelButton } from '../../components/ui/PixelButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useEvents } from './useCurrentEvent';
import { EventCard } from './EventCard';
import { FolderLinksHeader } from './FolderLinksHeader';

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: events = [], isLoading } = useEvents();
  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => (await call<DanceStyle[]>('styles.list')).data
  });
  const [showArchived, setShowArchived] = useState(false);

  const active = events.filter(e => e.status === 'active');
  const archived = events.filter(e => e.status === 'archived');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">Events</h1>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            Monthly classes, trial classes and workshops — one registration form each.
          </p>
        </div>
        <PixelButton size="md" onClick={() => navigate('/admin/events/new')}>
          + NEW EVENT
        </PixelButton>
      </div>

      <FolderLinksHeader />

      <section data-testid="active-events" className="space-y-3">
        <h2 className="font-display text-sm text-[var(--c-ink)]">ACTIVE EVENTS</h2>
        {isLoading ? (
          <p className="font-display text-xs text-[var(--c-ink)]">LOADING…</p>
        ) : active.length === 0 ? (
          <EmptyState
            title="NO ACTIVE EVENTS"
            description="Create an event from its Google Form response sheet."
            action={
              <PixelButton size="md" onClick={() => navigate('/admin/events/new')}>
                + NEW EVENT
              </PixelButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {active.map(e => (
              <EventCard key={e.id} event={e} styles={styles} />
            ))}
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section data-testid="archived-events" className="space-y-3">
          <PixelButton size="md" variant="secondary" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? '▼' : '▶'} ARCHIVED EVENTS ({archived.length})
          </PixelButton>
          {showArchived && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {archived.map(e => (
                <EventCard key={e.id} event={e} styles={styles} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default EventsPage;
