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

export const MembersPage: React.FC = () => {
  const { data: bootstrap } = useBootstrap('admin');
  const { current: event } = useCurrentEvent();
  const eventId = event?.id || '';
  const [selectedStyleId, setSelectedStyleId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Members of the event chosen in the picker
  const {
    data: members = [],
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['members', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => (await call<Member[]>('members.list', { eventId })).data || []
  });

  // Filter members by style and search query
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Style filter
      if (selectedStyleId !== 'all') {
        if (!m.styleIds || !m.styleIds.includes(selectedStyleId)) {
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
      { key: 'styleNames', label: 'Classes Registered' },
      { key: 'sourceTimestamp', label: 'Registered Timestamp' }
    ];

    const exportRows = filteredMembers.map((m) => ({
      ...m,
      styleNames: m.styleNames?.join(', ') || ''
    }));

    exportToCsv(`dancers_${(event?.name || 'event').replace(/\s+/g, '_')}.csv`, exportRows, headers);
  };

  const formatWhatsAppUrl = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, '');
    const full = cleaned.startsWith('60') ? cleaned : cleaned.startsWith('0') ? '6' + cleaned : cleaned;
    return `https://wa.me/${full}`;
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl text-[var(--c-ink)]">
            Registered Dancers
          </h1>
          <p className="font-body text-sm text-[var(--c-darkgrey)]">
            Dancers registered for the event chosen above
          </p>
        </div>

        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Filter and Search Panel */}
      <Panel title="FILTER & SEARCH" className="px-corners">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Event (chosen in the picker above) */}
          <div>
            <span className="block font-display text-[10px] text-[var(--c-ink)] mb-1 uppercase">Event</span>
            <p className="min-h-[44px] px-3 flex items-center border-2 border-[var(--c-ink)] bg-[var(--c-bg)] font-body text-base text-[var(--c-ink)]">
              {event ? `${event.name} (${event.memberCount} dancers)` : 'No event yet'}
            </p>
          </div>

          {/* Dance Class / Style Filter */}
          <div>
            <label
              htmlFor="style-select"
              className="block font-display text-[10px] text-[var(--c-ink)] mb-1 uppercase"
            >
              Class Style
            </label>
            <select
              id="style-select"
              value={selectedStyleId}
              onChange={(e) => setSelectedStyleId(e.target.value)}
              className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--c-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
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
              className="block font-display text-[10px] text-[var(--c-ink)] mb-1 uppercase"
            >
              Search Dancer
            </label>
            <input
              id="dancer-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, matric, phone..."
              className="w-full min-h-[44px] px-3 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-body text-base text-[var(--c-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--c-yellow)]"
            />
          </div>
        </div>

        {/* Quick Style Chips */}
        {bootstrap?.styles && bootstrap.styles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--c-grey)] items-center">
            <span className="font-display text-[10px] text-[var(--c-darkgrey)] mr-1">
              STYLES:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStyleId('all')}
              className={`px-2 py-1 text-[10px] font-display border-2 border-[var(--c-ink)] cursor-pointer min-h-[32px] ${
                selectedStyleId === 'all'
                  ? 'bg-[var(--c-ink)] text-[var(--c-panel)]'
                  : 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-bg)]'
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
                  className={`px-2 py-1 text-[10px] font-display text-[var(--c-ink)] border-2 border-[var(--c-ink)] cursor-pointer min-h-[32px] ${
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
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-navy)] text-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]">
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
          <p className="font-display text-xs text-[var(--c-ink)] mt-3">
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
              ? `No registrations found for ${event?.name || 'this event'}. New form responses appear within 10 minutes, or press Sync now on the Events page.`
              : 'No dancers match your current filter and search query.'
          }
        />
      ) : (
        /* Dancers Roster */
        <div className="space-y-2">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[4px_4px_0_var(--c-ink)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--c-navy)] text-[var(--c-panel)] font-display text-[10px] border-b-4 border-[var(--c-ink)]">
                  <th className="p-3">FULL NAME</th>
                  <th className="p-3">MATRIC NO.</th>
                  <th className="p-3">CONTACT</th>
                  <th className="p-3">EMAIL</th>
                  <th className="p-3">GENDER</th>
                  <th className="p-3">CLASSES</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[var(--c-grey)] font-body text-sm">
                {filteredMembers.map((m) => (
                  <tr
                    key={m.memberId}
                    className="hover:bg-[var(--c-bg)] transition-none"
                  >
                    <td className="p-3 font-bold text-[var(--c-ink)]">
                      {m.fullName}
                      {m.flags && m.flags.length > 0 && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] text-[10px] font-display border border-[var(--c-ink)]">
                          FLAGGED
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[var(--c-ink)] font-bold">
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
                    <td className="p-3 font-body text-xs text-[var(--c-darkgrey)] truncate max-w-[200px]">
                      <a
                        href={`mailto:${m.email}`}
                        className="hover:underline hover:text-[var(--c-ink)]"
                      >
                        {m.email}
                      </a>
                    </td>
                    <td className="p-3 font-display text-xs">
                      <span className="inline-block px-1.5 py-0.5 bg-[var(--c-bg)] border border-[var(--c-ink)] text-[var(--c-ink)]">
                        {m.gender || '-'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {m.styleNames?.map((sName) => (
                          <span
                            key={sName}
                            style={{ backgroundColor: getStyleColor(sName) }}
                            className="px-2 py-0.5 text-[10px] font-display text-[var(--c-ink)] border border-[var(--c-ink)]"
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
          <div className="md:hidden space-y-2">
            {filteredMembers.map((m) => (
              <div
                key={m.memberId}
                className="bg-[var(--c-panel)] border-4 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)] p-3 space-y-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-body font-bold text-base text-[var(--c-ink)]">
                      {m.fullName}
                    </h3>
                    <p className="font-mono font-bold text-xs text-[var(--c-darkgrey)]">
                      {m.matricRaw} · {m.gender || 'N/A'}
                    </p>
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
                      className="px-2 py-0.5 text-[9px] font-display text-[var(--c-ink)] border border-[var(--c-ink)]"
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
                  <span className="font-body text-[var(--c-darkgrey)] truncate max-w-[150px]">
                    {m.email}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
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
                <span className="block font-display text-[10px] text-[var(--c-darkgrey)]">
                  MATRIC NUMBER
                </span>
                <span className="font-mono font-bold text-lg text-[var(--c-ink)]">
                  {selectedMember.matricRaw}
                </span>
              </div>
              <div>
                <span className="block font-display text-[10px] text-[var(--c-darkgrey)]">
                  GENDER / NATIONALITY
                </span>
                <span className="font-body font-bold text-[var(--c-ink)]">
                  {selectedMember.gender || '-'} · {selectedMember.nationality || '-'}
                </span>
              </div>
            </div>

            {/* Contact Actions */}
            <div className="space-y-2">
              <span className="block font-display text-xs text-[var(--c-ink)]">
                COMMUNICATION
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <a
                  href={formatWhatsAppUrl(selectedMember.contact)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center min-h-[44px] bg-[var(--c-green)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                >
                  WHATSAPP ({selectedMember.contact})
                </a>
                <a
                  href={`mailto:${selectedMember.email}`}
                  className="flex items-center justify-center min-h-[44px] bg-[var(--c-blue)] text-[var(--c-ink)] border-2 border-[var(--c-ink)] font-display text-xs shadow-[2px_2px_0_var(--c-ink)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5"
                >
                  SEND EMAIL
                </a>
              </div>
            </div>

            {/* Registered Classes */}
            <div>
              <span className="block font-display text-xs text-[var(--c-ink)] mb-2">
                REGISTERED DANCE CLASSES
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedMember.styleNames?.map((sName) => (
                  <div
                    key={sName}
                    style={{ backgroundColor: getStyleColor(sName) }}
                    className="p-2 border-2 border-[var(--c-ink)] shadow-[2px_2px_0_var(--c-ink)]"
                  >
                    <span className="font-display text-xs text-[var(--c-ink)]">
                      {sName}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Extra Registration Metadata */}
            <div className="bg-[var(--c-panel)] p-3 border-2 border-[var(--c-ink)] text-xs text-[var(--c-darkgrey)] space-y-1">
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
