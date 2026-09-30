import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Panel } from '../../components/ui/Panel';
import { PixelButton } from '../../components/ui/PixelButton';
import { Field } from '../../components/ui/Field';
import { todayKL, addMonths, getMonthsRange } from '../../lib/time';
import type { DanceStyle, Month } from '@umdsc/shared';

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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const ImportWizard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Month selection & advance scheduling range state
  const currentMonth = todayKL().slice(0, 7);
  const [rangeMode, setRangeMode] = useState<'single' | 'range'>('single');
  const [startMonth, setStartMonth] = useState<Month>(currentMonth);
  const [endMonth, setEndMonth] = useState<Month>(addMonths(currentMonth, 1));
  const [calendarYear, setCalendarYear] = useState<number>(parseInt(currentMonth.split('-')[0], 10));

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

  // Compute selected months range
  const targetMonths: Month[] = useMemo(() => {
    if (rangeMode === 'single') {
      return [startMonth];
    }
    return getMonthsRange(startMonth, endMonth);
  }, [rangeMode, startMonth, endMonth]);

  const { data: styles = [] } = useQuery<DanceStyle[]>({
    queryKey: ['styles'],
    queryFn: async () => {
      const res = await api.post<DanceStyle[]>('styles.list');
      return res.data;
    }
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      setStep1Error(null);
      const res = await api.post<PreviewData>('members.previewImport', {
        sheetUrl: sheetUrl.trim(),
        month: startMonth
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

      return results;
    },
    onSuccess: (results) => {
      setResultsByMonth(results);
      setImportProgress(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
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

  const handleMonthTileClick = (mStr: Month) => {
    if (rangeMode === 'single') {
      setStartMonth(mStr);
    } else {
      if (!startMonth || (startMonth && endMonth && startMonth !== endMonth)) {
        setStartMonth(mStr);
        setEndMonth(mStr);
      } else {
        if (mStr < startMonth) {
          setStartMonth(mStr);
        } else {
          setEndMonth(mStr);
        }
      }
    }
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

      {/* STEP 1: Interactive Month Range Calendar & Link */}
      {step === 1 && (
        <Panel title="STEP 1: SELECT MONTH RANGE & GOOGLE SHEET LINK" className="px-corners space-y-5">
          {step1Error && (
            <div
              role="alert"
              className="bg-[var(--c-peach)] border-4 border-[var(--c-red)] p-4 text-[var(--c-red)] font-body font-bold text-sm"
            >
              {step1Error}
            </div>
          )}

          {/* Advance Setup Mode Selection */}
          <div className="space-y-2">
            <span className="font-display text-xs text-[var(--c-ink)] uppercase">
              Registration Planning Mode:
            </span>
            <div className="flex flex-wrap gap-2">
              <PixelButton
                size="md"
                variant={rangeMode === 'single' ? 'primary' : 'secondary'}
                onClick={() => setRangeMode('single')}
              >
                SINGLE MONTH
              </PixelButton>
              <PixelButton
                size="md"
                variant={rangeMode === 'range' ? 'primary' : 'secondary'}
                onClick={() => setRangeMode('range')}
              >
                MONTH RANGE (ADVANCE FUTURE SETUP)
              </PixelButton>
            </div>
          </div>

          {/* Interactive Month Picker Calendar */}
          <div className="bg-[var(--c-bg)] border-4 border-[var(--c-ink)] p-4 shadow-[2px_2px_0_var(--c-ink)] space-y-4">
            <div className="flex justify-between items-center pb-2 border-b-2 border-[var(--c-ink)]">
              <h3 className="font-display text-xs text-[var(--c-navy)] uppercase tracking-wider">
                {rangeMode === 'single' ? 'SELECT REGISTRATION MONTH' : 'SELECT ADVANCE MONTH RANGE (START TO END)'}
              </h3>
              <div className="flex items-center gap-2 font-display text-xs">
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => setCalendarYear((y) => y - 1)}
                >
                  &lt;
                </PixelButton>
                <span className="px-2 font-bold">{calendarYear}</span>
                <PixelButton
                  size="md"
                  variant="secondary"
                  onClick={() => setCalendarYear((y) => y + 1)}
                >
                  &gt;
                </PixelButton>
              </div>
            </div>

            {/* 12 Months Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {MONTH_NAMES.map((nameStr, mIdx) => {
                const mNum = String(mIdx + 1).padStart(2, '0');
                const mStr = `${calendarYear}-${mNum}`;
                const isSelected = targetMonths.includes(mStr);
                const isStart = mStr === startMonth;
                const isEnd = mStr === endMonth && rangeMode === 'range';
                const isCurrent = mStr === currentMonth;

                return (
                  <button
                    key={mStr}
                    type="button"
                    aria-label={`${nameStr} ${calendarYear}`}
                    onClick={() => handleMonthTileClick(mStr)}
                    className={`min-h-[50px] p-2 border-2 border-[var(--c-ink)] flex flex-col items-center justify-center font-display text-xs cursor-pointer transition-none select-none ${
                      isStart || isEnd
                        ? 'bg-[var(--c-orange)] text-[var(--c-ink)] font-bold shadow-[2px_2px_0_var(--c-ink)]'
                        : isSelected
                        ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] font-bold'
                        : isCurrent
                        ? 'bg-[var(--c-peach)] hover:bg-[var(--c-yellow)]'
                        : 'bg-[var(--c-panel)] hover:bg-[var(--c-bg)]'
                    }`}
                  >
                    <span>{nameStr}</span>
                    <span className="font-mono text-[10px] text-[var(--c-darkgrey)]">
                      {calendarYear}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Range Display Banner */}
            <div className="p-3 border-2 border-[var(--c-ink)] bg-[var(--c-panel)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
              <div>
                <span className="font-bold text-[var(--c-ink)] uppercase">Selected Target: </span>
                <span className="font-bold text-[var(--c-navy)]">
                  {rangeMode === 'single' ? startMonth : `${startMonth} → ${endMonth}`}
                </span>
                <span className="ml-2 px-2 py-0.5 border border-[var(--c-ink)] bg-[var(--c-green)] font-bold">
                  {targetMonths.length} {targetMonths.length === 1 ? 'Month' : 'Months'} Selected
                </span>
              </div>
              <div className="text-[var(--c-darkgrey)] italic">
                {targetMonths.some((m) => m > currentMonth)
                  ? 'Future months included for advance class setup'
                  : 'Current period'}
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
                value={startMonth}
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
              <span className="font-bold text-[var(--c-ink)]">Total Dancers Detected:</span>{' '}
              {previewData.rowCount} members
            </div>
            <div>
              <span className="font-bold text-[var(--c-ink)]">Sample Names:</span>{' '}
              {previewData.sampleNames.join(', ')}
            </div>
          </div>

          <div className="bg-[var(--c-peach)] border-2 border-[var(--c-ink)] p-4 text-xs font-body space-y-1">
            <strong>System Action & Automated Google Sheets Generation:</strong>
            <p>
              Confirming import will automatically create or sync monthly attendance Google Sheets in Google Drive for all {styles.length} active styles across {targetMonths.length} months. Even for future months, classes and attendance grids will be prepared in advance!
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
