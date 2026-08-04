import {
  toLocalInputValue,
  fromLocalInputValue,
  formatDate,
  formatDateTime,
  parseDate,
  toDateOnly,
} from './datetime';

// The suite runs pinned to Europe/Oslo — see the `test` script in package.json,
// which is where it has to be: TZ must be in the environment before Node starts,
// because jsdom's Date reads it once and a later `process.env.TZ = ...` does not
// reach it.
//
// The pin matters because timezone bugs in date handling are invisible in UTC. A
// value that shifts by a couple of hours still lands on the same calendar day, so
// a suite running at UTC+0 is testing the one offset where these functions cannot
// be wrong — which is not the offset anybody plays this game in.

describe('toLocalInputValue', () => {
  test('a date becomes the local wall clock, to the minute', () => {
    // Constructed from local parts, so this test says the same thing in every
    // timezone the suite might run in.
    expect(toLocalInputValue(new Date(2026, 7, 4, 19, 30))).toBe('2026-08-04T19:30');
  });

  test('single-digit parts are padded', () => {
    expect(toLocalInputValue(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02T03:04');
  });

  test('a stored date string is accepted as well as a Date', () => {
    const iso = new Date(2026, 7, 4, 19, 30).toISOString();
    expect(toLocalInputValue(iso)).toBe('2026-08-04T19:30');
  });

  test('an unusable value gives an empty field rather than "NaN"', () => {
    expect(toLocalInputValue('not a date')).toBe('');
  });
});

describe('fromLocalInputValue', () => {
  test('the typed wall clock is the instant that gets sent', () => {
    const sent = fromLocalInputValue('2026-08-04T19:30');

    expect(new Date(sent).getTime()).toBe(new Date(2026, 7, 4, 19, 30).getTime());
  });

  test('an empty field is null, not an invalid date', () => {
    // The backend reads null as "stamp it with now", which is the honest
    // record if the field was cleared.
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue(null)).toBeNull();
  });

  test('an unparseable value is null rather than an exception', () => {
    expect(fromLocalInputValue('yesterday')).toBeNull();
  });

  test('a round trip through the input leaves the minute unchanged', () => {
    const original = new Date(2025, 11, 31, 23, 59);
    const roundTripped = new Date(fromLocalInputValue(toLocalInputValue(original)));

    expect(roundTripped.getFullYear()).toBe(2025);
    expect(roundTripped.getMonth()).toBe(11);
    expect(roundTripped.getDate()).toBe(31);
    expect(roundTripped.getHours()).toBe(23);
    expect(roundTripped.getMinutes()).toBe(59);
  });
});

describe('formatDateTime', () => {
  test('it reads as a European date and a 24-hour clock', () => {
    expect(formatDateTime(new Date(2026, 7, 4, 19, 30).toISOString()))
      // Tolerant of the separator: some ICU builds use a narrow space.
      .toMatch(/^04\/08\/2026,\s*19:30$/);
  });

  test('an evening reads 19:30, never 7:30 PM', () => {
    expect(formatDateTime(new Date(2026, 7, 4, 19, 30))).not.toMatch(/[AP]M/i);
  });

  test('midnight is 00:00 rather than 24:00 or 12:00 AM', () => {
    expect(formatDateTime(new Date(2026, 7, 4, 0, 0))).toMatch(/^04\/08\/2026,\s*00:00$/);
  });

  test('the day comes before the month, including when both could be a day', () => {
    // 04/08 is the one that proves it: 08/04 would be the American reading of
    // the same instant, and nothing in the string says which you are looking at.
    expect(formatDateTime(new Date(2026, 7, 4, 12, 0))).toMatch(/^04\/08\/2026/);
  });

  test('a missing date is blank, not "Invalid Date"', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('whenever')).toBe('');
  });
});

describe('formatDate', () => {
  test('a day is DD/MM/YYYY', () => {
    expect(formatDate('1990-05-12')).toBe('12/05/1990');
  });

  test('single-digit days and months are padded', () => {
    expect(formatDate('2026-01-02')).toBe('02/01/2026');
  });

  test('a date-only value is the day it says, not the day before', () => {
    // "1990-05-12" parses as UTC midnight. Formatted through a local clock west
    // of Greenwich that is the 11th — a birthday that changes depending on who
    // is looking at it.
    expect(formatDate('1990-05-12')).not.toBe('11/05/1990');
  });

  test('an instant is formatted as the local day it falls on', () => {
    expect(formatDate(new Date(2026, 7, 4, 23, 59))).toBe('04/08/2026');
  });

  test('a missing date is blank', () => {
    expect(formatDate(null)).toBe('');
  });
});

describe('toDateOnly', () => {
  test('a picked day is stored as that day', () => {
    expect(toDateOnly(new Date(1990, 4, 12))).toBe('1990-05-12');
  });

  test('local midnight is not stored as the previous day', () => {
    // The bug this replaced: the picker hands back local midnight, and the old
    // `toISOString().split('T')[0]` turned that into 22:00 the day before in
    // Oslo, so choosing the 12th saved the 11th. Asserting the old expression's
    // output directly would only hold where the suite is pinned, so what is
    // checked is the answer, which is right in every timezone.
    expect(toDateOnly(new Date(1990, 4, 12))).toBe('1990-05-12');
  });

  test('the first of a month does not slip into the previous month', () => {
    expect(toDateOnly(new Date(2026, 7, 1))).toBe('2026-08-01');
  });

  test('no date is null, which is what the API reads as "not given"', () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeNull();
  });
});

describe('parseDate', () => {
  test('a date-only string lands on local midnight of that day', () => {
    const parsed = parseDate('1990-05-12');

    expect(parsed.getFullYear()).toBe(1990);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(12);
    expect(parsed.getHours()).toBe(0);
  });

  test('a full instant keeps its time', () => {
    const parsed = parseDate(new Date(2026, 7, 4, 19, 30).toISOString());

    expect(parsed.getHours()).toBe(19);
    expect(parsed.getMinutes()).toBe(30);
  });

  test('a Date is handed back unchanged', () => {
    const date = new Date(2026, 7, 4);
    expect(parseDate(date)).toBe(date);
  });

  test('a round trip through storage keeps the day', () => {
    // Reading a stored birthdate into the picker and saving it again must not
    // walk it backwards one day per edit.
    expect(toDateOnly(parseDate('1990-05-12'))).toBe('1990-05-12');
  });
});
