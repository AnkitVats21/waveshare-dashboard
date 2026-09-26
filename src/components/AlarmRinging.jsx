import React, { useState } from 'react';
import { AlarmClockOff, BellRing } from 'lucide-react';
import { Banner, Button } from './ui';
import { snoozeAlarm, stopAlarm } from '../lib/api';
import { pad2 } from '../lib/format';
import { useToast } from './Toast';

// Shown on every page while an alarm rings or is snoozed.
// alarm: the WebSocket snapshot's {state, id, snooze_until?, builtin_tone}.
export default function AlarmRinging({ alarm }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = (fn, what) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(`Couldn't ${what} the alarm: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const stop = <Button variant="primary" busy={busy} onClick={act(stopAlarm, 'stop')}>Stop</Button>;

  if (alarm.state === 'snoozed') {
    const until = alarm.snooze_until ? new Date(alarm.snooze_until * 1000) : null;
    return (
      <Banner tone="info" icon={AlarmClockOff} action={stop}>
        Alarm snoozed{until ? `, rings again at ${pad2(until.getHours())}:${pad2(until.getMinutes())}` : ''}.
      </Banner>
    );
  }
  return (
    <Banner
      tone="warn"
      icon={BellRing}
      action={
        <div className="banner-actions">
          <Button busy={busy} onClick={act(snoozeAlarm, 'snooze')}>Snooze</Button>
          {stop}
        </div>
      }
    >
      {alarm.id ? 'An alarm is ringing.' : 'Test ring.'}
    </Banner>
  );
}
