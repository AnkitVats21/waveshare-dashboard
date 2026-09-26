import React, { useEffect, useState } from 'react';
import { AlarmClock, StickyNote, Timer } from 'lucide-react';
import { PageHeader, Segmented } from '../components/ui';
import { useNexus } from '../DeviceContext';
import { usePoll } from '../hooks/usePoll';
import { useDeviceClock } from '../hooks/useDeviceClock';
import { getAlarms, getReminders } from '../lib/api';
import AlarmsView from './alarms/AlarmsView';
import TimersView from './alarms/TimersView';
import RemindersView from './alarms/RemindersView';
import ClockCard from './alarms/ClockCard';

const SUBS = ['alarms', 'timers', 'reminders'];

const subFromHash = () => {
  const sub = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  return SUBS.includes(sub) ? sub : 'alarms';
};

export default function Alarms() {
  const [sub, setSub] = useState(subFromHash);
  const { snapshot } = useNexus();
  const clock = useDeviceClock();
  const alarms = usePoll(getAlarms, 15000);
  const reminders = usePoll(getReminders, 15000);
  const reloadAlarms = alarms.refresh;
  const reloadReminders = reminders.refresh;

  useEffect(() => {
    const onHash = () => setSub(subFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A ring changes the lists: one-time alarms switch off, timers go away,
  // and reminders that come due are pending.
  useEffect(() => {
    reloadAlarms();
    reloadReminders();
  }, [snapshot.alarm.state, reloadAlarms, reloadReminders]);

  // Reload shortly after a timer runs out, so it leaves the list.
  const timers = (alarms.data || []).filter((a) => a.kind === 'timer');
  const expired = timers.some((t) => t.at <= clock.now);
  useEffect(() => {
    if (!expired) return undefined;
    const id = setTimeout(reloadAlarms, 1500);
    return () => clearTimeout(id);
  }, [expired, reloadAlarms]);

  const change = (v) => {
    window.history.replaceState(null, '', `#/alarms/${v}`);
    setSub(v);
  };

  const pending = (reminders.data || []).filter((r) => r.pending).length;
  const alarmList = alarms.loading && !alarms.data ? null : alarms.data || [];
  const reminderList = reminders.loading && !reminders.data ? null : reminders.data || [];

  return (
    <>
      <PageHeader title="Alarms" subtitle="Alarms, timers and reminders. You can also ask the assistant.">
        <Segmented
          value={sub}
          onChange={change}
          options={[
            { value: 'alarms', label: 'Alarms', icon: AlarmClock },
            { value: 'timers', label: 'Timers', icon: Timer, badge: timers.length || null },
            { value: 'reminders', label: 'Reminders', icon: StickyNote, badge: pending || null },
          ]}
        />
      </PageHeader>
      <ClockCard clock={clock} />
      {sub === 'alarms' && <AlarmsView alarms={alarmList} now={clock.now} reload={reloadAlarms} />}
      {sub === 'timers' && <TimersView alarms={alarmList} now={clock.now} reload={reloadAlarms} />}
      {sub === 'reminders' && <RemindersView reminders={reminderList} now={clock.now} reload={reloadReminders} />}
    </>
  );
}
