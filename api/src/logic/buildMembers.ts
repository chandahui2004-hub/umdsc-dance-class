import { Member } from '@umdsc/shared';
import { Field } from './headerMatch';
import { normalizeMatric, nameKey, normalizePhone } from './normalize';
import { parseStyles } from './classDetect';

export interface ImportWarning {
  kind:
    | 'noStyle'
    | 'unknownClass'
    | 'duplicate'
    | 'missingName'
    | 'missingMatric'
    | 'phoneRepaired'
    | 'incompleteRow';
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
  /** Number of non-blank rows skipped because required fields were still incomplete/mid-edit. */
  incompleteRowCount: number;
} {
  const { rows, map, classIndex, styles, timestampIndex } = input;
  const warnings: ImportWarning[] = [];
  let incompleteRowCount = 0;

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
  const timestampsByMember: Record<string, string[]> = {};

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(cell => !String(cell ?? '').trim())) {
      continue;
    }
    const rowNum = r + 2;

    const matricRaw = map.matric !== null && map.matric !== undefined ? String(row[map.matric] ?? '').trim() : '';
    const fullNameRaw = map.fullName !== null && map.fullName !== undefined ? String(row[map.fullName] ?? '').trim() : '';
    const contactRaw = map.contact !== null && map.contact !== undefined ? String(row[map.contact] ?? '').trim() : '';
    const email = map.email !== null && map.email !== undefined ? String(row[map.email] ?? '').trim() : '';
    const gender = map.gender !== null && map.gender !== undefined ? String(row[map.gender] ?? '').trim() : '';
    const nationality = map.nationality !== null && map.nationality !== undefined ? String(row[map.nationality] ?? '').trim() : '';
    const sourceTimestamp = timestampIndex !== null && timestampIndex !== undefined && timestampIndex >= 0 ? String(row[timestampIndex] ?? '').trim() : '';
    const classCell = classIndex !== null && classIndex !== undefined && classIndex >= 0 ? String(row[classIndex] ?? '').trim() : '';

    if (!matricRaw) {
      incompleteRowCount++;
      warnings.push({
        kind: 'missingMatric',
        row: rowNum,
        detail: `Row ${rowNum} has empty matric number`
      });
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has empty matric number`
      });
      continue;
    }

    const matricKey = normalizeMatric(matricRaw);
    if (!matricKey) {
      incompleteRowCount++;
      warnings.push({
        kind: 'missingMatric',
        row: rowNum,
        detail: `Row ${rowNum} has invalid matric number "${matricRaw}"`
      });
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has invalid matric number "${matricRaw}"`
      });
      continue;
    }

    if (matricKey.length < 4) {
      incompleteRowCount++;
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has incomplete matric number "${matricRaw}"`
      });
      continue;
    }

    if (!fullNameRaw) {
      incompleteRowCount++;
      warnings.push({
        kind: 'missingName',
        row: rowNum,
        detail: `Row ${rowNum} has empty name`
      });
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has empty name`
      });
      continue;
    }

    if (classIndex !== null && classIndex !== undefined && classIndex >= 0 && !classCell) {
      incompleteRowCount++;
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has empty class selection`
      });
      continue;
    }

    if (contactRaw.length > 0 && contactRaw.replace(/\D/g, '').length < 6) {
      incompleteRowCount++;
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has incomplete contact number "${contactRaw}"`
      });
      continue;
    }

    if (email.length > 0 && !/^(n\/?a|-+|none|nil)$/i.test(email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      incompleteRowCount++;
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} has incomplete email "${email}"`
      });
      continue;
    }

    const hasTimestampCol = timestampIndex !== null && timestampIndex !== undefined && timestampIndex >= 0;
    if (
      hasTimestampCol &&
      !sourceTimestamp &&
      ((map.contact !== null && map.contact !== undefined && !contactRaw) ||
        (map.email !== null && map.email !== undefined && !email))
    ) {
      incompleteRowCount++;
      warnings.push({
        kind: 'incompleteRow',
        row: rowNum,
        detail: `Row ${rowNum} is a manual sheet entry missing contact or email`
      });
      continue;
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

    const existing = membersByMatric.get(matricKey);
    if (existing) {
      warnings.push({
        kind: 'duplicate',
        row: rowNum,
        detail: `Duplicate matric ${matricKey} merged`
      });

      const unionStylesSet = new Set([...existing.member.styleIds, ...styleIds]);
      const unionStyleIds = Array.from(unionStylesSet);
      const unionStyleNames = unionStyleIds.map(id => styleNameById.get(id) || id);

      const unionFlagsSet = new Set([...existing.member.flags, ...flags].filter(f => f !== 'duplicate'));
      if (unionStyleIds.length > 0) {
        unionFlagsSet.delete('noStyle');
      }

      if (sourceTimestamp) {
        (timestampsByMember[existing.member.memberId] ||= []).push(sourceTimestamp);
      }

      // Preserve authentic name if incoming is dummy test name
      const isTestName = /^testing\s*[0-9]*$/i.test(fullNameRaw);
      const existingIsTestName = /^testing\s*[0-9]*$/i.test(existing.member.fullName);
      const preferExistingName = !existingIsTestName && isTestName;

      if (currentTimestampValue >= existing.timestampValue && !preferExistingName) {
        existing.member = {
          ...currentMember,
          memberId: existing.member.memberId,
          styleIds: unionStyleIds,
          styleNames: unionStyleNames,
          flags: Array.from(unionFlagsSet)
        };
        existing.timestampValue = currentTimestampValue;
      } else {
        existing.member.styleIds = unionStyleIds;
        existing.member.styleNames = unionStyleNames;
        existing.member.flags = Array.from(unionFlagsSet);
      }
    } else {
      currentMember.memberId = 'M-' + matricKey;
      if (sourceTimestamp) {
        (timestampsByMember[currentMember.memberId] ||= []).push(sourceTimestamp);
      }
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
    countsByStyle,
    timestampsByMember,
    incompleteRowCount
  };
}
