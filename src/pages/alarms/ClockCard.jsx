import React, { useState } from 'react';
import { Clock, RefreshCw, Settings2, TriangleAlert } from 'lucide-react';
import { Banner, Button, Card, Field, IconButton } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { setTime, syncTime } from '../../lib/api';
import { pad2 } from '../../lib/format';
import { formatUntil } from '../../lib/schedule';

const SOURCES = { ntp: 'synced from the internet', manual: 'set by hand', none: 'not set' };

function ago(epoch, now) {
  return formatUntil(now - epoch).replace(/^in /, '') + ' ago';
}

// The device clock that alarms follow: time, timezone and how it was set.
export default function ClockCard({ clock }) {
  const toast = useToast();
  const { time, now, tzMismatch, refresh } = clock;
  const [open, setOpen] = useState(false);
  const [tz, setTz] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sync = () => act(async () => {
    await syncTime();
    // The sync runs on the device; give it a moment before reading back.
    await new Promise((r) => setTimeout(r, 3000));
  }, 'Clock sync started');
  const setFromBrowser = () =>
    act(() => setTime(Math.round(Date.now() / 1000), tz.trim() || undefined), 'Clock set from this computer');

  if (!time) {
    return (
      <Card className="clock-card">
        <div className="clock-row"><Clock size={16} /><span className="muted small">Reading the device clock...</span></div>
      </Card>
    );
  }

  const d = new Date(now * 1000);
  return (
    <Card className="clock-card">
      <div className="clock-row">
        <Clock size={16} />
        <span className="mono clock-time">{time.valid ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : '--:--:--'}</span>
        <span className="muted small clock-meta">
          {time.timezone || 'UTC'} · {SOURCES[time.source] || time.source}
          {time.last_ntp_sync ? `, ${ago(time.last_ntp_sync, now)}` : ''}
          {time.ntp?.syncing ? ' · syncing...' : ''}
        </span>
        <IconButton icon={RefreshCw} label="Sync with the internet now" onClick={sync} disabled={busy} />
        <IconButton icon={Settings2} label="Clock settings" active={open} onClick={() => setOpen(!open)} />
      </div>
      {!time.valid && (
        <Banner tone="warn" icon={TriangleAlert}>The device clock isn't set, so alarms and reminders wait. Sync it or set it from this computer.</Banner>
      )}
      {tzMismatch && (
        <Banner tone="warn" icon={TriangleAlert}>
          The device's time zone differs from this computer's (device local time {time.local}). Times here are shown in this computer's time zone.
        </Banner>
      )}
      {open && (
        <div className="clock-settings">
          <Field label="Time zone" hint={'POSIX format, e.g. "IST-5:30" or "CET-1CEST,M3.5.0,M10.5.0/3". Empty keeps the current one.'}>
            <input className="mono" value={tz} placeholder={time.timezone} onChange={(e) => setTz(e.target.value)} />
          </Field>
          <Button onClick={setFromBrowser} busy={busy}>Set time from this computer</Button>
        </div>
      )}
    </Card>
  );
}
