import { useEffect, useState } from 'react';
import { usePoll } from './usePoll';
import { getTime } from '../lib/api';

// The device clock (/api/time), polled every minute, plus a ticking `now`
// (epoch seconds) that follows the device clock rather than this computer's.
// `tzMismatch` is set when the device's local time differs from this
// browser's, since the dashboard shows times in the browser's timezone.
export function useDeviceClock(tickMs = 1000) {
  const { data, error, refresh } = usePoll(async () => {
    const t = await getTime();
    return { ...t, offset: t.epoch - Date.now() / 1000 };
  }, 60000);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!tickMs) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  const now = nowMs / 1000 + (data?.offset || 0);
  let tzMismatch = false;
  if (data?.valid && data.local) {
    const deviceLocal = new Date(data.local.replace(' ', 'T')).getTime() / 1000;
    tzMismatch = Math.abs(deviceLocal - data.epoch) > 120;
  }
  return { time: data, error, refresh, now, tzMismatch };
}
