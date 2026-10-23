import { Ctx } from '../ports';
import { withScriptLock } from '../db/lock';

const PROP_KEY = 'DANCER_ISOLATION_V2';
const CACHE_KEY = 'mig:di2';
const CACHE_TTL_SEC = 6 * 3600;
const ACTOR = 'migration';

/**
 * Ensures strict dancer isolation for Chan Da Hui and test dancers:
 * 1. Testing1 is remapped to TEST9001.
 * 2. Testing2 is remapped to TEST9002.
 * 3. Matric 23005147 belongs exclusively to Chan Da Hui.
 * 4. Stale cache and index entries are purged.
 */
export function ensureDancerIsolation(ctx: Ctx): boolean {
  if (ctx.cache.get(CACHE_KEY)) return false;
  if (ctx.props.get(PROP_KEY) === 'done') {
    ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
    return false;
  }

  return withScriptLock(ctx.lock, () => {
    if (ctx.props.get(PROP_KEY) === 'done') {
      ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
      return false;
    }

    const allMembers = ctx.db.memberIndex.find(m => m.active);
    const test1OnConflict = allMembers.find(
      m => (/^testing\s*1$/i.test(m.fullName) || m.nameKey === 'testing1') && m.matricKey !== 'TEST9001'
    );
    const test2OnConflict = allMembers.find(
      m => (/^testing\s*2$/i.test(m.fullName) || m.nameKey === 'testing2') && m.matricKey !== 'TEST9002'
    );
    const huiRow = allMembers.find(m => m.matricKey === '23005147');
    const huiNeedsFix = huiRow && huiRow.fullName.toLowerCase() !== 'chan da hui';
    const huiMissing = test1OnConflict && !huiRow;

    if (!test1OnConflict && !test2OnConflict && !huiNeedsFix && !huiMissing) {
      ctx.props.set(PROP_KEY, 'done');
      ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
      return false;
    }

    const now = ctx.now();
    let wrote = false;

    // Track active event IDs and styles
    const activeEvents = ctx.db.events.find(e => e.active).map(e => e.id);
    const defaultEvents = activeEvents.length > 0 ? activeEvents : ['evt_VbUwUkf6G0', 'evt_HChF4kalQF'];
    const inheritedEvents = (huiRow?.eventIds && huiRow.eventIds.length > 0)
      ? huiRow.eventIds
      : (test1OnConflict?.eventIds && test1OnConflict.eventIds.length > 0 ? test1OnConflict.eventIds : defaultEvents);
    const inheritedStyles = huiRow?.eventStyles || test1OnConflict?.eventStyles || {};

    // 1. Ensure Chan Da Hui owns matric 23005147
    if (huiRow) {
      if (huiRow.fullName.toLowerCase() !== 'chan da hui') {
        ctx.db.memberIndex.update(
          huiRow.id,
          huiRow.version,
          { fullName: 'Chan Da Hui', nameKey: 'chandahui', active: true },
          ACTOR,
          now
        );
        wrote = true;
      }
    } else {
      ctx.db.memberIndex.insert(
        {
          id: 'M-23005147',
          matricKey: '23005147',
          nameKey: 'chandahui',
          fullName: 'Chan Da Hui',
          eventIds: inheritedEvents,
          eventStyles: inheritedStyles,
          lastEventEnd: '2026-11-06',
          active: true
        } as any,
        ACTOR,
        now
      );
      wrote = true;
    }

    // 2. Ensure Testing1 has its own separate row on TEST9001
    const test1Entry = ctx.db.memberIndex.find(m => m.matricKey === 'TEST9001')[0];
    if (!test1Entry) {
      ctx.db.memberIndex.insert(
        {
          id: 'M-TEST9001',
          matricKey: 'TEST9001',
          nameKey: 'testing1',
          fullName: 'TESTING1',
          eventIds: inheritedEvents,
          eventStyles: inheritedStyles,
          lastEventEnd: '2026-11-06',
          active: true
        } as any,
        ACTOR,
        now
      );
      wrote = true;
    } else if (!test1Entry.active) {
      ctx.db.memberIndex.update(test1Entry.id, test1Entry.version, { active: true }, ACTOR, now);
      wrote = true;
    }

    // 3. Ensure Testing2 has its own separate row on TEST9002
    const test2Entry = ctx.db.memberIndex.find(m => m.matricKey === 'TEST9002')[0];
    if (!test2Entry) {
      ctx.db.memberIndex.insert(
        {
          id: 'M-TEST9002',
          matricKey: 'TEST9002',
          nameKey: 'testing2',
          fullName: 'TESTING2',
          eventIds: inheritedEvents,
          eventStyles: inheritedStyles,
          lastEventEnd: '2026-11-06',
          active: true
        } as any,
        ACTOR,
        now
      );
      wrote = true;
    } else if (!test2Entry.active) {
      ctx.db.memberIndex.update(test2Entry.id, test2Entry.version, { active: true }, ACTOR, now);
      wrote = true;
    }

    // Deactivate any legacy Testing2 entry on 23005148 if present
    const oldTest2On48 = ctx.db.memberIndex.find(
      m => m.matricKey === '23005148' && /^testing\s*2$/i.test(m.fullName) && m.active
    )[0];
    if (oldTest2On48) {
      ctx.db.memberIndex.update(oldTest2On48.id, oldTest2On48.version, { active: false }, ACTOR, now);
      wrote = true;
    }

    // 4. Purge stale caches
    ctx.cache.remove('mi:23005147');
    ctx.cache.remove('mi:23005148');
    ctx.cache.remove('mi:TEST9001');
    ctx.cache.remove('mi:TEST9002');
    ctx.cache.remove('mi:M-23005147');
    ctx.cache.remove('mi:M-23005148');
    ctx.cache.remove('mi:M-TEST9001');
    ctx.cache.remove('mi:M-TEST9002');

    ctx.props.set(PROP_KEY, 'done');
    ctx.cache.put(CACHE_KEY, '1', CACHE_TTL_SEC);
    if (wrote) {
      ctx.props.set('DATA_VERSION', String(Number(ctx.props.get('DATA_VERSION') || 1) + 1));
    }
    return wrote;
  });
}
