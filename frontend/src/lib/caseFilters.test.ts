import { describe, expect, it } from 'vitest';
import { createdOn, createdSince, hasHighGradeScore, startOfWeek } from './caseFilters';

/**
 * These two filters were decorative chips that filtered nothing, so nothing has
 * ever exercised this logic. The week boundary and the "no score is unknown,
 * not low grade" rule are the parts worth pinning.
 */

describe('hasHighGradeScore', () => {
  it('matches a case whose confirmed score reaches 7', () => {
    expect(hasHighGradeScore({ primary: 4, secondary: 3 })).toBe(true);
    expect(hasHighGradeScore({ primary: 5, secondary: 5 })).toBe(true);
  });

  it('excludes a confirmed score below 7', () => {
    expect(hasHighGradeScore({ primary: 3, secondary: 3 })).toBe(false);
  });

  it('excludes an unscored case rather than treating it as low grade', () => {
    // No confirmed review means the grade is unknown. Counting it as "< 7"
    // would quietly assert something nobody has determined.
    expect(hasHighGradeScore({ primary: null, secondary: null })).toBe(false);
    expect(hasHighGradeScore({ primary: 4, secondary: null })).toBe(false);
  });
});

describe('startOfWeek', () => {
  it('starts the week on Monday, not Sunday', () => {
    // 2026-08-08 is a Saturday.
    expect(startOfWeek(new Date(2026, 7, 8)).getDate()).toBe(3); // Monday 3 Aug
  });

  it('treats Monday itself as the start of its own week', () => {
    const monday = new Date(2026, 7, 3);
    expect(startOfWeek(monday).getTime()).toBe(new Date(2026, 7, 3).getTime());
  });

  it('puts Sunday at the end of the week that began six days earlier', () => {
    // The off-by-one that a Sunday-start calculation gets wrong: 9 Aug 2026 is
    // a Sunday and belongs to the week starting 3 Aug, not 10 Aug.
    expect(startOfWeek(new Date(2026, 7, 9)).getDate()).toBe(3);
  });

  it('is midnight, so a case created earlier the same day still counts', () => {
    const start = startOfWeek(new Date(2026, 7, 5, 14, 30));
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
  });
});

describe('createdOn', () => {
  it('reads the dd/mm/yyyy the list already displays', () => {
    const d = createdOn({ ngayTao: '28/07/2026' })!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 28]);
  });

  it('returns null rather than an Invalid Date for an unparseable value', () => {
    expect(createdOn({ ngayTao: '' })).toBeNull();
    expect(createdOn({ ngayTao: '2026-07-28' })).toBeNull();
  });
});

describe('createdSince', () => {
  const weekStart = new Date(2026, 7, 3);

  it('includes a case created during the week', () => {
    expect(createdSince({ ngayTao: '05/08/2026' }, weekStart)).toBe(true);
  });

  it('includes a case created on the boundary day itself', () => {
    expect(createdSince({ ngayTao: '03/08/2026' }, weekStart)).toBe(true);
  });

  it('excludes a case from before the week', () => {
    expect(createdSince({ ngayTao: '28/07/2026' }, weekStart)).toBe(false);
  });

  it('excludes a case whose date could not be read', () => {
    expect(createdSince({ ngayTao: 'không rõ' }, weekStart)).toBe(false);
  });
});
