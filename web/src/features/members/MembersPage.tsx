import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { call, errorMessage } from '../../lib/api';
import { useBootstrap } from '../auth/useBootstrap';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Sheet } from '../../components/ui/Sheet';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { STYLE_COLOR } from '../../theme/colors';
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

  // Style badge color helper
  const getStyleColor = (styleName: string): string => {
    const styleObj = bootstrap?.styles?.find((s) => s.name.toLowerCase() === styleName.toLowerCase());
    const key = styleObj?.colorKey || 'orange';
    return STYLE_COLOR[key] || `var(--c-${key})`;
  };

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
      <div className="hidden md:block overflow-x-auto bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] max-h-[600px] overflow-y-auto pixel-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--c-navy)] text-[var(--text-1)] font-display text-[10px] border-b-4 border-[var(--c-ink)]">
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
          <tbody className="divide-y-2 divide-[var(--c-grey)] font-body text-sm">
            {filteredMembers.map((m) => (
              <tr
                key={m.memberId + (m.matricKey || '')}
                className="hover:bg-[var(--c-bg)] transition-none"
              >
                <td className="p-3 font-bold text-[var(--text-1)]">
                  {m.fullName}
                  {m.flags && m.flags.length > 0 && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 bg-[var(--c-yellow)] text-[var(--on-neon)] text-[10px] font-display border border-[var(--c-ink)]">
                      FLAGGED
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono text-[var(--text-1)] font-bold">
                  {m.matricRaw}
                </td>
                <td className="p-3">
                  <a
                    href={formatWhatsAppUrl(m.contact)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--c-blue)] hover:underline inline-flex items-center gap-1 font-mono font-bold"
                  >
                    {m.contact}
                  </a>
                </td>
                <td className="p-3 font-body text-xs text-[var(--text-2)] truncate max-w-[200px]">
                  <a
                    href={`mailto:${m.email}`}
                    className="hover:underline hover:text-[var(--text-1)]"
                  >
                    {m.email}
                  </a>
                </td>
                <td className="p-3 font-display text-xs">
                  <span className="inline-block px-1.5 py-0.5 bg-[var(--c-bg)] border border-[var(--c-ink)] text-[var(--text-1)]">
                    {m.gender || '-'}
                  </span>
                </td>
                {isAll && (
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {m.eventNames?.map((ev) => (
                        <span
                          key={ev}
                          className="px-1.5 py-0.5 text-[9px] font-display bg-[var(--c-bg)] text-[var(--text-1)] border border-[var(--c-ink)]"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                )}
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {m.styleNames?.map((sName) => (
                      <span
                        key={sName}
                        style={{ backgroundColor: getStyleColor(sName) }}
                        className="px-2 py-0.5 text-[10px] font-display text-[var(--text-1)] border border-[var(--c-ink)]"
                      >
                        {sName}
                      </span>
                    ))}
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
            className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] p-3 space-y-2"
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-body font-bold text-base text-[var(--text-1)]">
                  {m.fullName}
                </h3>
                <p className="font-mono font-bold text-xs text-[var(--text-2)]">
                  {m.matricRaw} · {m.gender || 'N/A'}
                </p>
                {isAll && m.eventNames && m.eventNames.length > 0 && (
                  <p className="font-display text-[9px] text-[var(--c-blue)] mt-0.5">
                    {m.eventNames.join(' · ')}
                  </p>
                )}
              </div>
              <PixelButton
                variant="secondary"
                size="md"
                onClick={() => setSelectedMember(m)}
                className="min-h-[36px] px-2 text-xs"
              >
                INFO
              </PixelButton>
            </div>

            {/* Style Badges */}
            <div className="flex flex-wrap gap-1">
              {m.styleNames?.map((sName) => (
                <span
                  key={sName}
                  style={{ backgroundColor: getStyleColor(sName) }}
                  className="px-2 py-0.5 text-[9px] font-display text-[var(--text-1)] border border-[var(--c-ink)]"
                >
                  {sName}
                </span>
              ))}
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-[var(--c-grey)] text-xs">
              <a
                href={formatWhatsAppUrl(m.contact)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--c-blue)] font-mono font-bold underline"
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
      <div className="fixed inset-0 z-50 bg-[var(--c-bg)] p-3 md:p-6 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)] p-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-sm md:text-base text-[var(--text-1)]">
              {isAll ? 'ALL REGISTERED DANCERS (COMBINED)' : `ROSTER: ${event?.name || 'EVENT'}`}
            </h2>
            <span className="font-display text-[10px] md:text-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-1">
              {filteredMembers.length} DANCERS
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dancer..."
              className="min-h-[36px] px-3 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] font-body text-sm text-[var(--text-1)] focus:outline-none"
            />
            <PixelButton
              variant="primary"
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
              className="bg-[var(--c-peach)]"
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
            <div className="space-y-4 font-body text-base">
              <div className="grid grid-cols-2 gap-3 bg-[var(--c-bg)] p-3 border-2 border-[var(--c-ink)]">
                <div>
                  <span className="block font-display text-[10px] text-[var(--text-2)]">
                    MATRIC NUMBER
                  </span>
                  <span className="font-mono font-bold text-lg text-[var(--text-1)]">
                    {selectedMember.matricRaw}
                  </span>
                </div>
                <div>
                  <span className="block font-display text-[10px] text-[var(--text-2)]">
                    GENDER / NATIONALITY
                  </span>
                  <span className="font-body font-bold text-[var(--text-1)]">
                    {selectedMember.gender || '-'} · {selectedMember.nationality || '-'}
                  </span>
                </div>
              </div>

              {selectedMember.eventNames && selectedMember.eventNames.length > 0 && (
                <div>
                  <span className="block font-display text-xs text-[var(--text-1)] mb-2">
                    REGISTERED EVENTS
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.eventNames.map((ev) => (
                      <span
                        key={ev}
                        className="px-2 py-1 text-xs font-display bg-[var(--c-navy)] text-[var(--c-yellow)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="block font-display text-xs text-[var(--text-1)]">
                  COMMUNICATION
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <a
                    href={formatWhatsAppUrl(selectedMember.contact)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center min-h-[44px] bg-[var(--c-green)] text-[var(--on-neon)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                  >
                    WHATSAPP ({selectedMember.contact})
                  </a>
                  <a
                    href={`mailto:${selectedMember.email}`}
                    className="flex items-center justify-center min-h-[44px] bg-[var(--c-blue)] text-[var(--on-neon)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                  >
                    SEND EMAIL
                  </a>
                </div>
              </div>

              <div>
                <span className="block font-display text-xs text-[var(--text-1)] mb-2">
                  REGISTERED DANCE CLASSES
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedMember.styleNames?.map((sName) => (
                    <div
                      key={sName}
                      style={{ backgroundColor: getStyleColor(sName) }}
                      className="p-2 border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]"
                    >
                      <span className="font-display text-xs text-[var(--text-1)]">
                        {sName}
                      </span>
                    </div>
                  ))}
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
          <h1 className="font-display text-xl md:text-2xl text-[var(--text-1)]">
            {isAll ? 'All Registered Dancers' : 'Registered Dancers'}
          </h1>
          <p className="font-body text-sm text-[var(--text-2)]">
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
            variant="primary"
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
      <Panel title="FILTER & SEARCH" className="px-corners">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Event (chosen in the picker above or ALL) */}
          <div>
            <span className="block font-display text-[10px] text-[var(--text-1)] mb-1 uppercase">Event Scope</span>
            <p className="min-h-[44px] px-3 flex items-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base text-[var(--text-1)]">
              {isAll ? `ALL EVENTS (${events.length} events)` : event ? `${event.name} (${event.memberCount} dancers)` : 'No event yet'}
            </p>
          </div>

          {/* Dance Class / Style Filter */}
          <div>
            <label
              htmlFor="style-select"
              className="block font-display text-[10px] text-[var(--text-1)] mb-1 uppercase"
            >
              Class Style
            </label>
            <select
              id="style-select"
              value={selectedStyleId}
              onChange={(e) => setSelectedStyleId(e.target.value)}
              className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
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
              className="block font-display text-[10px] text-[var(--text-1)] mb-1 uppercase"
            >
              Search Dancer
            </label>
            <input
              id="dancer-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, matric, phone..."
              className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--text-1)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
            />
          </div>
        </div>

        {/* Quick Style Chips */}
        {bootstrap?.styles && bootstrap.styles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--c-grey)] items-center">
            <span className="font-display text-[10px] text-[var(--text-2)] mr-1">
              STYLES:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStyleId('all')}
              className={`px-2 py-1 text-[10px] font-display border-2 border-[var(--c-ink)] cursor-pointer min-h-[32px] ${
                selectedStyleId === 'all'
                  ? 'bg-[var(--c-ink)] text-[var(--text-1)]'
                  : 'bg-[var(--c-panel)] text-[var(--text-1)] hover:bg-[var(--c-bg)]'
              }`}
            >
              ALL
            </button>
            {bootstrap.styles.map((s) => {
              const colorVar = STYLE_COLOR[s.colorKey] || `var(--c-${s.colorKey})`;
              const isSelected = selectedStyleId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStyleId(s.id)}
                  style={{ backgroundColor: colorVar }}
                  className={`px-2 py-1 text-[10px] font-display text-[var(--text-1)] border-2 border-[var(--c-ink)] cursor-pointer min-h-[32px] ${
                    isSelected ? 'ring-2 ring-[var(--c-ink)] ring-offset-2 font-bold' : 'opacity-85 hover:opacity-100'
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
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-navy)] text-[var(--text-1)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]">
        <span className="font-display text-xs text-[var(--c-yellow)]">
          ROSTER COUNT: {filteredMembers.length} OF {members.length} DANCERS
        </span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="font-display text-[10px] text-[var(--c-pink)] underline cursor-pointer"
          >
            CLEAR SEARCH
          </button>
        )}
      </div>

      {/* Loading & Error States */}
      {isLoading ? (
        <div className="p-8 text-center bg-[var(--c-panel)] border-4 border-[var(--c-ink)]">
          <Spinner size="lg" />
          <p className="font-display text-xs text-[var(--text-1)] mt-3">
            LOADING DANCER DIRECTORY...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-4 text-[var(--c-red)] font-body font-bold text-sm"
        >
          {errorMessage(error)}
        </div>
      ) : filteredMembers.length === 0 ? (
        <EmptyState
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
          <div className="space-y-4 font-body text-base">
            <div className="grid grid-cols-2 gap-3 bg-[var(--c-bg)] p-3 border-2 border-[var(--c-ink)]">
              <div>
                <span className="block font-display text-[10px] text-[var(--text-2)]">
                  MATRIC NUMBER
                </span>
                <span className="font-mono font-bold text-lg text-[var(--text-1)]">
                  {selectedMember.matricRaw}
                </span>
              </div>
              <div>
                <span className="block font-display text-[10px] text-[var(--text-2)]">
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
                <span className="block font-display text-xs text-[var(--text-1)] mb-2">
                  REGISTERED EVENTS
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedMember.eventNames.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-1 text-xs font-display bg-[var(--c-navy)] text-[var(--c-yellow)] border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Actions */}
            <div className="space-y-2">
              <span className="block font-display text-xs text-[var(--text-1)]">
                COMMUNICATION
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <a
                  href={formatWhatsAppUrl(selectedMember.contact)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center min-h-[44px] bg-[var(--c-green)] text-[var(--on-neon)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                >
                  WHATSAPP ({selectedMember.contact})
                </a>
                <a
                  href={`mailto:${selectedMember.email}`}
                  className="flex items-center justify-center min-h-[44px] bg-[var(--c-blue)] text-[var(--on-neon)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                >
                  SEND EMAIL
                </a>
              </div>
            </div>

            {/* Registered Classes */}
            <div>
              <span className="block font-display text-xs text-[var(--text-1)] mb-2">
                REGISTERED DANCE CLASSES
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedMember.styleNames?.map((sName) => (
                  <div
                    key={sName}
                    style={{ backgroundColor: getStyleColor(sName) }}
                    className="p-2 border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]"
                  >
                    <span className="font-display text-xs text-[var(--text-1)]">
                      {sName}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra Registration Metadata */}
            <div className="bg-[var(--c-panel)] p-3 border-2 border-[var(--c-ink)] text-xs text-[var(--text-2)] space-y-1">
              <div>
                <strong>Registration Timestamp:</strong> {selectedMember.sourceTimestamp || 'N/A'}
              </div>
              {selectedMember.flags && selectedMember.flags.length > 0 && (
                <div className="text-[var(--c-red)] font-bold">
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
