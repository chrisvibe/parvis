/**
 * Dates, in the shapes this app needs them.
 *
 * A form's date field speaks a local wall-clock string with no zone
 * ("2026-08-04T19:30"). The API speaks ISO instants. Converting between them is
 * a one-liner in each direction, but the wrong one-liner is a silent hours-off
 * bug, so both live here rather than being re-improvised per form.
 *
 * Displaying is here for a different reason: the format is a decision, and it
 * has to be made once. Left to the browser, a date reads as 08/04/2026 for one
 * player and 04/08/2026 for another, and neither can tell which they are
 * looking at.
 */

/**
 * The locale everything shown in this app is formatted in.
 *
 * Not the browser's, on purpose — see above. Not `nb-NO` either, which writes
 * 4.8.2026 with dots and no padding; the format asked for is day/month/year in
 * slashes on a 24-hour clock, and that is exactly `en-GB`. Month and day names
 * are never printed, so the language of the locale never shows.
 */
const DISPLAY_LOCALE = 'en-GB';

const DATE_PARTS = { year: 'numeric', month: '2-digit', day: '2-digit' };

// `hour12: false` is redundant for en-GB, which is a 24-hour locale already,
// and it is here anyway: it is the thing being asked for, so it should be
// visible in the code rather than inherited from the choice of locale.
const TIME_PARTS = { hour: '2-digit', minute: '2-digit', hour12: false };

const pad = (value) => String(value).padStart(2, '0');

// A bare "1990-05-12" is defined to parse as UTC midnight, which is the day
// before in any timezone west of Greenwich — a birthday that shifts depending
// on who is reading it. Date-only values are therefore split by hand into local
// parts; anything with a time in it is a real instant and parses normally.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whatever the API sent, as a Date, without the date-only trap above. */
export const parseDate = (value) => {
  // `new Date(null)` is the epoch, not an error, so a nullable column with
  // nothing in it would otherwise format as 01/01/1970 — a date that looks
  // real enough to be believed.
  if (value === null || value === undefined || value === '') return new Date(NaN);

  if (value instanceof Date) return value;

  const dateOnly = typeof value === 'string' && value.match(DATE_ONLY);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
};

/**
 * A Date as the day it is, for a column that stores a day and not an instant.
 *
 * The obvious `date.toISOString().split('T')[0]` is wrong east of Greenwich:
 * a picker hands back local midnight, and in Norway that is 22:00 the previous
 * day in UTC, so a birthday of the 12th was being stored as the 11th. Reading
 * the local parts asks the calendar what day it is, which is the question.
 *
 * @returns {String|null} "YYYY-MM-DD", or null for no date
 */
export const toDateOnly = (date) => {
  if (!date) return null;

  const d = date instanceof Date ? date : parseDate(date);
  if (Number.isNaN(d.getTime())) return null;

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * A Date as the value a local wall-clock field expects: minute precision, no
 * zone suffix.
 */
export const toLocalInputValue = (date = new Date()) => {
  // `new Date(null)` is the epoch rather than an error, so a cleared field
  // would otherwise come back as 01/01/1970 instead of empty.
  if (date === null) return '';

  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A local wall-clock value as an ISO instant for the API.
 *
 * `new Date('2026-08-04T19:30')` is defined to read as local time, so the
 * conversion to UTC is the browser's own — which is what we want: the user
 * typed the time they played at, wherever they are.
 *
 * @returns {String|null} ISO string, or null for an empty or unparseable value
 */
export const fromLocalInputValue = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/** A stored date as DD/MM/YYYY. */
export const formatDate = (value) => {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(DISPLAY_LOCALE, DATE_PARTS);
};

/** A stored instant as DD/MM/YYYY, HH:mm. */
export const formatDateTime = (value) => {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(DISPLAY_LOCALE, { ...DATE_PARTS, ...TIME_PARTS });
};
