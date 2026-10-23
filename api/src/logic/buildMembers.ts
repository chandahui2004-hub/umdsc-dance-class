import { Member } from '@umdsc/shared';
import { Field } from './headerMatch';
import { normalizeMatric, nameKey, normalizePhone, fullNameMatches, nameSimilarity } from './normalize';
import { parseStyles } from './classDetect';

export interface ImportWarning {
  kind: 'noStyle' | 'unknownClass' | 'duplicate' | 'missingName' | 'missingMatric' | 'phoneRepaired' | 'matricConflict' | 'nameVariation';
  row: number;
  detail: string;
}

export function buildMembers(input: {
  headers: string[];
  rows: string[][];
  map: Record<Field, number | null>;
  classIndex: number;
  styles: { id: string; name: string; aliases: string[] }[];
  timestampIndex: number | null;
}): {
  members: Member[];
  warnings: ImportWarning[];
  countsByStyle: Record<string, number>;
  /** Every response timestamp behind each member (a dancer may have answered more than once). */
  timestampsByMember: Record<string, string[]>;
} {
  const { rows, map, classIndex, styles, timestampIndex } = input;
  const warnings: ImportWarning[] = [];

  const styleNameById = new Map<string, string>();
  for (const s of styles) {
    styleNameById.set(s.id, s.name);
  }

  const countsByStyle: Record<string, number> = {};
  for (const s of styles) {
    countsByStyle[s.id] = 0;
  }

  const membersByMatric = new Map<
    string,
    Array<{
      member: Member;
      timestampValue: number;
      rowNum: number;
    }>
  >();
  const timestampsByMember: Record<string, string[]> = {};

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 2;

    const matricRaw = map.matric !== null && map.matric !== undefined ? String(row[map.matric] ?? '').trim() : '';
    const fullNameRaw = map.fullName !== null && map.fullName !== undefined ? String(row[map.fullName] ?? '').trim() : '';
    const contactRaw = map.contact !== null && map.contact !== undefined ? String(row[map.contact] ?? '').trim() : '';
    const email = map.email !== null && map.email !== undefined ? String(row[map.email] ?? '').trim() : '';
    const gender = map.gender !== null && map.gender !== undefined ? String(row[map.gender] ?? '').trim() : '';
    const nationality = map.nationality !== null && map.nationality !== undefined ? String(row[map.nationality] ?? '').trim() : '';
    const sourceTimestamp = timestampIndex !== null && timestampIndex !== undefined ? String(row[timestampIndex] ?? '').trim() : '';

    if (!matricRaw) {
      warnings.push({
        kind: 'missingMatric',
        row: rowNum,
        detail: `Row ${rowNum} has empty matric number`
      });
      continue;
    }

    const matricKey = normalizeMatric(matricRaw);
    if (!matricKey) {
      warnings.push({
        kind: 'missingMatric',
        row: rowNum,
        detail: `Row ${rowNum} has invalid matric number "${matricRaw}"`
      });
      continue;
    }

    if (!fullNameRaw) {
      warnings.push({
        kind: 'missingName',
        row: rowNum,
        detail: `Row ${rowNum} has empty name`
      });
    }

    const flags: string[] = [];

    // Phone normalization
    const { value: contact, repaired } = normalizePhone(contactRaw);
    if (repaired) {
      flags.push('phoneRepaired');
      warnings.push({
        kind: 'phoneRepaired',
        row: rowNum,
        detail: `Phone number repaired to "${contact}"`
      });
    }

    // Class styles parsing
    const classCell = classIndex !== null && classIndex !== undefined ? String(row[classIndex] ?? '') : '';
    const { styleIds, unknownTokens } = parseStyles(classCell, styles);

    for (const token of unknownTokens) {
      warnings.push({
        kind: 'unknownClass',
        row: rowNum,
        detail: `Unknown class '${token}'`
      });
    }

    if (styleIds.length === 0) {
      flags.push('noStyle');
      warnings.push({
        kind: 'noStyle',
        row: rowNum,
        detail: `Row ${rowNum} has no recognized dance styles`
      });
    }

    const styleNames = styleIds.map(id => styleNameById.get(id) || id);
    const nk = nameKey(fullNameRaw);
    const currentTimestampValue = sourceTimestamp ? Date.parse(sourceTimestamp) || 0 : 0;

    const currentMember: Member = {
      memberId: 'M-' + matricKey,
      fullName: fullNameRaw,
      matricRaw,
      matricKey,
      nameKey: nk,
      contact,
      email,
      gender,
      nationality,
      styleIds,
      styleNames,
      sourceTimestamp,
      flags
    };

    const existingList = membersByMatric.get(matricKey) || [];
    let matchingEntry: { member: Member; timestampValue: number; rowNum: number } | null = null;

    for (const entry of existingList) {
      if (
        fullNameMatches(fullNameRaw, entry.member.fullName) ||
        nameSimilarity(fullNameRaw, entry.member.fullName) >= 0.82
      ) {
        matchingEntry = entry;
        break;
      }
    }

    if (matchingEntry) {
      if (
        fullNameRaw &&
        matchingEntry.member.fullName &&
        fullNameRaw.trim().toLowerCase() !== matchingEntry.member.fullName.trim().toLowerCase()
      ) {
        warnings.push({
          kind: 'nameVariation',
          row: rowNum,
          detail: `Name variation "${matchingEntry.member.fullName}" vs "${fullNameRaw}" on matric ${matricKey}`
        });
      }
      warnings.push({
        kind: 'duplicate',
        row: rowNum,
        detail: `Duplicate matric ${matricKey} merged`
      });

      const unionStylesSet = new Set([...matchingEntry.member.styleIds, ...styleIds]);
      const unionStyleIds = Array.from(unionStylesSet);
      const unionStyleNames = unionStyleIds.map(id => styleNameById.get(id) || id);

      const unionFlagsSet = new Set([...matchingEntry.member.flags, ...flags].filter(f => f !== 'duplicate'));
      if (unionStyleIds.length > 0) {
        unionFlagsSet.delete('noStyle');
      }

      if (sourceTimestamp) {
        (timestampsByMember[matchingEntry.member.memberId] ||= []).push(sourceTimestamp);
      }

      if (currentTimestampValue >= matchingEntry.timestampValue) {
        matchingEntry.member = {
          ...currentMember,
          memberId: matchingEntry.member.memberId,
          styleIds: unionStyleIds,
          styleNames: unionStyleNames,
          flags: Array.from(unionFlagsSet)
        };
        matchingEntry.timestampValue = currentTimestampValue;
      } else {
        matchingEntry.member.styleIds = unionStyleIds;
        matchingEntry.member.styleNames = unionStyleNames;
        matchingEntry.member.flags = Array.from(unionFlagsSet);
      }
    } else {
      if (existingList.length > 0) {
        warnings.push({
          kind: 'matricConflict',
          row: rowNum,
          detail: `Matric ${matricKey} shared by "${existingList[0].member.fullName}" and "${fullNameRaw}"`
        });
        const slug = nk.replace(/\s+/g, '_') || String(existingList.length + 1);
        currentMember.memberId = `M-${matricKey}-${slug}`;
      } else {
        currentMember.memberId = `M-${matricKey}`;
      }

      if (sourceTimestamp) {
        (timestampsByMember[currentMember.memberId] ||= []).push(sourceTimestamp);
      }

      existingList.push({
        member: currentMember,
        timestampValue: currentTimestampValue,
        rowNum
      });
      membersByMatric.set(matricKey, existingList);
    }
  }

  const members: Member[] = [];
  for (const list of membersByMatric.values()) {
    for (const { member } of list) {
      members.push(member);
      for (const styleId of member.styleIds) {
        countsByStyle[styleId] = (countsByStyle[styleId] || 0) + 1;
      }
    }
  }

  return {
    members,
    warnings,
    countsByStyle,
    timestampsByMember
  };
}
