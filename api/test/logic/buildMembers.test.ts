import { describe, it, expect } from 'vitest';
import { buildMembers } from '../../src/logic/buildMembers';
import { Field } from '../../src/logic/headerMatch';

describe('Build Members from Rows (logic/buildMembers)', () => {
  const styles = [
    { id: 'hh', name: 'Hip Hop', aliases: ['hip hop', 'hiphop'] },
    { id: 'pp', name: 'Popping', aliases: ['popping'] },
    { id: 'lt', name: 'Latin', aliases: ['latin'] }
  ];

  const headers = ['Timestamp', 'Full Name', 'Matric', 'Phone', 'Email', 'Classes'];
  const map: Record<Field, number | null> = {
    fullName: 1,
    matric: 2,
    contact: 3,
    email: 4,
    gender: null,
    nationality: null
  };
  const classIndex = 5;
  const timestampIndex = 0;

  it('memberId = "M-" + matricKey; matric "2.2003949E7" → matricKey "22003949"', () => {
    const rows = [
      ['2026-10-01 10:00:00', 'Ahmad Ali', '2.2003949E7', '0123456789', 'ahmad@test.com', 'Popping']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.members.length).toBe(1);
    const m = result.members[0];
    expect(m.matricKey).toBe('22003949');
    expect(m.memberId).toBe('M-22003949');
    expect(m.fullName).toBe('Ahmad Ali');
    expect(m.nameKey).toBe('ahmad ali');
    expect(m.styleIds).toEqual(['pp']);
    expect(m.styleNames).toEqual(['Popping']);
  });

  it('duplicate matric in same month: styles unioned, latest timestamp kept, one "duplicate" warning', () => {
    const rows = [
      ['2026-10-01 09:00:00', 'Tan Wei Jie', 'S2199647', '0123456789', 'tan1@test.com', 'Popping'],
      ['2026-10-02 14:00:00', 'Tan Wei Jie', 'S2199647', '0123456789', 'tan_new@test.com', 'Hip Hop']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.members.length).toBe(1);
    const m = result.members[0];
    expect(m.matricKey).toBe('S2199647');
    expect(m.email).toBe('tan_new@test.com');
    expect(m.sourceTimestamp).toBe('2026-10-02 14:00:00');
    expect(m.styleIds.sort()).toEqual(['hh', 'pp'].sort());
    expect(m.flags).toContain('duplicate');

    const dupWarnings = result.warnings.filter(w => w.kind === 'duplicate');
    expect(dupWarnings.length).toBe(1);
  });

  it('row with empty matric → skipped with "missingMatric" warning', () => {
    const rows = [
      ['2026-10-01 10:00:00', 'Ghost Dancer', '', '0123456789', 'ghost@test.com', 'Latin']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.members.length).toBe(0);
    expect(result.warnings.some(w => w.kind === 'missingMatric')).toBe(true);
  });

  it('phone "1.37545173E8" stored "0137545173" with "phoneRepaired" warning', () => {
    const rows = [
      ['2026-10-01 10:00:00', 'Lee Chong Wei', '22001111', '1.37545173E8', 'lee@test.com', 'Latin']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.members.length).toBe(1);
    expect(result.members[0].contact).toBe('0137545173');
    expect(result.members[0].flags).toContain('phoneRepaired');
    expect(result.warnings.some(w => w.kind === 'phoneRepaired')).toBe(true);
  });

  it('row whose class cell matches nothing → kept with styleIds [] and "noStyle" warning', () => {
    const rows = [
      ['2026-10-01 10:00:00', 'Undecided Dancer', '22002222', '0123456789', 'undecided@test.com', 'Unrelated Class']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.members.length).toBe(1);
    expect(result.members[0].styleIds).toEqual([]);
    expect(result.members[0].flags).toContain('noStyle');
    expect(result.warnings.some(w => w.kind === 'noStyle')).toBe(true);
    expect(result.warnings.some(w => w.kind === 'unknownClass')).toBe(true);
  });

  it('countsByStyle counts each member once per style', () => {
    const rows = [
      ['2026-10-01 10:00:00', 'Member One', '22000001', '0123456789', 'm1@test.com', 'Popping, Latin'],
      ['2026-10-01 10:00:00', 'Member Two', '22000002', '0123456789', 'm2@test.com', 'Popping'],
      // duplicate row of Member One should NOT double count
      ['2026-10-02 10:00:00', 'Member One', '22000001', '0123456789', 'm1@test.com', 'Latin']
    ];

    const result = buildMembers({
      headers,
      rows,
      map,
      classIndex,
      styles,
      timestampIndex
    });

    expect(result.countsByStyle['pp']).toBe(2);
    expect(result.countsByStyle['lt']).toBe(1);
    expect(result.countsByStyle['hh']).toBe(0);
  });
});
