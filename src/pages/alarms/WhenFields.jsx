import React from 'react';
import clsx from 'clsx';
import { Field } from '../../components/ui';
import { DAY_NAMES, EVERY_DAY, WEEKDAYS, WEEKENDS, daysLabel, dateOf, epochOf, parseTime, timeOf } from '../../lib/schedule';

const PRESETS = [
  { label: 'Once', days: 0 },
  { label: 'Every day', days: EVERY_DAY },
  { label: 'Weekdays', days: WEEKDAYS },
  { label: 'Weekends', days: WEEKENDS },
];

// Time, repeat days and, for a one-time item, an optional date.
// value: {time: 'HH:MM', days, date: 'YYYY-MM-DD' | ''}
export function WhenFields({ value, onChange }) {
  const set = (changes) => onChange({ ...value, ...changes });
  const toggleDay = (i) => set({ days: value.days ^ (1 << i) });
  return (
    <>
      <Field label="Time">
        <input type="time" className="time-input" value={value.time} onChange={(e) => set({ time: e.target.value })} required />
      </Field>
      <Field label="Repeat" hint={daysLabel(value.days)}>
        <div className="chips">
          {PRESETS.map((p) => (
            <button type="button" key={p.label} className={clsx('chip', value.days === p.days && 'is-active')} onClick={() => set({ days: p.days })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="day-picker">
          {DAY_NAMES.map((d, i) => (
            <button
              type="button"
              key={d}
              className={clsx('day', value.days & (1 << i) && 'is-active')}
              aria-pressed={!!(value.days & (1 << i))}
              onClick={() => toggleDay(i)}
            >
              {d.slice(0, 2)}
            </button>
          ))}
        </div>
      </Field>
      {value.days === 0 && (
        <Field label="Date" hint={value.date ? 'Clear it to use the next time this comes round.' : 'Empty: the next time this comes round.'}>
          <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      )}
    </>
  );
}

export const whenFromItem = (item) => ({
  time: timeOf(item),
  days: item.days || 0,
  date: item.at ? dateOf(item.at) : '',
});

// The {hour, minute, days, at} to send; throws if a fixed date is in the past.
export function whenToFields(when, nowS) {
  const { hour, minute } = parseTime(when.time);
  let at = 0;
  if (when.days === 0 && when.date) {
    at = epochOf(when.date, when.time);
    if (at <= nowS) throw new Error('That date and time has already passed');
  }
  return { hour, minute, days: when.days, at };
}
