import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ClassSession, DanceStyle, EventListItem } from '@umdsc/shared';
import { call } from '../../lib/api';
import { todayKL } from '../../lib/time';
import { Panel } from '../../components/ui/Panel';
import { useEvents } from './useCurrentEvent';
import { EventDraft, emptyDraft, draftFromEvent, pruneSchedule } from './eventDraft';
import { FormLinkStep } from './steps/FormLinkStep';
import { EventDetailsStep } from './steps/EventDetailsStep';
import { StylesStep } from './steps/StylesStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { ReviewStep } from './steps/ReviewStep';

export interface StepProps {
  draft: EventDraft;
  onChange(patch: Partial<EventDraft>): void;
  onNext(): void;
  onBack(): void;
  isEdit: boolean;
  eventId?: string;
  event?: EventListItem;
  events: EventListItem[];
  styles: DanceStyle[];
}

const STEPS = ['FORM LINK', 'DETAILS', 'STYLES', 'SCHEDULE', 'REVIEW'];

/** New event (/admin/events/new) or edit an existing one (/admin/events/:id/edit). */
export const EventWizard: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const { data: events = [] } = useEvents();
  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => (await call<DanceStyle[]>('styles.list')).data
  });
  const { data: sessions } = useQuery<ClassSession[]>({
    queryKey: ['sessions', id, 'all'],
    enabled: isEdit,
    queryFn: async () => (await call<ClassSession[]>('sessions.list', { eventId: id })).data
  });

  const event = events.find(e => e.id === id);
  const [draft, setDraft] = useState<EventDraft>(() => emptyDraft(todayKL()));
  const [loaded, setLoaded] = useState(!isEdit);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isEdit && !loaded && event && sessions) {
      setDraft(draftFromEvent(event, sessions));
      setLoaded(true);
    }
  }, [isEdit, loaded, event, sessions]);

  const onChange = (patch: Partial<EventDraft>) => setDraft(d => pruneSchedule({ ...d, ...patch }));
  const props: StepProps = {
    draft,
    onChange,
    onNext: () => setStep(s => Math.min(s + 1, STEPS.length - 1)),
    onBack: () => (step === 0 ? navigate('/admin/events') : setStep(s => s - 1)),
    isEdit,
    eventId: id,
    event,
    events,
    styles
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[24px] text-[var(--text-1)]">{isEdit ? `Edit ${event?.name || 'event'}` : 'New event'}</h1>

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`px-3 py-1 border-2 border-[var(--outline)] font-display text-[12px] ${
              i === step
                ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                : i < step
                ? 'bg-[var(--neon-green)] text-[var(--on-neon)] font-bold'
                : 'bg-[var(--night-2)] text-[var(--text-2)]'
            }`}
          >
            {i + 1} {label}
          </li>
        ))}
      </ol>

      {!loaded ? (
        <p className="font-display text-[12px] text-[var(--text-1)] px-blink">LOADING EVENT…</p>
      ) : (
        <Panel title={`STEP ${step + 1}: ${STEPS[step]}`}>
          {step === 0 && <FormLinkStep {...props} />}
          {step === 1 && <EventDetailsStep {...props} />}
          {step === 2 && <StylesStep {...props} />}
          {step === 3 && <ScheduleStep {...props} />}
          {step === 4 && <ReviewStep {...props} />}
        </Panel>
      )}
    </div>
  );
};

export default EventWizard;
