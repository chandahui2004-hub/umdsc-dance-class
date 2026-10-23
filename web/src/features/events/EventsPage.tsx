import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DanceStyle, EventListItem } from '@umdsc/shared';
import { call } from '../../lib/api';
import { PixelButton } from '../../components/ui/PixelButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useEvents } from './useCurrentEvent';
import { EventCard } from './EventCard';

const TYPE_LABEL: Record<string, string> = {
  monthly: 'Monthly class',
  trial: 'Trial class',
  workshop: 'Workshop',
  other: 'Other'
};

interface CollapsibleEventItemProps {
  event: EventListItem;
  styles: DanceStyle[];
  isExpanded: boolean;
  onToggle: () => void;
}

const CollapsibleEventItem: React.FC<CollapsibleEventItemProps> = ({
  event,
  styles,
  isExpanded,
  onToggle
}) => {
  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid={`toggle-event-${event.id}`}
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 border-2 border-[var(--outline)] bg-[var(--night-2)] hover:border-[var(--neon-cyan)] transition-colors flex items-center justify-between gap-3 shadow-[2px_2px_0_var(--outline)] group"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-[var(--neon-cyan)] group-hover:scale-110 transition-transform">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="font-display text-[14px] sm:text-[15px] text-[var(--text-1)] font-bold truncate">
            {event.name}
          </span>
          <span className="font-body text-[12px] text-[var(--text-2)] hidden sm:inline">
            · {TYPE_LABEL[event.type] || event.type}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-3)] hidden md:inline">
            ({event.startDate} → {event.endDate})
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--neon-gold)] text-[var(--on-neon)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)]">
            {event.memberCount} DANCERS
          </span>
          <span className="font-mono text-xs text-[var(--text-2)] border border-[var(--outline)] px-1.5 py-0.5 bg-[var(--night-3)]">
            {isExpanded ? 'COLLAPSE ▲' : 'EXPAND ▼'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="pl-2 sm:pl-4 border-l-2 border-[var(--neon-cyan)]">
          <EventCard event={event} styles={styles} />
        </div>
      )}
    </div>
  );
};

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: events = [], isLoading } = useEvents();
  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => (await call<DanceStyle[]>('styles.list')).data
  });
  const [showArchived, setShowArchived] = useState(false);
  const [expandedActiveIds, setExpandedActiveIds] = useState<Set<string>>(new Set());
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [expandedArchivedIds, setExpandedArchivedIds] = useState<Set<string>>(new Set());

  const active = useMemo(() => events.filter(e => e.status === 'active'), [events]);
  const archived = useMemo(() => events.filter(e => e.status === 'archived'), [events]);

  const archivedByYear = useMemo(() => {
    const map = new Map<string, EventListItem[]>();
    for (const ev of archived) {
      const year = ev.startDate ? ev.startDate.slice(0, 4) : 'Other';
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(ev);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [archived]);

  const allActiveExpanded = active.length > 0 && active.every(e => expandedActiveIds.has(e.id));

  const toggleAllActive = () => {
    if (allActiveExpanded) {
      setExpandedActiveIds(new Set());
    } else {
      setExpandedActiveIds(new Set(active.map(e => e.id)));
    }
  };

  const toggleActive = (id: string) => {
    setExpandedActiveIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleYear = (year: string) => {
    setOpenYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleArchived = (id: string) => {
    setExpandedArchivedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] text-[var(--text-1)]">Events</h1>
          <p className="font-body text-[14px] text-[var(--text-2)]">
            Monthly classes, trial classes and workshops — one registration form each.
          </p>
        </div>
        <PixelButton size="md" variant="primary" onClick={() => navigate('/admin/events/new')}>
          + NEW EVENT
        </PixelButton>
      </div>

      <section data-testid="active-events" className="space-y-3">
        <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--outline)] pb-2">
          <h2 className="font-display text-[12px] text-[var(--text-1)] tracking-wider">
            ACTIVE EVENTS ({active.length})
          </h2>
          {active.length > 0 && (
            <PixelButton size="sm" variant="ghost" onClick={toggleAllActive}>
              {allActiveExpanded ? '▲ COLLAPSE ALL' : '▼ EXPAND ALL'}
            </PixelButton>
          )}
        </div>

        {isLoading ? (
          <p className="font-display text-[12px] text-[var(--text-1)] px-blink">LOADING…</p>
        ) : active.length === 0 ? (
          <EmptyState
            scene="shutter"
            title="NO ACTIVE EVENTS"
            description="Create an event from its Google Form response sheet."
            action={
              <PixelButton size="md" variant="primary" onClick={() => navigate('/admin/events/new')}>
                + NEW EVENT
              </PixelButton>
            }
          />
        ) : (
          <div className="space-y-3">
            {active.map(e => (
              <CollapsibleEventItem
                key={e.id}
                event={e}
                styles={styles}
                isExpanded={expandedActiveIds.has(e.id)}
                onToggle={() => toggleActive(e.id)}
              />
            ))}
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section data-testid="archived-events" className="space-y-4 pt-4 border-t-2 border-[var(--outline)]">
          <PixelButton size="md" variant="secondary" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? '▼' : '▶'} ARCHIVED EVENTS ({archived.length})
          </PixelButton>

          {showArchived && (
            <div className="space-y-4 pl-2 sm:pl-4 border-l-2 border-[var(--outline)]">
              {archivedByYear.map(([year, yearEvents]) => {
                const isYearOpen = openYears.has(year);
                return (
                  <div key={year} className="space-y-2">
                    <PixelButton
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleYear(year)}
                      className="w-full !justify-start text-left font-display text-[13px] text-[var(--neon-gold)]"
                    >
                      {isYearOpen ? '▼' : '▶'} 📁 {year} ARCHIVED EVENTS ({yearEvents.length})
                    </PixelButton>

                    {isYearOpen && (
                      <div className="space-y-2 pl-2 sm:pl-4">
                        {yearEvents.map(e => (
                          <CollapsibleEventItem
                            key={e.id}
                            event={e}
                            styles={styles}
                            isExpanded={expandedArchivedIds.has(e.id)}
                            onToggle={() => toggleArchived(e.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default EventsPage;
