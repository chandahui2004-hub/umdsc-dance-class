import { Member } from '@umdsc/shared';
import { Field } from './headerMatch';
import { normalizeMatric, nameKey, normalizePhone } from './normalize';
import { parseStyles } from './classDetect';

export interface ImportWarning {
  kind: 'noStyle' | 'unknownClass' | 'duplicate' | 'missingName' | 'missingMatric' | 'phoneRepaired';
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
    {
      member: Member;
      timestampValue: number;
      rowNum: number;
    }
  >();

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
    const memberId = 'M-' + matricKey;
    const nk = nameKey(fullNameRaw);

    const currentTimestampValue = sourceTimestamp ? Date.parse(sourceTimestamp) || 0 : 0;

    const currentMember: Member = {
      memberId,
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

    if (membersByMatric.has(matricKey)) {
      const existing = membersByMatric.get(matricKey)!;
      warnings.push({
        kind: 'duplicate',
        row: rowNum,
        detail: `Duplicate matric ${matricKey} merged`
      });

      const unionStylesSet = new Set([...existing.member.styleIds, ...styleIds]);
      const unionStyleIds = Array.from(unionStylesSet);
      const unionStyleNames = unionStyleIds.map(id => styleNameById.get(id) || id);

      const unionFlagsSet = new Set([...existing.member.flags, ...flags, 'duplicate']);
      if (unionStyleIds.length > 0) {
        unionFlagsSet.delete('noStyle');
      }

      if (currentTimestampValue >= existing.timestampValue) {
        membersByMatric.set(matricKey, {
          member: {
            ...currentMember,
            styleIds: unionStyleIds,
            styleNames: unionStyleNames,
            flags: Array.from(unionFlagsSet)
          },
          timestampValue: currentTimestampValue,
          rowNum: existing.rowNum
        });
      } else {
        existing.member.styleIds = unionStyleIds;
        existing.member.styleNames = unionStyleNames;
        existing.member.flags = Array.from(unionFlagsSet);
      }
    } else {
      membersByMatric.set(matricKey, {
        member: currentMember,
        timestampValue: currentTimestampValue,
        rowNum
      });
    }
  }

  const members: Member[] = [];
  for (const { member } of membersByMatric.values()) {
    members.push(member);
    for (const styleId of member.styleIds) {
      countsByStyle[styleId] = (countsByStyle[styleId] || 0) + 1;
    }
  }

  return {
    members,
    warnings,
    countsByStyle
  };
}
