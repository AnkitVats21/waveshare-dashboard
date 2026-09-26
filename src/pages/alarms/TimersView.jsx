import React, { useState } from 'react';
import { Timer, Play, X } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { deleteAlarm, saveAlarm } from '../../lib/api';
import { formatCountdown, formatWhen } from '../../lib/schedule';

const QUICK_MIN = [1, 5, 10, 15, 30, 60];

// Timers are one-time alarms (kind "timer") at a fixed epoch; the device
// deletes them once they ring.
export default function TimersView({ alarms, now, reload }) {
  const toast = useToast();
  const [minutes, setMinutes] = useState(10);
  const [seconds, setSeconds] = useState(0);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const timers = (alarms || []).filter((a) => a.kind === 'timer').sort((a, b) => a.at - b.at);

  const start = async (totalS) => {
    if (totalS < 1) return;
    setBusy(true);
    try {
      await saveAlarm({ kind: 'timer', at: Math.round(now + totalS), label: label.trim() });
      setLabel('');
      reload();
    } catch (err) {
      toast(`Couldn't start the timer: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (t) => {
    try {
      await deleteAlarm(t.id);
      reload();
    } catch (err) {
      toast(`Couldn't cancel: ${err.message}`, 'error');
    }
  };

  const submit = (e) => {
    e.preventDefault();
    start(Number(minutes) * 60 + Number(seconds));
  };

  return (
    <div className="alarms-grid">
      <Card title="New timer" icon={Timer}>
        <form className="stack" onSubmit={submit}>
          <div className="chips">
            {QUICK_MIN.map((m) => (
              <button type="button" key={m} className="chip" disabled={busy} onClick={() => start(m * 60)}>
                {m < 60 ? `${m} min` : '1 h'}
              </button>
            ))}
          </div>
          <div className="two-fields">
            <Field label="Minutes">
              <input type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
            <Field label="Seconds">
              <input type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
            </Field>
          </div>
          <Field label="Label">
            <input value={label} maxLength={64} placeholder="Pasta" onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" icon={Play} busy={busy}>Start</Button>
        </form>
      </Card>
      <Card title="Running timers" icon={Timer} padded={false}>
        {alarms === null ? (
          <div className="loading" />
        ) : timers.length === 0 ? (
          <Empty icon={Timer} title="No timers">Start one here or say "set a timer for 10 minutes".</Empty>
        ) : (
          <div className="rows">
            {timers.map((t) => (
              <div className="alarm" key={t.id}>
                <div className="alarm-main">
                  <span className="alarm-time mono">{formatCountdown(t.at - now)}</span>
                  <span className="muted small">
                    {[t.label, `rings ${formatWhen(t.at, now).replace(/^Today /, 'at ')}`].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="alarm-actions">
                  <IconButton icon={X} label="Cancel timer" danger onClick={() => cancel(t)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
