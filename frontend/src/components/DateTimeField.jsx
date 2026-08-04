import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toLocalInputValue } from '../utils/datetime';

/**
 * Picking a date and a time, written the way this app writes them: DD/MM/YYYY
 * on a 24-hour clock.
 *
 * This exists because `<input type="datetime-local">` cannot be told what
 * format to show. The browser renders it in its own locale — the same stored
 * game reads as 08/04/2026, 7:30 PM on one laptop and 04/08/2026, 19:30 on
 * another — and neither the page's `lang` attribute nor CSS has any say in it.
 * The only way to fix the format is to stop using the native control.
 *
 * For the same reason the time is a list rather than `showTimeInput`: that
 * option renders an `<input type="time">`, which is the native control again
 * and brings AM/PM back with it. The list is drawn by the picker itself, so
 * `timeFormat` actually holds.
 *
 * The value is a local wall-clock string ("2026-08-04T19:30") — unchanged from
 * what the native input produced, so the forms around this and everything they
 * hand to the API stayed as they were.
 *
 * @param {String} value - local wall-clock string, or '' for empty
 * @param {Function} onChange - receives the same, '' if the field is cleared
 */
function DateTimeField({ value, onChange, id }) {
  // The string is local wall clock, which is how `new Date` reads it back.
  const selected = value ? new Date(value) : null;

  return (
    <DatePicker
      id={id}
      selected={selected && !Number.isNaN(selected.getTime()) ? selected : null}
      onChange={(date) => onChange(date ? toLocalInputValue(date) : '')}
      // Typed as well as clicked: the format below is what it parses too, so
      // "04/08/2026 19:30" can just be typed in.
      dateFormat="dd/MM/yyyy HH:mm"
      placeholderText="dd/mm/yyyy hh:mm"
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      timeCaption="Time"
      // Weeks start on Monday here, as they do on every Norwegian calendar.
      calendarStartDay={1}
      className="date-picker-input"
    />
  );
}

export default DateTimeField;
