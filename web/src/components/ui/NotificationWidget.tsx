import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Member } from '@umdsc/shared';
import { call } from '../../lib/api';
import { useEvents } from '../../features/events/useCurrentEvent';
import { PixelButton } from './PixelButton';

type TabKey = 'new_dancers' | 'slot_progress' | 'system_audit';

interface AuditItem {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export const NotificationWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('new_dancers');
  const [dancerSearch, setDancerSearch] = useState('');
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());

  const { data: events = [] } = useEvents();
  const activeEvents = useMemo(() => events.filter(e => e.status === 'active'), [events]);

  // Query members for all active events to populate new dancers and slot progress
  const { data: allMembers = [] } = useQuery<Member[]>({
    queryKey: ['notification_members', activeEvents.map(e => e.id).join(',')],
    enabled: isOpen && activeEvents.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        activeEvents.map(async ev => {
          try {
            const res = await call<Member[]>('members.list', { eventId: ev.id });
            return (res.data || []).map(m => ({
              ...m,
              _eventName: ev.name,
              _eventId: ev.id
            })) as Member[];
          } catch {
            return [];
          }
        })
      );
      return results.flat();
    }
  });

  // Query audit logs
  const { data: auditLogs = [] } = useQuery<AuditItem[]>({
    queryKey: ['notification_audit'],
    enabled: isOpen,
    queryFn: async () => {
      try {
        const res = await call<AuditItem[]>('audit.list', { limit: 30 });
        return res.data || [];
      } catch {
        return [];
      }
    }
  });

  // 1. New dancers within the last 14 days
  const recentDancers = useMemo(() => {
    const fourteenDaysAgo = Date.now() - 14 * 24 * 3600 * 1000;
    return allMembers.filter(m => {
      if (!m.sourceTimestamp) return false;
      const ts = new Date(m.sourceTimestamp).getTime();
      return !isNaN(ts) && ts >= fourteenDaysAgo;
    });
  }, [allMembers]);

  const filteredDancers = useMemo(() => {
    if (!dancerSearch.trim()) return recentDancers;
    const q = dancerSearch.toLowerCase();
    return recentDancers.filter(
      d =>
        d.fullName.toLowerCase().includes(q) ||
        d.matricKey.toLowerCase().includes(q) ||
        (d.styleNames || []).some(s => s.toLowerCase().includes(q))
    );
  }, [recentDancers, dancerSearch]);

  // 2. Slot Progress per event and dance style
  const slotProgressList = useMemo(() => {
    const list: Array<{
      eventId: string;
      eventName: string;
      styleId: string;
      styleName: string;
      filled: number;
      capacity: number;
      percentage: number;
      isFull: boolean;
      isSingleStyle: boolean;
    }> = [];

    for (const ev of activeEvents) {
      let slotsMap: Record<string, number> = {};
      if (ev.styleSlots && typeof ev.styleSlots === 'object') {
        slotsMap = ev.styleSlots;
      } else if (ev.styleSlotsJson) {
        try {
          slotsMap = JSON.parse(ev.styleSlotsJson);
        } catch {
          slotsMap = {};
        }
      }

      const isSingleStyle = ev.styleIds.length === 1;

      for (const styleId of ev.styleIds) {
        const capacity = slotsMap[styleId] || 0;
        let filled = 0;

        if (isSingleStyle) {
          filled = ev.memberCount || 0;
        } else {
          filled = allMembers.filter(
            m => (m as any)._eventId === ev.id && m.styleIds.includes(styleId)
          ).length;
        }

        const percentage = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
        const isFull = capacity > 0 && filled >= capacity;

        list.push({
          eventId: ev.id,
          eventName: ev.name,
          styleId,
          styleName: styleId.replace(/^st_/, '').toUpperCase(),
          filled,
          capacity,
          percentage,
          isFull,
          isSingleStyle
        });
      }
    }

    return list;
  }, [activeEvents, allMembers]);

  // 3. System Alerts: errors, conflicts, variations
  const systemAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      type: 'error' | 'conflict' | 'variation';
      title: string;
      detail: string;
      ts?: string;
    }> = [];

    // Sync errors on active events
    for (const ev of activeEvents) {
      if (ev.lastSyncError) {
        alerts.push({
          id: `sync-err-${ev.id}`,
          type: 'error',
          title: `SYNC ERROR · ${ev.name}`,
          detail: ev.lastSyncError
        });
      }
    }

    // Matric conflicts detected from allMembers
    const matrics = new Map<string, Member[]>();
    for (const m of allMembers) {
      if (!m.matricKey) continue;
      if (!matrics.has(m.matricKey)) matrics.set(m.matricKey, []);
      matrics.get(m.matricKey)!.push(m);
    }
    for (const [matric, list] of matrics.entries()) {
      if (list.length > 1) {
        const names = Array.from(new Set(list.map(m => m.fullName)));
        if (names.length > 1) {
          alerts.push({
            id: `conflict-${matric}`,
            type: 'conflict',
            title: `MATRIC CONFLICT · ${matric}`,
            detail: `Multiple dancers share matric ${matric}: ${names.join(', ')}`
          });
        }
      }
    }

    return alerts.filter(a => !dismissedAlertIds.has(a.id));
  }, [activeEvents, allMembers, dismissedAlertIds]);

  // Overall unread/alert count
  const hasErrors = systemAlerts.some(a => a.type === 'error' || a.type === 'conflict');
  const alertCount = systemAlerts.length + recentDancers.length;

  return (
    <>
      {/* Floating Retro Bell Button (Top-Right) */}
      <div className="fixed top-14 right-3 sm:top-5 sm:right-6 z-40">
        <button
          type="button"
          data-testid="notification-bell-btn"
          aria-label="Open notifications"
          onClick={() => setIsOpen(v => !v)}
          className={`relative w-12 h-12 flex items-center justify-center border-4 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--outline)] transition-transform ${
            hasErrors
              ? 'bg-[var(--neon-red)] text-white animate-pulse'
              : 'bg-[var(--neon-gold)] text-[var(--on-neon)] hover:scale-105'
          }`}
        >
          <span className="text-xl select-none">🔔</span>
          {alertCount > 0 && (
            <span
              className={`absolute -top-2 -right-2 px-1.5 py-0.2 border-2 border-[var(--outline)] font-display text-[11px] font-bold shadow-[1px_1px_0_var(--outline)] ${
                hasErrors
                  ? 'bg-[var(--neon-red)] text-white'
                  : 'bg-[var(--neon-cyan)] text-[var(--on-neon)]'
              }`}
            >
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>
      </div>

      {/* Retro Cyberpunk Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Body */}
          <div
            data-testid="notification-drawer"
            className="relative w-full max-w-md sm:max-w-lg h-full bg-[var(--night-1)] border-l-4 border-[var(--outline)] shadow-[-6px_0_0_var(--outline)] flex flex-col z-10"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b-2 border-[var(--outline)] bg-[var(--night-2)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔔</span>
                <div>
                  <h2 className="font-display text-[15px] text-[var(--neon-cyan)] uppercase font-bold tracking-wider">
                    NOTIFICATION CENTER
                  </h2>
                  <p className="font-mono text-[11px] text-[var(--text-3)]">
                    Real-time operational alerts & status
                  </p>
                </div>
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
                ✕ CLOSE
              </PixelButton>
            </div>

            {/* 3 Tab Headers */}
            <div role="tablist" className="flex border-b-2 border-[var(--outline)] bg-[var(--night-3)]">
              <button
                role="tab"
                type="button"
                aria-selected={activeTab === 'new_dancers'}
                onClick={() => setActiveTab('new_dancers')}
                className={`flex-1 py-2.5 px-2 font-display text-[11px] font-bold text-center border-r-2 border-[var(--outline)] transition-colors ${
                  activeTab === 'new_dancers'
                    ? 'bg-[var(--night-1)] text-[var(--neon-cyan)] border-b-2 border-b-transparent'
                    : 'bg-transparent text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                NEW DANCERS ({recentDancers.length})
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={activeTab === 'slot_progress'}
                onClick={() => setActiveTab('slot_progress')}
                className={`flex-1 py-2.5 px-2 font-display text-[11px] font-bold text-center border-r-2 border-[var(--outline)] transition-colors ${
                  activeTab === 'slot_progress'
                    ? 'bg-[var(--night-1)] text-[var(--neon-gold)] border-b-2 border-b-transparent'
                    : 'bg-transparent text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                SLOT PROGRESS ({slotProgressList.length})
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={activeTab === 'system_audit'}
                onClick={() => setActiveTab('system_audit')}
                className={`flex-1 py-2.5 px-2 font-display text-[11px] font-bold text-center transition-colors ${
                  activeTab === 'system_audit'
                    ? 'bg-[var(--night-1)] text-[var(--neon-red)] border-b-2 border-b-transparent'
                    : 'bg-transparent text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
              >
                SYSTEM & AUDIT {systemAlerts.length > 0 && `(${systemAlerts.length})`}
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto pixel-scrollbar p-4 space-y-4">
              {/* TAB 1: NEW DANCERS */}
              {activeTab === 'new_dancers' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search new dancers by name or matric…"
                      value={dancerSearch}
                      onChange={e => setDancerSearch(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-[var(--night-2)] border-2 border-[var(--outline)] text-xs text-[var(--text-1)] font-body placeholder:text-[var(--text-3)] focus:border-[var(--neon-cyan)] outline-none"
                    />
                  </div>

                  {filteredDancers.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-[var(--outline)] bg-[var(--night-2)]">
                      <p className="font-display text-xs text-[var(--text-2)]">
                        NO NEW DANCERS IN THE LAST 14 DAYS
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredDancers.map((d, i) => (
                        <div
                          key={d.memberId || `${d.matricKey}-${i}`}
                          className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] space-y-1.5 shadow-[2px_2px_0_var(--outline)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-display text-sm text-[var(--text-1)] font-bold">
                                {d.fullName}
                              </p>
                              <p className="font-mono text-xs text-[var(--neon-cyan)]">
                                {d.matricRaw || d.matricKey}
                              </p>
                            </div>
                            {(d as any)._eventName && (
                              <span className="px-2 py-0.5 border border-[var(--outline)] bg-[var(--night-3)] font-display text-[10px] text-[var(--neon-gold)]">
                                {(d as any)._eventName}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {(d.styleNames || d.styleIds).map((s, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.2 border border-[var(--outline)] bg-[var(--night-1)] font-display text-[10px] text-[var(--text-2)]"
                              >
                                {s}
                              </span>
                            ))}
                          </div>

                          {d.sourceTimestamp && (
                            <p className="font-mono text-[10px] text-[var(--text-3)]">
                              Registered: {new Date(d.sourceTimestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SLOT PROGRESS */}
              {activeTab === 'slot_progress' && (
                <div className="space-y-3">
                  {slotProgressList.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-[var(--outline)] bg-[var(--night-2)]">
                      <p className="font-display text-xs text-[var(--text-2)]">
                        NO ACTIVE SLOTS CONFIGURED
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {slotProgressList.map((sp, idx) => {
                        const isFull = sp.isFull;
                        const isAlmost = !isFull && sp.percentage >= 80;
                        return (
                          <div
                            key={`${sp.eventId}-${sp.styleId}-${idx}`}
                            className="p-3 border-2 border-[var(--outline)] bg-[var(--night-2)] space-y-2 shadow-[2px_2px_0_var(--outline)]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <h3 className="font-display text-xs text-[var(--text-1)] font-bold">
                                  {sp.eventName} · {sp.styleName}
                                </h3>
                              </div>
                              <span
                                className={`px-2 py-0.5 border border-[var(--outline)] font-display text-[10px] font-bold shadow-[1px_1px_0_var(--outline)] ${
                                  isFull
                                    ? 'bg-[var(--neon-red)] text-white'
                                    : isAlmost
                                      ? 'bg-[var(--neon-gold)] text-[var(--on-neon)]'
                                      : 'bg-[var(--neon-green)] text-[var(--on-neon)]'
                                }`}
                              >
                                {isFull ? 'FULL HOUSE' : isAlmost ? 'ALMOST FULL' : 'AVAILABLE'}
                              </span>
                            </div>

                            {/* Retro Visual Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-mono text-[11px] text-[var(--text-2)]">
                                <span>CAPACITY:</span>
                                <span>
                                  {sp.filled} / {sp.capacity || '∞'} ({sp.percentage}%)
                                </span>
                              </div>
                              <div className="w-full h-3 bg-[var(--night-3)] border border-[var(--outline)] overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    isFull
                                      ? 'bg-[var(--neon-red)]'
                                      : isAlmost
                                        ? 'bg-[var(--neon-gold)]'
                                        : 'bg-[var(--neon-cyan)]'
                                  }`}
                                  style={{ width: `${Math.min(100, sp.percentage)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SYSTEM & AUDIT */}
              {activeTab === 'system_audit' && (
                <div className="space-y-4">
                  {/* System Alerts */}
                  <div className="space-y-2">
                    <h3 className="font-display text-[11px] text-[var(--text-2)] tracking-wider">
                      ACTIVE SYSTEM ALERTS ({systemAlerts.length})
                    </h3>
                    {systemAlerts.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--neon-green)] p-2 bg-[var(--night-2)] border border-[var(--outline)]">
                        ✓ All systems clear · No matric conflicts or sync errors detected.
                      </p>
                    ) : (
                      systemAlerts.map(alert => (
                        <div
                          key={alert.id}
                          className="p-3 border-2 border-[var(--neon-red)] bg-[var(--night-2)] space-y-1 shadow-[2px_2px_0_var(--outline)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-xs text-[var(--neon-red)] font-bold">
                              ⚠️ {alert.title}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDismissedAlertIds(prev => new Set([...prev, alert.id]))
                              }
                              className="font-mono text-[10px] text-[var(--text-3)] hover:text-white"
                            >
                              [ DISMISS ]
                            </button>
                          </div>
                          <p className="font-body text-xs text-[var(--text-1)]">{alert.detail}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Recent Audit Log Activity */}
                  <div className="space-y-2 pt-2 border-t border-[var(--outline)]">
                    <h3 className="font-display text-[11px] text-[var(--text-2)] tracking-wider">
                      RECENT AUDIT LOG
                    </h3>
                    {auditLogs.length === 0 ? (
                      <p className="font-mono text-xs text-[var(--text-3)]">No recent audit logs.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pixel-scrollbar pr-1">
                        {auditLogs.map(log => (
                          <div
                            key={log.id}
                            className="p-2 border border-[var(--outline)] bg-[var(--night-2)] font-mono text-[11px] space-y-0.5"
                          >
                            <div className="flex justify-between text-[var(--neon-cyan)]">
                              <span className="font-bold">{log.action}</span>
                              <span className="text-[10px] text-[var(--text-3)]">
                                {log.ts ? new Date(log.ts).toLocaleTimeString() : ''}
                              </span>
                            </div>
                            <p className="text-[var(--text-2)] truncate">
                              Target: {log.target} {log.detail ? `· ${log.detail}` : ''}
                            </p>
                            <p className="text-[10px] text-[var(--text-3)]">Actor: {log.actor}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default NotificationWidget;
