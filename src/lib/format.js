export function formatClock(ms) {
  if (!ms || Number.isNaN(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const formatSeconds = (sec) => (sec ? formatClock(sec * 1000) : '--:--');

export function formatBytes(bytes) {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatUptime(sec) {
  if (!sec) return '--';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export const pad2 = (n) => n.toString().padStart(2, '0');

// Minutes until an alarm at hour:minute next fires (0..1439).
export function minutesUntil(hour, minute, now = new Date()) {
  const diff = hour * 60 + minute - (now.getHours() * 60 + now.getMinutes());
  return diff <= 0 ? diff + 1440 : diff;
}

export function formatIn(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `in ${m} min`;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

export function signalLabel(rssi) {
  if (!rssi) return 'No signal';
  if (rssi >= -55) return 'Excellent';
  if (rssi >= -67) return 'Good';
  if (rssi >= -75) return 'Fair';
  return 'Weak';
}
