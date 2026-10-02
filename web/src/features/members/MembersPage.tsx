import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { useBootstrap } from '../auth/useBootstrap';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { getStyleColor } from '../../theme/colors';
import { exportToCsv } from '../../lib/csv';
import type { Member } from '@umdsc/shared';
import { useCurrentEvent } from '../events/useCurrentEvent';

type AugmentedMember = Member & { eventNames?: string[] };

export const MembersPage: React.FC = () => {
  const { data: bootstrap } = useBootstrap('admin');
  const { events, current: event, isAll } = useCurrentEvent();
  const eventId = event?.id || '';
  const [selectedStyleId, setSelectedStyleId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<AugmentedMember | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Members of the event chosen in the picker, or all events combined
  const {
    data: members = [],
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery<AugmentedMember[]>({
    queryKey: ['members', isAll ? 'all' : eventId, events.map((e) => e.id).join(',')],
    enabled: isAll ? events.length > 0 : Boolean(eventId),
    queryFn: async () => {
      if (isAll) {
        const results = await Promise.all(
          events.map(async (ev) => {
            try {
              const res = await call<Member[]>('members.list', { eventId: ev.id });
              return (res.data || []).map((m) => ({ ...m, _eventName: ev.name }));
            } catch {
              return [];
            }
          })
        );
        const flat = results.flat();
        const dedupedMap = new Map<string, AugmentedMember>();

        for (const m of flat) {
          const key = (m.matricKey || m.matricRaw || m.fullName).trim().toLowerCase();
          const existing = dedupedMap.get(key);
          const evName = (m as any)._eventName;
          if (!existing) {
            dedupedMap.set(key, {
              ...m,
              styleNames: Array.from(new Set(m.styleNames || [])),
              styleIds: Array.from(new Set(m.styleIds || [])),
              eventNames: evName ? [evName] : []
            });
          } else {
            const combinedStyles = Array.from(new Set([...(existing.styleNames || []), ...(m.styleNames || [])]));
            const combinedStyleIds = Array.from(new Set([...(existing.styleIds || []), ...(m.styleIds || [])]));
            const combinedEvents = Array.from(
              new Set([...(existing.eventNames || []), evName].filter(Boolean))
            ) as string[];
            dedupedMap.set(key, {
              ...existing,
              styleNames: combinedStyles,
              styleIds: combinedStyleIds,
              eventNames: combinedEvents,
              flags: Array.from(new Set([...(existing.flags || []), ...(m.flags || [])]))
            });
          }
        }
        return Array.from(dedupedMap.values());
      }

      const res = await call<Member[]>('members.list', { eventId });
      return (res.data || []) as AugmentedMember[];
    }
  });

  // Filter members by style and search query
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Style filter
      if (selectedStyleId !== 'all') {
        const styleObj = bootstrap?.styles?.find((s) => s.id === selectedStyleId);
        const targetTokens = new Set([
          selectedStyleId.toLowerCase(),
          ...(styleObj
            ? [
                styleObj.id.toLowerCase(),
                styleObj.name.toLowerCase(),
                ...(styleObj.aliases || []).map((a) => a.toLowerCase().trim())
              ]
            : [])
        ]);
        const mTokens = [...(m.styleIds || []), ...(m.styleNames || [])].map((t) =>
          String(t).toLowerCase().trim()
        );
        const matches =
          mTokens.some((t) => targetTokens.has(t)) ||
          mTokens.some((mt) =>
            Array.from(targetTokens).some(
              (tt) => tt.length >= 3 && (mt.includes(tt) || tt.includes(mt))
            )
          );
        if (!matches) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = m.fullName.toLowerCase().includes(q);
        const matricMatch = m.matricRaw.toLowerCase().includes(q) || m.matricKey.toLowerCase().includes(q);
        const contactMatch = m.contact.toLowerCase().includes(q);
        const emailMatch = m.email.toLowerCase().includes(q);
        return nameMatch || matricMatch || contactMatch || emailMatch;
      }

      return true;
    });
  }, [members, selectedStyleId, searchQuery]);

  // CSV Export handler
  const handleExportCsv = () => {
    if (!filteredMembers.length) return;
    const headers = [
      { key: 'fullName', label: 'Full Name' },
      { key: 'matricRaw', label: 'Matric Number' },
      { key: 'contact', label: 'Contact Number' },
      { key: 'email', label: 'Email' },
      { key: 'gender', label: 'Gender' },
      { key: 'nationality', label: 'Nationality' },
      ...(isAll ? [{ key: 'eventNames', label: 'Events' }] : []),
      { key: 'styleNames', label: 'Classes Registered' },
      { key: 'sourceTimestamp', label: 'Registered Timestamp' }
    ];

    const exportRows = filteredMembers.map((m) => ({
      ...m,
      eventNames: m.eventNames?.join(', ') || '',
      styleNames: m.styleNames?.join(', ') || ''
    }));

    const filename = isAll
      ? 'all_registered_dancers.csv'
      : `dancers_${(event?.name || 'event').replace(/\s+/g, '_')}.csv`;
    exportToCsv(filename, exportRows, headers);
  };

  const formatWhatsAppUrl = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    const full = cleaned.startsWith('60') ? cleaned : cleaned.startsWith('0') ? '6' + cleaned : cleaned;
    return `https://wa.me/${full}`;
  };

  const renderRosterList = () => (
    <div className="space-y-2">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto bg-[var(--night-2)] border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] max-h-[600px] overflow-y-auto pixel-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--night-2)] text-[var(--text-1)] font-display text-[12px] border-b-2 border-[var(--neon-cyan)] shadow-[0_2px_0_var(--outline)]">
            <tr>
              <th className="p-3">FULL NAME</th>
              <th className="p-3">MATRIC NO.</th>
              <th className="p-3">CONTACT</th>
              <th className="p-3">EMAIL</th>
              <th className="p-3">GENDER</th>
              {isAll && <th className="p-3">EVENTS</th>}
              <th className="p-3">CLASSES</th>
              <th className="p-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-[var(--outline)] font-body text-[14px]">
            {filteredMembers.map((m) => (
              <tr
                key={m.memberId + (m.matricKey || '')}
                className="min-h-[48px] h-12 odd:bg-[var(--night-2)] even:bg-[var(--violet-1)] hover:bg-[var(--violet-2)] transition-none"
              >
                <td className="p-3 font-bold text-[var(--text-1)]">
                  {m.fullName}
                  {m.flags && m.flags.length > 0 && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 bg-[var(--neon-gold)] text-[var(--on-neon)] text-[12px] font-display border border-[var(--outline)] font-bold">
                      FLAGGED
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono text-[var(--text-1)] font-bold text-[12px]">
                  {m.matricRaw}
                </td>
                <td className="p-3">
                  <a
                    href={formatWhatsAppUrl(m.contact)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--neon-green)] hover:underline inline-flex items-center gap-1 font-mono font-bold text-[12px]"
                  >
                    {m.contact}
                  </a>
                </td>
                <td className="p-3 font-body text-[14px] text-[var(--text-2)] truncate max-w-[200px]">
                  <a
                    href={`mailto:${m.email}`}
                    className="hover:underline hover:text-[var(--neon-cyan)]"
                  >
                    {m.email}
                  </a>
                </td>
                <td className="p-3 font-display text-[12px]">
                  <span className="inline-block px-1.5 py-0.5 bg-[var(--night-1)] border border-[var(--outline)] text-[var(--text-1)]">
                    {m.gender || '-'}
                  </span>
                </td>
                {isAll && (
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {m.eventNames?.map((ev) => (
                        <span
                          key={ev}
                          className="px-1.5 py-0.5 text-[12px] font-display bg-[var(--night-1)] text-[var(--text-1)] border border-[var(--outline)]"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                )}
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {m.styleNames?.map((sName) => {
                      const styleObj = bootstrap?.styles?.find((s) => s.name.toLowerCase() === sName.toLowerCase());
                      const c = getStyleColor(styleObj?.colorKey);
                      return (
                        <span
                          key={sName}
                          style={{ backgroundColor: c }}
                          className="px-2 py-0.5 text-[12px] font-display text-[var(--on-neon)] font-bold border border-[var(--outline)]"
                        >
                          {sName}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="p-3 text-right">
                  <PixelButton
                    variant="secondary"
                    size="md"
                    onClick={() => setSelectedMember(m)}
                    className="min-h-[36px]"
                  >
                    DETAILS
                  </PixelButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2 max-h-[600px] overflow-y-auto pixel-scrollbar p-1">
        {filteredMembers.map((m) => (
          <div
            key={m.memberId + (m.matricKey || '')}
            className="px-panel p-3 border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)] space-y-2 bg-[var(--night-2)]"
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-body font-bold text-[16px] text-[var(--text-1)]">
                  {m.fullName}
                </h3>
                <p className="font-mono font-bold text-[12px] text-[var(--text-2)]">
                  {m.matricRaw} · {m.gender || 'N/A'}
                </p>
                {isAll && m.eventNames && m.eventNames.length > 0 && (
                  <p className="font-display text-[12px] text-[var(--neon-cyan)] mt-0.5">
                    {m.eventNames.join(' · ')}
                  </p>
                )}
              </div>
              <PixelButton
                variant="secondary"
                size="md"
                onClick={() => setSelectedMember(m)}
                className="min-h-[36px] px-2 text-[12px]"
              >
                INFO
              </PixelButton>
            </div>

            {/* Style Badges */}
            <div className="flex flex-wrap gap-1">
              {m.styleNames?.map((sName) => {
                const styleObj = bootstrap?.styles?.find((s) => s.name.toLowerCase() === sName.toLowerCase());
                const c = getStyleColor(styleObj?.colorKey);
                return (
                  <span
                    key={sName}
                    style={{ backgroundColor: c }}
                    className="px-2 py-0.5 text-[12px] font-display text-[var(--on-neon)] font-bold border border-[var(--outline)]"
                  >
                    {sName}
                  </span>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-[var(--outline)] text-[12px]">
              <a
                href={formatWhatsAppUrl(m.contact)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--neon-green)] font-mono font-bold underline"
              >
                WA: {m.contact}
              </a>
              <span className="font-body text-[var(--text-2)] truncate max-w-[150px]">
                {m.email}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--night-1)] p-3 md:p-6 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-panel border-2 border-[var(--outline)] shadow-[4px_4px_0_var(--outline)] p-3 bg-[var(--night-2)]">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-[16px] text-[var(--text-1)]">
              {isAll ? 'ALL REGISTERED DANCERS (COMBINED)' : `ROSTER: ${event?.name || 'EVENT'}`}
            </h2>
            <span className="font-display text-[12px] bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold px-2 py-1 border border-[var(--outline)]">
              {filteredMembers.length} DANCERS
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dancer..."
              className="min-h-[44px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] font-body text-[16px] text-[var(--text-1)] px-well placeholder:text-[var(--text-3)]"
            />
            <PixelButton
              variant="secondary"
              size="md"
              onClick={handleExportCsv}
              disabled={filteredMembers.length === 0}
            >
              EXPORT CSV
            </PixelButton>
            <PixelButton
              variant="secondary"
              size="md"
              onClick={() => setIsFullscreen(false)}
            >
              ✕ EXIT FULLSCREEN
            </PixelButton>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {renderRosterList()}
        </div>

        {/* Member Details Bottom Sheet */}
        <Sheet
          isOpen={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          title={selectedMember?.fullName || 'DANCER DETAILS'}
        >
          {selectedMember && (
            <div className="space-y-4 font-body text-[16px]">
              <div className="grid grid-cols-2 gap-3 bg-[var(--night-1)] p-3 border-2 border-[var(--outline)] px-panel">
                <div>
                  <span className="block font-display text-[12px] text-[var(--text-2)]">
                    MATRIC NUMBER
                  </span>
                  <span className="font-mono font-bold text-[18px] text-[var(--text-1)]">
                    {selectedMember.matricRaw}
                  </span>
                </div>
                <div>
                  <span className="block font-display text-[12px] text-[var(--text-2)]">
                    GENDER / NATIONALITY
                  </span>
                  <span className="font-body font-bold text-[var(--text-1)]">
                    {selectedMember.gender || '-'} · {selectedMember.nationality || '-'}
                  </span>
                </div>
              </div>

              {selectedMember.eventNames && selectedMember.eventNames.length > 0 && (
                <div>
                  <span className="block font-display text-[12px] text-[var(--text-1)] mb-2">
                    REGISTERED EVENTS
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.eventNames.map((ev) => (
                      <span
                        key={ev}
                        className="px-2 py-1 text-[12px] font-display bg-[var(--night-1)] text-[var(--neon-gold)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="block font-display text-[12px] text-[var(--text-1)]">
                  COMMUNICATION
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <a
                    href={formatWhatsAppUrl(selectedMember.contact)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center min-h-[48px] bg-[var(--neon-green)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] font-bold shadow-[2px_2px_0_var(--outline)]"
                  >
                    WHATSAPP ({selectedMember.contact})
                  </a>
                  <a
                    href={`mailto:${selectedMember.email}`}
                    className="flex items-center justify-center min-h-[48px] bg-[var(--neon-cyan)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] font-bold shadow-[2px_2px_0_var(--outline)]"
                  >
                    SEND EMAIL
                  </a>
                </div>
              </div>

              <div>
                <span className="block font-display text-[12px] text-[var(--text-1)] mb-2">
                  REGISTERED DANCE CLASSES
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedMember.styleNames?.map((sName) => {
                    const styleObj = bootstrap?.styles?.find((s) => s.name.toLowerCase() === sName.toLowerCase());
                    const c = getStyleColor(styleObj?.colorKey);
                    return (
                      <div
                        key={sName}
                        style={{ backgroundColor: c }}
                        className="p-2 border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
                      >
                        <span className="font-display text-[12px] text-[var(--on-neon)] font-bold">
                          {sName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <PixelButton
                  variant="secondary"
                  size="lg"
                  onClick={() => setSelectedMember(null)}
                  className="w-full"
                >
                  CLOSE
                </PixelButton>
              </div>
            </div>
          )}
        </Sheet>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] text-[var(--text-1)]">
            {isAll ? 'All Registered Dancers' : 'Registered Dancers'}
          </h1>
          <p className="font-body text-[14px] text-[var(--text-2)]">
            {isAll
              ? 'Combined roster across all events (duplicates merged)'
              : `Dancers registered for ${event?.name || 'the selected event'}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <PixelButton
            variant="secondary"
            size="md"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5"
          >
            {isRefetching ? 'REFRESHING...' : 'REFRESH'}
          </PixelButton>

          <PixelButton
            variant="secondary"
            size="md"
            onClick={handleExportCsv}
            disabled={filteredMembers.length === 0}
            className="flex items-center gap-1.5"
          >
            EXPORT CSV
          </PixelButton>

          <PixelButton
            variant="secondary"
            size="md"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-1.5"
          >
            {isFullscreen ? '✕ EXIT FULLSCREEN' : '⛶ FULLSCREEN'}
          </PixelButton>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <Panel title="FILTER & SEARCH">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Event (chosen in the picker above or ALL) */}
          <div>
            <span className="block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase">Event Scope</span>
            <p className="min-h-[48px] px-3 flex items-center border-2 border-[var(--outline)] bg-[var(--night-1)] px-well font-body text-[16px] text-[var(--text-1)]">
              {isAll ? `ALL EVENTS (${events.length} events)` : event ? `${event.name} (${event.memberCount} dancers)` : 'No event yet'}
            </p>
          </div>

          {/* Dance Class / Style Filter */}
          <div>
            <label
              htmlFor="style-select"
              className="block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase"
            >
              Class Style
            </label>
            <select
              id="style-select"
              value={selectedStyleId}
              onChange={(e) => setSelectedStyleId(e.target.value)}
              className="w-full min-h-[48px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] px-well font-body text-[16px] text-[var(--text-1)]"
            >
              <option value="all">ALL CLASSES ({members.length})</option>
              {bootstrap?.styles?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label
              htmlFor="dancer-search"
              className="block font-display text-[12px] text-[var(--text-1)] mb-1 uppercase"
            >
              Search Dancer
            </label>
            <input
              id="dancer-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, matric, phone..."
              className="w-full min-h-[48px] px-3 bg-[var(--night-1)] border-2 border-[var(--outline)] px-well font-body text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
            />
          </div>
        </div>

        {/* Quick Style Chips */}
        {bootstrap?.styles && bootstrap.styles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--outline)] items-center">
            <span className="font-display text-[12px] text-[var(--text-2)] mr-1">
              STYLES:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStyleId('all')}
              className={`px-3 py-1 text-[12px] font-display border-2 border-[var(--outline)] cursor-pointer min-h-[36px] ${
                selectedStyleId === 'all'
                  ? 'bg-[var(--neon-gold)] text-[var(--on-neon)] font-bold shadow-[2px_2px_0_var(--outline)]'
                  : 'bg-[var(--night-1)] text-[var(--text-1)] hover:bg-[var(--violet-1)]'
              }`}
            >
              ALL
            </button>
            {bootstrap.styles.map((s) => {
              const c = getStyleColor(s.colorKey);
              const isSelected = selectedStyleId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStyleId(s.id)}
                  style={{ backgroundColor: c }}
                  className={`px-3 py-1 text-[12px] font-display text-[var(--on-neon)] font-bold border-2 border-[var(--outline)] cursor-pointer min-h-[36px] ${
                    isSelected ? 'ring-2 ring-[var(--neon-cyan)] shadow-[2px_2px_0_var(--outline)]' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Roster Summary Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--night-2)] text-[var(--text-1)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]">
        <span className="font-display text-[12px] text-[var(--neon-gold)] font-bold">
          ROSTER COUNT: {filteredMembers.length} OF {members.length} DANCERS
        </span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="font-display text-[12px] text-[var(--neon-pink)] underline cursor-pointer"
          >
            CLEAR SEARCH
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {isLoading ? (
        <div className="p-8 text-center bg-[var(--night-2)] border-2 border-[var(--outline)]">
          <Spinner size="lg" />
          <p className="font-display text-[12px] text-[var(--text-1)] mt-3">
            LOADING DANCER DIRECTORY...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-[var(--night-1)] border-2 border-[var(--neon-red)] p-4 text-[var(--neon-red)] font-body font-bold text-[14px]"
        >
          {errorMessage(error)}
        </div>
      ) : filteredMembers.length === 0 ? (
        <EmptyState
          scene="shutter"
          title="NO DANCERS FOUND"
          description={
            members.length === 0
              ? `No registrations found for ${isAll ? 'any event' : event?.name || 'this event'}. New form responses appear within 10 minutes, or press Sync now on the Events page.`
              : 'No dancers match your current filter and search query.'
          }
        />
      ) : (
        renderRosterList()
      )}

      {/* Member Details Bottom Sheet */}
      <Sheet
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        title={selectedMember?.fullName || 'DANCER DETAILS'}
      >
        {selectedMember && (
          <div className="space-y-4 font-body text-[16px]">
            <div className="grid grid-cols-2 gap-3 bg-[var(--night-1)] p-3 border-2 border-[var(--outline)] px-panel">
              <div>
                <span className="block font-display text-[12px] text-[var(--text-2)]">
                  MATRIC NUMBER
                </span>
                <span className="font-mono font-bold text-[18px] text-[var(--text-1)]">
                  {selectedMember.matricRaw}
                </span>
              </div>
              <div>
                <span className="block font-display text-[12px] text-[var(--text-2)]">
                  GENDER / NATIONALITY
                </span>
                <span className="font-body font-bold text-[var(--text-1)]">
                  {selectedMember.gender || '-'} · {selectedMember.nationality || '-'}
                </span>
              </div>
            </div>

            {/* Events Enrolled */}
            {selectedMember.eventNames && selectedMember.eventNames.length > 0 && (
              <div>
                <span className="block font-display text-[12px] text-[var(--text-1)] mb-2">
                  REGISTERED EVENTS
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedMember.eventNames.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-1 text-[12px] font-display bg-[var(--night-1)] text-[var(--neon-gold)] border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Actions */}
            <div className="space-y-2">
              <span className="block font-display text-[12px] text-[var(--text-1)]">
                COMMUNICATION
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <a
                  href={formatWhatsAppUrl(selectedMember.contact)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center min-h-[48px] bg-[var(--neon-green)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] font-bold shadow-[2px_2px_0_var(--outline)]"
                >
                  WHATSAPP ({selectedMember.contact})
                </a>
                <a
                  href={`mailto:${selectedMember.email}`}
                  className="flex items-center justify-center min-h-[48px] bg-[var(--neon-cyan)] text-[var(--on-neon)] border-2 border-[var(--outline)] font-display text-[12px] font-bold shadow-[2px_2px_0_var(--outline)]"
                >
                  SEND EMAIL
                </a>
              </div>
            </div>

            {/* Registered Classes */}
            <div>
              <span className="block font-display text-[12px] text-[var(--text-1)] mb-2">
                REGISTERED DANCE CLASSES
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedMember.styleNames?.map((sName) => {
                  const styleObj = bootstrap?.styles?.find((s) => s.name.toLowerCase() === sName.toLowerCase());
                  const c = getStyleColor(styleObj?.colorKey);
                  return (
                    <div
                      key={sName}
                      style={{ backgroundColor: c }}
                      className="p-2 border-2 border-[var(--outline)] shadow-[2px_2px_0_var(--outline)]"
                    >
                      <span className="font-display text-[12px] text-[var(--on-neon)] font-bold">
                        {sName}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Extra Registration Metadata */}
            <div className="bg-[var(--night-1)] p-3 border-2 border-[var(--outline)] text-[12px] text-[var(--text-2)] space-y-1">
              <div>
                <strong>Registration Timestamp:</strong> {selectedMember.sourceTimestamp || 'N/A'}
              </div>
              {selectedMember.flags && selectedMember.flags.length > 0 && (
                <div className="text-[var(--neon-red)] font-bold">
                  <strong>System Flags:</strong> {selectedMember.flags.join(', ')}
                </div>
              )}
            </div>

            <div className="pt-2">
              <PixelButton
                variant="secondary"
                size="lg"
                onClick={() => setSelectedMember(null)}
                className="w-full"
              >
                CLOSE
              </PixelButton>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
