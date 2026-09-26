// When alarms and reminders fire, as the device stores it: hour, minute,
// days (bit0 Mon .. bit6 Sun; 0 = once) and at (epoch seconds of a fixed
// one-time fire; 0 = the next hour:minute). The device works out next_fire.

import { pad2 } from './format';

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const EVERY_DAY = 0x7f;
export const WEEKDAYS = 0x1f;
export const WEEKENDS = 0x60;

export function daysLabel(days) {
  if (!days) return 'Once';
  if (days === EVERY_DAY) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  if (days === WEEKENDS) return 'Weekends';
  return DAY_NAMES.filter((_, i) => days & (1 << i)).join(', ');
}

export const timeOf = (item) => `${pad2(item.hour)}:${pad2(item.minute)}`;

export function parseTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

// YYYY-MM-DD of an epoch, local time (for <input type="date">).
export function dateOf(epoch) {
  const d = new Date(epoch * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Epoch of a date and HH:MM in this browser's timezone.
export const epochOf = (date, time) => Math.floor(new Date(`${date}T${time}`).getTime() / 1000);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// "Today 08:00", "Tomorrow 08:00", "Sat 08:00" (this week), "Sat 4 Oct 08:00".
export function formatWhen(epoch, nowS = Date.now() / 1000) {
  const d = new Date(epoch * 1000);
  const days = Math.round((startOfDay(d) - startOfDay(new Date(nowS * 1000))) / 86400000);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (days === 0) return `Today ${hm}`;
  if (days === 1) return `Tomorrow ${hm}`;
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  if (days > 1 && days < 7) return `${weekday} ${hm}`;
  return `${weekday} ${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })} ${hm}`;
}

// "in 3 min", "in 2 h 5 min", "in 3 days".
export function formatUntil(seconds) {
  if (seconds < 60) return 'in under a minute';
  const min = Math.round(seconds / 60);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}

// "4:05" or "1:02:03".
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}
