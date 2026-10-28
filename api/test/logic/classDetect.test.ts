import { describe, it, expect } from 'vitest';
import { detectClassColumn, parseStyles } from '../../src/logic/classDetect';

describe('Class Column Detection & Style Parsing (logic/classDetect)', () => {
  const styles = [
    { id: 'hh', name: 'Hip Hop', aliases: ['hip hop', 'hiphop', 'hip-hop'] },
    { id: 'pp', name: 'Popping', aliases: ['popping'] },
    { id: 'lt', name: 'Latin', aliases: ['latin'] },
    { id: 'lk', name: 'Locking', aliases: ['locking'] }
  ];

  it('detects class column with high hit rate', () => {
    const rows = [
      ['Alice', 'Popping (RM60/month)', 'Faculty of Law'],
      ['Bob', 'Hip Hop (RM60/month), Latin (RM60/month)', 'Engineering'],
      ['Charlie', 'Latin (RM60/month), Popping (RM60/month)', 'PASUM']
    ];

    const detected = detectClassColumn(rows, styles, ['Name', 'Classes', 'Faculty']);
    expect(detected).toEqual({ index: 1, hitRate: 1 });
  });

  it('parses multiple styles and strips fees/parentheses', () => {
    const result = parseStyles('Hip Hop (RM60/month), Latin (RM60/month)', styles);
    expect(result).toEqual({
      styleIds: ['hh', 'lt'],
      unknownTokens: []
    });
  });

  it('extracts unknown class tokens when class names are not recognized', () => {
    const result = parseStyles('HipHop class, Contemporary (RM60/month)', styles);
    expect(result).toEqual({
      styleIds: ['hh'],
      unknownTokens: ['Contemporary']
    });
  });

  it('returns null if no column reaches 0.5 hit rate', () => {
    const rows = [
      ['A', 'x'],
      ['B', 'y']
    ];
    const detected = detectClassColumn(rows, styles, ['Name', 'Other']);
    expect(detected).toBeNull();
  });

  it('matches exact style name on later style (K-Pop) instead of substring alias on earlier style (Popping -> pop)', () => {
    const stylesWithShortAlias = [
      { id: 'st_popping', name: 'Popping', aliases: ['popping', 'pop'] },
      { id: 'st_kpop', name: 'K-Pop', aliases: ['kpop', 'k-pop'] }
    ];
    expect(parseStyles('K-Pop (RM40)', stylesWithShortAlias)).toEqual({
      styleIds: ['st_kpop'],
      unknownTokens: []
    });
  });
});
