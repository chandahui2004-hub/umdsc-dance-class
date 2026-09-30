import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import {
  todayKL,
  addMonths,
  getMonthsRange,
  getDatesBetween,
  monthGrid,
  formatDayLabel
} from '../../lib/time';
import type { DanceStyle, Month, ISODate } from '@umdsc/shared';

export interface ScheduledClass {
  seq: number;
  date: ISODate;
  start: string;
  end: string;
  venue?: string;
}

interface PreviewData {
  headers: string[];
  columnMap: Record<string, number | null>;
  scores: Record<string, number>;
  classIndex: number;
  countsByStyle: Record<string, number>;
  warnings: { kind: string; row: number; detail: string }[];
  rowCount: number;
  sampleNames: string[];
}

interface MonthImportResult {
  month: Month;
  membersSpreadsheetId: string;
  memberCount: number;
  attendanceSheets: { styleId: string; spreadsheetId: string }[];
}

export const ImportWizard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Day-level and Month selection state
  const currentDay = todayKL();
  const currentMonth = currentDay.slice(0, 7) as Month;
  const [rangeMode, setRangeMode] = useState<'single' | 'range'>('range');
  const [viewMonth, setViewMonth] = useState<Month>(currentMonth);
  const [startDate, setStartDate] = useState<ISODate>(currentDay);
  const [endDate, setEndDate] = useState<ISODate>(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDayNum = new Date(y, m, 0).getDate();
    return `${currentMonth}-${String(lastDayNum).padStart(2, '0')}`;
  });

  // Effective start and end bounds
  const effectiveStart = startDate <= endDate ? startDate : endDate;
  const effectiveEnd = startDate <= endDate ? endDate : startDate;

  // Sheet link and errors
  const [sheetUrl, setSheetUrl] = useState('');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Step 2 state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, number | null>>({});
  const [classIndex, setClassIndex] = useState<number>(-1);

  // Step 3 & 4 state (multi-month progress & results)
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [resultsByMonth, setResultsByMonth] = useState<MonthImportResult[]>([]);

  // Quick style create state for unknown classes
  const [quickStyleName, setQuickStyleName] = useState<string | null>(null);
  const [quickStyleColor, setQuickStyleColor] = useState('green');

  // Compute selected months range and total days
  const targetMonths: Month[] = useMemo(() => {
    if (rangeMode === 'single') {
      return [effectiveStart.slice(0, 7) as Month];
    }
    const startM = effectiveStart.slice(0, 7) as Month;
    const endM = effectiveEnd.slice(0, 7) as Month;
    return getMonthsRange(startM, endM);
  }, [rangeMode, effectiveStart, effectiveEnd]);

  const totalDays = useMemo(() => {
    if (rangeMode === 'single') return 1;
    const d1 = new Date(effectiveStart).getTime();
    const d2 = new Date(effectiveEnd).getTime();
    return Math.max(1, Math.round((d2 - d1) / (1000 * 3600 * 24)) + 1);
  }, [rangeMode, effectiveStart, effectiveEnd]);

  const availableDays: ISODate[] = useMemo(() => {
    return getDatesBetween(effectiveStart, effectiveEnd);
  }, [effectiveStart, effectiveEnd]);

  const weeks = useMemo(() => monthGrid(viewMonth), [viewMonth]);

  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  // Class Schedules state per style
  const [schedulesByStyle, setSchedulesByStyle] = useState<Record<string, ScheduledClass[]>>({});
  const [activeScheduleStyleId, setActiveScheduleStyleId] = useState<string>('');

  const initScheduleForStyle = useCallback((style: DanceStyle, days: ISODate[]): ScheduledClass[] => {
    const targetWeekday = style.defaultWeekday ?? 2;
    const matchingDays = days.filter((d) => {
      const dt = new Date(d);
      const dayNum = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
      return dayNum === targetWeekday;
    });

    const chosenDays = matchingDays.length > 0 ? matchingDays : days.slice(0, 4);
    const classes: ScheduledClass[] = [];
    const count = Math.max(4, chosenDays.length);
    for (let i = 0; i < count; i++) {
      const day = chosenDays[i] || (chosenDays.length > 0 ? chosenDays[chosenDays.length - 1] : days[0] || effectiveStart);
      classes.push({
        seq: i + 1,
        date: day,
        start: style.defaultStart || '20:00',
        end: style.defaultEnd || '22:00',
        venue: style.defaultVenue || 'Dance Studio'
      });
    }
    return classes;
  }, [effectiveStart]);

  useEffect(() => {
    if (styles.length > 0) {
      setSchedulesByStyle((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const st of styles) {
          if (!next[st.id] || next[st.id].length === 0) {
            next[st.id] = initScheduleForStyle(st, availableDays);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      if (!activeScheduleStyleId) {
        setActiveScheduleStyleId(styles[0].id);
      }
    }
  }, [styles, availableDays, initScheduleForStyle, activeScheduleStyleId]);

  const updateClassDate = (styleId: string, seq: number, newDate: ISODate) => {
    setSchedulesByStyle((prev) => {
      const list = prev[styleId] || [];
      return {
        ...prev,
        [styleId]: list.map((c) => (c.seq === seq ? { ...c, date: newDate } : c))
      };
    });
  };

  const updateClassTime = (styleId: string, seq: number, field: 'start' | 'end', val: string) => {
    setSchedulesByStyle((prev) => {
      const list = prev[styleId] || [];
      return {
        ...prev,
        [styleId]: list.map((c) => (c.seq === seq ? { ...c, [field]: val } : c))
      };
    });
  };

  const addClassForStyle = (styleId: string) => {
    setSchedulesByStyle((prev) => {
      const list = prev[styleId] || [];
      const nextSeq = list.length + 1;
      const lastDate = list.length > 0 ? list[list.length - 1].date : effectiveStart;
      const nextDateIdx = availableDays.indexOf(lastDate);
      const nextDate = (nextDateIdx >= 0 && nextDateIdx + 7 < availableDays.length)
        ? availableDays[nextDateIdx + 7]
        : (availableDays[availableDays.length - 1] || effectiveEnd);

      const st = styles.find((s) => s.id === styleId);
      return {
        ...prev,
        [styleId]: [
          ...list,
          {
            seq: nextSeq,
            date: nextDate,
            start: st?.defaultStart || '20:00',
            end: st?.defaultEnd || '22:00',
            venue: st?.defaultVenue || 'Dance Studio'
          }
        ]
      };
    });
  };

  const removeClassForStyle = (styleId: string, seq: number) => {
    setSchedulesByStyle((prev) => {
      const list = prev[styleId] || [];
      if (list.length <= 1) return prev;
      const filtered = list.filter((c) => c.seq !== seq);
      return {
        ...prev,
        [styleId]: filtered.map((c, i) => ({ ...c, seq: i + 1 }))
      };
    });
  };

  const resetStyleScheduleToWeekday = (styleId: string) => {
    const st = styles.find((s) => s.id === styleId);
    if (!st) return;
    setSchedulesByStyle((prev) => ({
      ...prev,
      [styleId]: initScheduleForStyle(st, availableDays)
    }));
  };

  const copyScheduleToAllStyles = (sourceStyleId: string) => {
    const sourceList = schedulesByStyle[sourceStyleId];
    if (!sourceList || sourceList.length === 0) return;
    setSchedulesByStyle((prev) => {
      const next = { ...prev };
      for (const st of styles) {
        if (st.id !== sourceStyleId) {
          next[st.id] = sourceList.map((c) => ({ ...c }));
        }
      }
      return next;
    });
    alert(`✓ Copied ${sourceList.length} class schedule dates to all other dance styles!`);
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      setStep1Error(null);
      const res = await api.post<PreviewData>('members.previewImport', {
        sheetUrl: sheetUrl.trim(),
        month: targetMonths[0]
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setColumnMap(data.columnMap);
      setClassIndex(data.classIndex);
      setStep(2);
    },
    onError: (err) => {
      setStep1Error(errorMessage(err));
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const results: MonthImportResult[] = [];

      for (let i = 0; i < targetMonths.length; i++) {
        const m = targetMonths[i];
        setImportProgress(`Auto-generating Google Sheets for ${m} (${i + 1}/${targetMonths.length})...`);

        const res = await api.post<{
          membersSpreadsheetId: string;
          memberCount: number;
          attendanceSheets: { styleId: string; spreadsheetId: string }[];
        }>('members.confirmImport', {
          sheetUrl: sheetUrl.trim(),
          month: m,
          columnMap,
          classIndex
        });

        results.push({
          month: m,
          membersSpreadsheetId: res.data.membersSpreadsheetId,
          memberCount: res.data.memberCount,
          attendanceSheets: res.data.attendanceSheets
        });
      }

      // Store all custom class schedules in database!
      const allSessions: Array<{
        month: string;
        styleId: string;
        seq: number;
        date: string;
        start: string;
        end: string;
        venue?: string;
        status?: string;
      }> = [];

      for (const [stId, classList] of Object.entries(schedulesByStyle)) {
        for (const c of classList) {
          allSessions.push({
            month: c.date.slice(0, 7),
            styleId: stId,
            seq: c.seq,
            date: c.date,
            start: c.start,
            end: c.end,
            venue: c.venue || '',
            status: 'scheduled'
          });
        }
      }

      if (allSessions.length > 0) {
        setImportProgress('Saving custom class dates and times in database...');
        try {
          await api.post('sessions.batchUpsert', { sessions: allSessions });
        } catch (err) {
          console.warn('sessions.batchUpsert failed:', err);
        }

        // Re-ensure sheets so Drive attendance sheets reflect the customized class dates
        for (const m of targetMonths) {
          try {
            await api.post('attendance.ensureSheets', { month: m });
          } catch (err) {
            console.warn('attendance.ensureSheets failed:', err);
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setResultsByMonth(results);
      setImportProgress(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['admin.bootstrap'] });
      setStep(4);
    },
    onError: (err) => {
      setImportProgress(null);
      alert(errorMessage(err));
    }
  });

  const createStyleMutation = useMutation({
    mutationFn: async (styleName: string) => {
      return await api.post('styles.create', {
        name: styleName.trim(),
        aliases: [styleName.trim().toLowerCase()],
        colorKey: quickStyleColor,
        defaultWeekday: 1,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultVenue: 'Dance Studio'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['styles'] });
      setQuickStyleName(null);
      previewMutation.mutate();
    },
    onError: (err) => {
      alert(errorMessage(err));
    }
  });

  const handleDayClick = (d: ISODate) => {
    if (rangeMode === 'single') {
      setStartDate(d);
      setEndDate(d);
    } else {
      if (startDate === endDate) {
        if (d < startDate) {
          setStartDate(d);
        } else {
          setEndDate(d);
        }
      } else {
        setStartDate(d);
        setEndDate(d);
      }
    }
  };

  const handlePresetCurrentMonth = () => {
    const [y, m] = viewMonth.split('-').map(Number);
    const lastDayNum = new Date(y, m, 0).getDate();
    setStartDate(`${viewMonth}-01`);
    setEndDate(`${viewMonth}-${String(lastDayNum).padStart(2, '0')}`);
    setRangeMode('range');
  };

  const handlePresetNextMonth = () => {
    const nextM = addMonths(viewMonth, 1);
    const [y, m] = nextM.split('-').map(Number);
    const lastDayNum = new Date(y, m, 0).getDate();
    setViewMonth(nextM);
    setStartDate(`${nextM}-01`);
    setEndDate(`${nextM}-${String(lastDayNum).padStart(2, '0')}`);
    setRangeMode('range');
  };

  const handlePresetFourWeeks = () => {
    const start = currentDay;
    const d = new Date(start);
    d.setDate(d.getDate() + 27);
    const end = d.toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
    setRangeMode('range');
  };

  const FIELD_LABELS: Record<string, string> = {
    fullName: 'Full Name',
    matric: 'Matric Number',
    contact: 'Contact / Phone',
    email: 'Email',
    gender: 'Gender',
    nationality: 'Nationality'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-lg tracking-wider text-[var(--c-ink)]">
            Import Registrations
          </h1>
          <p className="font-body text-base text-[var(--c-darkgrey)] mt-1">
            Advance month registration upload, Google Sheet link detection, and automated attendance sheet generator.
          </p>
        </div>
        <PixelButton
          size="md"
          variant="secondary"
          onClick={() => navigate('/admin/members')}
        >
          VIEW ROSTER
        </PixelButton>
      </div>

      {/* Step Tracker */}
      <div className="flex items-center gap-2 bg-[var(--c-panel)] border-4 border-[var(--c-ink)] p-3 shadow-[4px_4px_0_var(--c-ink)]">
        {[
          { num: 1, label: 'CALENDAR & LINK' },
          { num: 2, label: 'MAPPING PREVIEW' },
          { num: 3, label: 'CONFIRM' },
          { num: 4, label: 'DONE' }
        ].map((s, idx) => (
          <React.Fragment key={s.num}>
            <div
              className={`flex items-center gap-2 font-display text-xs ${
                step === s.num
                  ? 'text-[var(--c-orange)] font-bold'
                  : step > s.num
                  ? 'text-[var(--c-darkgreen)]'
                  : 'text-[var(--c-grey)]'
              }`}
            >
              <div
                className={`w-6 h-6 flex items-center justify-center border-2 border-[var(--c-ink)] text-xs ${
                  step === s.num
                    ? 'bg-[var(--c-orange)] text-[var(--c-ink)]'
                    : step > s.num
                    ? 'bg-[var(--c-green)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-bg)] text-[var(--c-darkgrey)]'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {idx < 3 && <div className="flex-1 h-1 bg-[var(--c-ink)]/20" />}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 1: Interactive Day-Level Range Calendar & Link */}
      {step === 1 && (
        <Panel
          title="STEP 1: SELECT REGISTRATION DAY RANGE & GOOGLE SHEET LINK"
          className="px-corners space-y-5"
        >
          {step1Error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-4 text-[var(--c-red)] font-body font-bold text-sm"
            >
              {step1Error}
            </div>
          )}

          {/* Mode & Quick Presets Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="space-y-1">
              <span className="font-display text-xs text-[var(--c-ink)] uppercase">
                Date Range Mode:
              </span>
              <div className="flex flex-wrap gap-2">
                <PixelButton
                  size="md"
                  variant={rangeMode === 'range' ? 'primary' : 'secondary'}
                  onClick={() => setRangeMode('range')}
                >
                  DAY RANGE (START TO END)
                </PixelButton>
                <PixelButton
                  size="md"
                  variant={rangeMode === 'single' ? 'primary' : 'secondary'}
                  onClick={() => {
                    setRangeMode('single');
                    setEndDate(startDate);
                  }}
                >
                  SINGLE DAY
                </PixelButton>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <PixelButton
                size="md"
                variant="secondary"
                onClick={handlePresetCurrentMonth}
              >
                THIS MONTH (1ST - END)
              </PixelButton>
              <PixelButton
                size="md"
                variant="secondary"
                onClick={handlePresetNextMonth}
              >
                NEXT MONTH (1ST - END)
              </PixelButton>
              <PixelButton
                size="md"
                variant="secondary"
                onClick={handlePresetFourWeeks}
              >
                4 WEEKS (28 DAYS)
              </PixelButton>
            </div>
          </div>

          {/* Day-Level Interactive Calendar */}
          <div className="bg-[var(--c-bg)] border-4 border-[var(--c-ink)] p-4 shadow-[2px_2px_0_var(--c-ink)] space-y-4">
            <div className="flex justify-between items-center pb-2 border-b-2 border-[var(--c-ink)]">
              <h3 className="font-display text-xs text-[var(--c-navy)] uppercase tracking-wider">
                {rangeMode === 'single'
                  ? 'CLICK A DAY TO SELECT'
                  : 'CLICK START DAY THEN END DAY TO SET RANGE'}
              </h3>

              {/* Month Navigation */}
              <div className="flex items-center gap-2 font-display text-xs">
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                >
                  &lt;
                </PixelButton>
                <span className="px-3 py-1 bg-[var(--c-panel)] border-2 border-[var(--c-ink)] font-mono text-sm font-bold min-w-[100px] text-center">
                  {viewMonth}
                </span>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                >
                  &gt;
                </PixelButton>
                {viewMonth !== currentMonth && (
                  <PixelButton
                    size="md"
                    variant="secondary"
                    onClick={() => setViewMonth(currentMonth)}
                  >
                    TODAY
                  </PixelButton>
                )}
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-display text-[11px] text-[var(--c-darkgrey)] border-b border-[var(--c-ink)] pb-1">
              <span>MON</span>
              <span>TUE</span>
              <span>WED</span>
              <span>THU</span>
              <span>FRI</span>
              <span className="text-[var(--c-navy)]">SAT</span>
              <span className="text-[var(--c-navy)]">SUN</span>
            </div>

            {/* Interactive Day Grid */}
            <div className="space-y-1">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-cols-7 gap-1">
                  {week.map((d) => {
                    const dayNum = parseInt(d.slice(8), 10);
                    const isCurrentViewMonth = d.slice(0, 7) === viewMonth;
                    const isToday = d === currentDay;
                    const isStart = d === effectiveStart;
                    const isEnd = d === effectiveEnd;
                    const isInRange =
                      rangeMode === 'range' && d > effectiveStart && d < effectiveEnd;

                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleDayClick(d)}
                        className={`min-h-[48px] p-1.5 border-2 border-[var(--c-ink)] flex flex-col justify-between cursor-pointer select-none transition-none text-left ${
                          isStart || isEnd
                            ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)] ring-2 ring-[var(--c-ink)] z-10'
                            : isInRange
                            ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] font-bold'
                            : isCurrentViewMonth
                            ? 'bg-[var(--c-panel)] text-[var(--c-ink)] hover:bg-[var(--c-bg)]'
                            : 'bg-[var(--c-bg)] text-[var(--c-grey)] hover:bg-[var(--c-panel)]'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-mono text-xs font-bold">{dayNum}</span>
                          {isToday && (
                            <span className="px-1 bg-[var(--c-green)] text-[var(--c-ink)] text-[9px] font-display font-bold">
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-mono opacity-75">
                          <span>{d.slice(5)}</span>
                          {isStart && <span className="font-display text-[9px]">START</span>}
                          {isEnd && !isStart && <span className="font-display text-[9px]">END</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Selected Range Display Banner & Manual Date Inputs */}
            <div className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
                <div>
                  <span className="font-bold text-[var(--c-ink)] uppercase">Selected Date Range: </span>
                  <span className="font-bold text-[var(--c-navy)]">
                    {effectiveStart} ({formatDayLabel(effectiveStart)})
                    {rangeMode === 'range' &&
                      effectiveStart !== effectiveEnd &&
                      ` → ${effectiveEnd} (${formatDayLabel(effectiveEnd)})`}
                  </span>
                  <span className="ml-2 px-2 py-0.5 border border-[var(--c-ink)] bg-[var(--c-green)] font-bold">
                    {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-display text-xs">
                  <span className="text-[var(--c-ink)]">COVERED MONTHS:</span>
                  <span className="px-2 py-0.5 bg-[var(--c-orange)] text-[var(--c-ink)] font-bold border border-[var(--c-ink)]">
                    {targetMonths.join(', ')} ({targetMonths.length} {targetMonths.length === 1 ? 'Month' : 'Months'})
                  </span>
                </div>
              </div>

              {/* Exact Date Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--c-ink)]">
                <div>
                  <label className="font-display text-[10px] text-[var(--c-ink)] uppercase block mb-1">
                    Start Day:
                  </label>
                  <input
                    type="date"
                    value={effectiveStart}
                    onChange={(e) => {
                      if (e.target.value) {
                        setStartDate(e.target.value);
                        setViewMonth(e.target.value.slice(0, 7) as Month);
                      }
                    }}
                    className="w-full min-h-[40px] px-2 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] font-mono text-xs text-[var(--c-ink)]"
                  />
                </div>
                {rangeMode === 'range' && (
                  <div>
                    <label className="font-display text-[10px] text-[var(--c-ink)] uppercase block mb-1">
                      End Day:
                    </label>
                    <input
                      type="date"
                      value={effectiveEnd}
                      onChange={(e) => {
                        if (e.target.value) {
                          setEndDate(e.target.value);
                          setViewMonth(e.target.value.slice(0, 7) as Month);
                        }
                      }}
                      className="w-full min-h-[40px] px-2 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] font-mono text-xs text-[var(--c-ink)]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Google Sheet Response Link */}
          <Field
            label="Google Sheet Link"
            hint="Paste the URL of the Google Sheet containing membership form responses for the selected period"
            required
          >
            <input
              id="sheet-url"
              aria-label="Google Sheet Link"
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full min-h-[44px] px-3 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
              required
            />
          </Field>

          {/* Hidden or read-only input for test compatibility */}
          <div className="hidden">
            <Field label="Registration Month (YYYY-MM)">
              <input
                id="import-month"
                aria-label="Registration Month"
                type="text"
                value={targetMonths[0] || effectiveStart.slice(0, 7)}
                readOnly
              />
            </Field>
          </div>

          <div className="pt-2">
            <PixelButton
              size="md"
              variant="primary"
              disabled={previewMutation.isPending || !sheetUrl.trim() || targetMonths.length === 0}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? 'READING SHEET...' : 'PREVIEW IMPORT'}
            </PixelButton>
          </div>
        </Panel>
      )}

      {/* STEP 2: Mapping Preview */}
      {step === 2 && previewData && (
        <div className="space-y-6">
          <Panel title="STEP 2: MAPPING PREVIEW" className="px-corners space-y-4">
            <h2 className="font-display text-sm tracking-wider text-[var(--c-ink)] uppercase">
              MAPPING PREVIEW
            </h2>

            <p className="font-body text-base text-[var(--c-darkgrey)]">
              Verify column mapping from your response sheet. Matching scores show confidence of automatic header detection.
            </p>

            {/* Target Months Notice */}
            <div className="p-3 bg-[var(--c-peach)] border-2 border-[var(--c-ink)] font-mono text-xs space-y-1">
              <span className="font-bold text-[var(--c-ink)] uppercase">
                Sheets to be Auto-Generated for:
              </span>{' '}
              <span className="font-bold text-[var(--c-navy)]">{targetMonths.join(', ')}</span>
              <p className="text-[var(--c-darkgrey)] mt-1">
                The system will automatically initialize attendance sheets and membership rosters for all {targetMonths.length} selected months.
              </p>
            </div>

            {/* Warnings Section */}
            {previewData.warnings.length > 0 && (
              <div className="bg-[var(--c-peach)] border-4 border-[var(--c-ink)] p-4 space-y-2">
                <h4 className="font-display text-xs text-[var(--c-red)] uppercase">
                  WARNINGS & DETECTIONS ({previewData.warnings.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {previewData.warnings.map((w, idx) => {
                    const match = w.detail.match(/'([^']+)'/);
                    const unknownClassName = match ? match[1] : null;

                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-2 bg-[var(--c-bg)] border border-[var(--c-ink)] font-mono text-xs"
                      >
                        <div>
                          <span className="font-bold">Row {w.row}:</span> {w.detail}
                        </div>
                        {w.kind === 'unknownClass' && unknownClassName && (
                          <PixelButton
                            size="md"
                            variant="secondary"
                            onClick={() => setQuickStyleName(unknownClassName)}
                          >
                            ADD AS STYLE
                          </PixelButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Column Mappings Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-base border-collapse">
                <thead>
                  <tr className="border-b-4 border-[var(--c-ink)] bg-[var(--c-bg)] font-display text-xs text-[var(--c-ink)]">
                    <th className="p-3">SYSTEM FIELD</th>
                    <th className="p-3">MAPPED COLUMN</th>
                    <th className="p-3">CONFIDENCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[var(--c-ink)]">
                  {Object.entries(FIELD_LABELS).map(([fieldKey, label]) => {
                    const mappedIdx = columnMap[fieldKey];
                    const score = previewData.scores?.[fieldKey];

                    return (
                      <tr key={fieldKey} className="hover:bg-[var(--c-bg)]">
                        <td className="p-3 font-bold font-display text-xs">{label}</td>
                        <td className="p-3">
                          <select
                            value={mappedIdx ?? ''}
                            onChange={(e) =>
                              setColumnMap((prev) => ({
                                ...prev,
                                [fieldKey]: e.target.value === '' ? null : Number(e.target.value)
                              }))
                            }
                            className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-bg)]"
                          >
                            <option value="">-- Unmapped --</option>
                            {previewData.headers.map((h, i) => (
                              <option key={i} value={i}>
                                Col {i + 1}: {h}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {score !== undefined ? (
                            <span
                              className={`px-2 py-0.5 border border-[var(--c-ink)] font-bold ${
                                score > 0.8
                                  ? 'bg-[var(--c-green)] text-[var(--c-ink)]'
                                  : 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                              }`}
                            >
                              {Math.round(score * 100)}%
                            </span>
                          ) : (
                            <span className="text-[var(--c-darkgrey)] italic">Manual</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Class Column Selection */}
            <div className="p-4 bg-[var(--c-bg)] border-2 border-[var(--c-ink)] space-y-2">
              <label className="font-display text-xs uppercase text-[var(--c-ink)]">
                Dance Classes Column
              </label>
              <select
                value={classIndex}
                onChange={(e) => setClassIndex(Number(e.target.value))}
                className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-mono text-xs bg-[var(--c-panel)]"
              >
                {previewData.headers.map((h, i) => (
                  <option key={i} value={i}>
                    Col {i + 1}: {h}
                  </option>
                ))}
              </select>
            </div>

            {/* Counts by Style */}
            <div className="space-y-2">
              <h4 className="font-display text-xs text-[var(--c-ink)] uppercase">
                Dancer Registrations by Style
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {styles.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] shadow-[2px_2px_0_var(--c-ink)]"
                  >
                    <span className="font-display text-[10px] text-[var(--c-darkgrey)] uppercase block">
                      {s.name}
                    </span>
                    <span className="font-display text-base text-[var(--c-ink)] font-bold">
                      {previewData.countsByStyle[s.id] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
              <PixelButton size="md" variant="secondary" onClick={() => setStep(1)}>
                BACK
              </PixelButton>
              <PixelButton
                size="md"
                variant="primary"
                className="flex-1"
                onClick={() => setStep(3)}
              >
                PROCEED TO CONFIRM
              </PixelButton>
            </div>
          </Panel>
        </div>
      )}

      {/* STEP 3: Confirm & Auto-generate relative Google Sheets */}
      {step === 3 && previewData && (
        <Panel title="STEP 3: CONFIRM & AUTO-GENERATE GOOGLE SHEETS" className="px-corners space-y-4">
          <h2 className="font-display text-sm tracking-wider text-[var(--c-ink)] uppercase">
            CONFIRM & AUTO-GENERATE GOOGLE SHEETS
          </h2>
          <div className="bg-[var(--c-bg)] border-2 border-[var(--c-ink)] p-4 space-y-3 font-mono text-sm">
            <div>
              <span className="font-bold text-[var(--c-ink)]">Target Months:</span>{' '}
              <span className="font-bold text-[var(--c-navy)]">{targetMonths.join(', ')}</span> (
              {targetMonths.length} {targetMonths.length === 1 ? 'month' : 'months'})
            </div>
            <div>
              <span className="font-bold text-[var(--c-ink)]">Selected Date Range:</span>{' '}
              <span className="font-bold text-[var(--c-navy)]">
                {effectiveStart} to {effectiveEnd}
              </span>{' '}
              ({availableDays.length} days)
            </div>
            <div>
              <span className="font-bold text-[var(--c-ink)]">Total Dancers Detected:</span>{' '}
              {previewData.rowCount} members
            </div>
            <div>
              <span className="font-bold text-[var(--c-ink)]">Sample Names:</span>{' '}
              {previewData.sampleNames.join(', ')}
            </div>
          </div>

          {/* Class Schedule Dates & Times Picker (Per Dance Style) */}
          <div className="border-4 border-[var(--c-ink)] bg-[var(--c-panel)] p-4 space-y-4 shadow-[3px_3px_0_var(--c-ink)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[var(--c-ink)] pb-3">
              <div>
                <h3 className="font-display text-xs text-[var(--c-ink)] uppercase font-bold flex items-center gap-1.5">
                  <span>🗓️</span> SET CLASS SCHEDULE DATES & TIMES (PER DANCE STYLE)
                </h3>
                <p className="font-body text-xs text-[var(--c-darkgrey)] mt-1">
                  Class dates can differ for each dance style. Select or tick dates within your range ({effectiveStart} to {effectiveEnd}) for each class.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => copyScheduleToAllStyles(activeScheduleStyleId)}
                  title="Copy this style's dates & times to all other styles"
                >
                  📋 COPY TO ALL STYLES
                </PixelButton>
              </div>
            </div>

            {/* Dance Style Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 items-center">
              <span className="font-display text-xs text-[var(--c-ink)] uppercase mr-1 whitespace-nowrap">
                STYLE:
              </span>
              {styles.map((st) => {
                const count = schedulesByStyle[st.id]?.length || 0;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setActiveScheduleStyleId(st.id)}
                    className={`min-h-[40px] px-3 border-2 border-[var(--c-ink)] font-display text-xs cursor-pointer select-none whitespace-nowrap transition-none ${
                      activeScheduleStyleId === st.id
                        ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                        : 'bg-[var(--c-bg)] text-[var(--c-ink)] hover:bg-[var(--c-panel)]'
                    }`}
                  >
                    {st.name} ({count} classes)
                  </button>
                );
              })}
            </div>

            {/* Classes for the Active Dance Style */}
            {activeScheduleStyleId && (
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-[var(--c-bg)] border-2 border-[var(--c-ink)] p-2">
                  <div className="font-display text-xs text-[var(--c-navy)] font-bold">
                    {styles.find((s) => s.id === activeScheduleStyleId)?.name.toUpperCase()} CLASS SCHEDULE
                  </div>
                  <div className="flex gap-2">
                    <PixelButton
                      size="md"
                      variant="secondary"
                      onClick={() => resetStyleScheduleToWeekday(activeScheduleStyleId)}
                      title="Reset to default weekly dates"
                    >
                      ⚡ AUTO-FILL WEEKDAY
                    </PixelButton>
                    <PixelButton
                      size="md"
                      variant="primary"
                      onClick={() => addClassForStyle(activeScheduleStyleId)}
                    >
                      + ADD CLASS
                    </PixelButton>
                  </div>
                </div>

                {/* Grid of classes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(schedulesByStyle[activeScheduleStyleId] || []).map((c) => (
                    <div
                      key={c.seq}
                      className="border-2 border-[var(--c-ink)] bg-[var(--c-bg)] p-3 space-y-2.5 shadow-[2px_2px_0_var(--c-ink)]"
                    >
                      <div className="flex justify-between items-center border-b border-[var(--c-ink)] pb-1.5">
                        <span className="font-display text-xs text-[var(--c-ink)] font-bold bg-[var(--c-yellow)] px-2 py-0.5 border border-[var(--c-ink)]">
                          CLASS #{c.seq}
                        </span>
                        <span className="font-mono text-xs text-[var(--c-navy)] font-bold">
                          {formatDayLabel(c.date)}
                        </span>
                        {(schedulesByStyle[activeScheduleStyleId] || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeClassForStyle(activeScheduleStyleId, c.seq)}
                            className="px-1.5 py-0.5 border border-[var(--c-ink)] bg-[var(--c-peach)] text-[var(--c-red)] font-bold text-xs hover:bg-[var(--c-red)] hover:text-white"
                            title="Remove this class"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Date Selector Dropdown */}
                      <div>
                        <label className="block font-display text-[9px] text-[var(--c-darkgrey)] uppercase mb-1">
                          Select Date (Within Range)
                        </label>
                        <select
                          value={c.date}
                          onChange={(e) => updateClassDate(activeScheduleStyleId, c.seq, e.target.value as ISODate)}
                          className="w-full min-h-[38px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] font-mono text-xs font-bold"
                        >
                          {availableDays.map((d) => (
                            <option key={d} value={d}>
                              {d} — {formatDayLabel(d)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Interactive Date Pill Picker (Click / Tick on the range) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-display text-[9px] text-[var(--c-darkgrey)] uppercase">
                            Or Tick Date In Range:
                          </span>
                          <span className="font-mono text-[9px] text-[var(--c-darkgrey)]">
                            {availableDays.length} days available
                          </span>
                        </div>
                        <div className="flex gap-1 overflow-x-auto p-1.5 bg-[var(--c-panel)] border border-[var(--c-ink)] max-h-20">
                          {availableDays.map((d) => {
                            const isSelected = c.date === d;
                            const label = formatDayLabel(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => updateClassDate(activeScheduleStyleId, c.seq, d)}
                                className={`px-2 py-1 text-[10px] font-mono whitespace-nowrap cursor-pointer transition-none select-none ${
                                  isSelected
                                    ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] font-bold border-2 border-[var(--c-ink)] shadow-[1px_1px_0_var(--c-ink)]'
                                    : 'bg-[var(--c-bg)] text-[var(--c-darkgrey)] border border-[var(--c-ink)] hover:bg-[var(--c-peach)]'
                                }`}
                              >
                                {isSelected ? `✓ ${label}` : label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Start Time & End Time */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-display text-[9px] text-[var(--c-darkgrey)] uppercase">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={c.start}
                            onChange={(e) => updateClassTime(activeScheduleStyleId, c.seq, 'start', e.target.value)}
                            className="w-full min-h-[36px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block font-display text-[9px] text-[var(--c-darkgrey)] uppercase">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={c.end}
                            onChange={(e) => updateClassTime(activeScheduleStyleId, c.seq, 'end', e.target.value)}
                            className="w-full min-h-[36px] px-2 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[var(--c-peach)] border-2 border-[var(--c-ink)] p-4 text-xs font-body space-y-1">
            <strong>System Action & Automated Google Sheets Generation:</strong>
            <p>
              Confirming import will save these exact class schedules in the database and automatically create or sync monthly attendance Google Sheets in Google Drive for all {styles.length} active styles across {targetMonths.length} months. Even for future months, classes and attendance grids will be prepared in advance!
            </p>
          </div>

          {importProgress && (
            <div className="bg-[var(--c-yellow)] border-2 border-[var(--c-ink)] p-3 text-center font-display text-xs animate-pulse">
              {importProgress}
            </div>
          )}

          <div className="flex gap-3 pt-3 border-t-2 border-[var(--c-ink)]">
            <PixelButton
              size="md"
              variant="secondary"
              disabled={confirmMutation.isPending}
              onClick={() => setStep(2)}
            >
              BACK
            </PixelButton>
            <PixelButton
              size="md"
              variant="primary"
              className="flex-1"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? 'AUTO-GENERATING GOOGLE SHEETS...' : 'CONFIRM & AUTO-GENERATE SHEETS'}
            </PixelButton>
          </div>
        </Panel>
      )}

      {/* STEP 4: Results */}
      {step === 4 && resultsByMonth.length > 0 && (
        <Panel title="IMPORT & AUTO-GENERATION COMPLETED!" className="px-corners space-y-5">
          <div className="bg-[var(--c-green)] border-4 border-[var(--c-ink)] p-4 shadow-[4px_4px_0_var(--c-ink)]">
            <h3 className="font-display text-sm text-[var(--c-ink)] uppercase">
              SUCCESSFULLY INITIALIZED {resultsByMonth.length} MONTH(S)!
            </h3>
            <p className="font-body text-base text-[var(--c-ink)] mt-1">
              All relative Google Sheets (Attendance Sheets and Member Rosters) have been automatically generated in your Google Drive.
            </p>
          </div>

          {/* Results grouped per month */}
          <div className="space-y-4">
            {resultsByMonth.map((res) => (
              <div key={res.month} className="border-2 border-[var(--c-ink)] bg-[var(--c-bg)] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b-2 border-[var(--c-ink)] pb-2">
                  <span className="font-display text-xs text-[var(--c-navy)] font-bold">
                    MONTH: {res.month} ({res.memberCount} dancers)
                  </span>
                  <PixelButton
                    size="md"
                    variant="secondary"
                    onClick={() => navigate(`/admin/calendar`)}
                  >
                    SCHEDULE CLASSES IN CALENDAR
                  </PixelButton>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {res.attendanceSheets.map((as) => {
                    const style = styles.find((s) => s.id === as.styleId);
                    return (
                      <div
                        key={as.styleId}
                        className="p-2 border border-[var(--c-ink)] bg-[var(--c-panel)] flex justify-between items-center"
                      >
                        <span className="font-display text-[10px] uppercase">
                          {style?.name || as.styleId}
                        </span>
                        <PixelButton
                          size="md"
                          variant="primary"
                          onClick={() => navigate(`/admin/attendance?month=${res.month}&style=${as.styleId}`)}
                        >
                          OPEN ATTENDANCE
                        </PixelButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4 border-t-2 border-[var(--c-ink)]">
            <PixelButton
              size="md"
              variant="secondary"
              onClick={() => {
                setStep(1);
                setPreviewData(null);
                setResultsByMonth([]);
              }}
            >
              IMPORT ANOTHER RANGE
            </PixelButton>
            <PixelButton
              size="md"
              variant="primary"
              className="flex-1"
              onClick={() => navigate(`/admin/members?month=${targetMonths[0]}`)}
            >
              VIEW REGISTERED DANCERS
            </PixelButton>
          </div>
        </Panel>
      )}

      {/* Quick Add Style Modal */}
      {quickStyleName && (
        <div className="fixed inset-0 bg-[var(--c-ink)]/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Panel title={`ADD "${quickStyleName}" AS STYLE`} className="px-corners bg-[var(--c-panel)] space-y-4">
              <p className="font-body text-sm text-[var(--c-darkgrey)]">
                Create a new dance style for &ldquo;{quickStyleName}&rdquo; so the import can recognize and assign dancers to it.
              </p>

              <Field label="Style Color">
                <select
                  value={quickStyleColor}
                  onChange={(e) => setQuickStyleColor(e.target.value)}
                  className="w-full min-h-[44px] px-2 border-2 border-[var(--c-ink)] font-body text-sm bg-[var(--c-bg)]"
                >
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="orange">Orange</option>
                  <option value="pink">Pink</option>
                  <option value="yellow">Yellow</option>
                  <option value="lavender">Lavender</option>
                </select>
              </Field>

              <div className="flex gap-3 pt-2 border-t-2 border-[var(--c-ink)]">
                <PixelButton
                  size="md"
                  variant="primary"
                  className="flex-1"
                  disabled={createStyleMutation.isPending}
                  onClick={() => createStyleMutation.mutate(quickStyleName)}
                >
                  {createStyleMutation.isPending ? 'CREATING...' : 'CREATE STYLE & REFRESH'}
                </PixelButton>
                <PixelButton
                  size="md"
                  variant="secondary"
                  disabled={createStyleMutation.isPending}
                  onClick={() => setQuickStyleName(null)}
                >
                  CANCEL
                </PixelButton>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
};
export default ImportWizard;
