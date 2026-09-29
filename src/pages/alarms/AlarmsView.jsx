import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlarmClock, Plus, Trash2, Pencil, Volume2, Save, X } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton, Switch } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { deleteAlarm, getLibrary, saveAlarm, stopAlarm, testRing } from '../../lib/api';
import { daysLabel, formatUntil, formatWhen, timeOf } from '../../lib/schedule';
import { needsResolution, resolveTrackInfo } from '../../lib/trackMetadata';
import { WhenFields, whenFromItem, whenToFields } from './WhenFields';
import { TonePicker, formatTone } from './TonePicker';

const DEFAULT_VOLUME = 60;   // AlarmService::MIN_VOLUME: the floor when volume is 0

const blank = () => ({
  id: 0,
  when: { time: '07:00', days: 0x7f, date: '' },
  label: '',
  tone: 'builtin:classic',
  briefing: false,
  snooze_min: 9,
  volume: 0,
});

const fromAlarm = (a) => ({
  id: a.id,
  when: whenFromItem(a),
  label: a.label || '',
  tone: a.tone || 'builtin:classic',
  briefing: !!a.briefing,
  snooze_min: a.snooze_min || 9,
  volume: a.volume || 0,
});

const byTitle = (a, b) => a.title.localeCompare(b.title);

// Library songs saved on the card; only those can ring offline.
function useTones() {
  const [songs, setSongs] = useState([]);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    getLibrary()
      .then(async (all) => {
        const saved = all.filter((t) => t.cached);
        if (cancelled) return;
        setSongs([...saved].sort(byTitle));
        const named = await Promise.all(
          saved.map(async (t) => {
            if (!needsResolution(t)) return t;
            const info = await resolveTrackInfo(t.id);
            return info ? { ...t, ...info } : { ...t, artist: '' };
          })
        );
        if (!cancelled) setSongs(named.sort(byTitle));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { songs, refreshSongs: refresh };
}

function AlarmForm({ initial, songs, onRefreshSongs, now, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const set = (changes) => setForm((f) => ({ ...f, ...changes }));
  const editing = form.id > 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveAlarm({
        ...(editing ? { id: form.id } : {}),
        ...whenToFields(form.when, now),
        label: form.label.trim(),
        tone: form.tone,
        briefing: !!form.briefing,
        snooze_min: Number(form.snooze_min) || 9,
        volume: Number(form.volume) || 0,
        kind: 'alarm',
        enabled: true,
      });
      toast(saved.next_fire ? `Alarm set for ${formatWhen(saved.next_fire, now)}` : 'Alarm saved');
      onSaved();
    } catch (err) {
      toast(`Couldn't save the alarm: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setTesting(true);
    try {
      await testRing(form.tone, 4);
      toast('Playing tone preview for 4 s');
      setTimeout(async () => {
        try {
          await stopAlarm();
        } catch {}
        setTesting(false);
      }, 4000);
    } catch (err) {
      toast(`Couldn't play preview: ${err.message}`, 'error');
      setTesting(false);
    }
  };

  return (
    <Card title={editing ? 'Edit alarm' : 'New alarm'} icon={editing ? Pencil : Plus}>
      <form className="stack" onSubmit={submit}>
        <WhenFields value={form.when} onChange={(when) => set({ when })} />
        <Field label="Label">
          <input
            value={form.label}
            maxLength={64}
            placeholder="Wake up"
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>
        <Field
          label="Tone"
          action={
            <IconButton
              type="button"
              icon={Volume2}
              label="Preview tone (rings for 4 s)"
              onClick={preview}
              disabled={testing}
            />
          }
        >
          <TonePicker
            value={form.tone}
            onChange={(tone) => set({ tone })}
            songs={songs}
            onRefreshLibrary={onRefreshSongs}
          />
        </Field>
        <Field
          label="Morning briefing"
          hint="After you stop the alarm, the assistant gives a short briefing: weather, today's schedule, headlines. Customize it with a note called briefing."
        >
          <Switch
            checked={!!form.briefing}
            onChange={(briefing) => set({ briefing })}
            label="Brief after stopping alarm"
          />
        </Field>
        <div className="two-fields">
          <Field label="Snooze (min)">
            <input
              type="number"
              min={1}
              max={60}
              value={form.snooze_min}
              onChange={(e) => set({ snooze_min: e.target.value })}
            />
          </Field>
          <Field
            label="Volume"
            hint={
              Number(form.volume)
                ? `at least ${form.volume}%`
                : `default, at least ${DEFAULT_VOLUME}%`
            }
          >
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.volume}
              onChange={(e) => set({ volume: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-actions">
          <Button type="submit" variant="primary" icon={editing ? Save : Plus} busy={busy}>
            {editing ? 'Save' : 'Add alarm'}
          </Button>
          {editing && (
            <Button type="button" icon={X} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function AlarmRow({ alarm, songs, now, active, onEdit, onToggle, onDelete }) {
  const details = [
    alarm.at ? formatWhen(alarm.at, now).replace(/ \d\d:\d\d$/, '') : daysLabel(alarm.days),
    alarm.label,
    formatTone(alarm.tone, songs),
    alarm.briefing ? 'Morning briefing' : null,
  ].filter(Boolean);
  let next = 'Off';
  if (alarm.enabled) {
    next = alarm.next_fire
      ? `${formatWhen(alarm.next_fire, now)} · ${formatUntil(alarm.next_fire - now)}`
      : 'Already passed';
  }
  return (
    <div className={clsx('alarm', !alarm.enabled && 'is-off', active && 'is-selected')}>
      <div className="alarm-main">
        <span className="alarm-time mono">{timeOf(alarm)}</span>
        <span className="small ellipsis">{details.join(' · ')}</span>
        <span className="muted small">{next}</span>
      </div>
      <div className="alarm-actions">
        <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(alarm)} />
        <IconButton icon={Trash2} label="Delete" danger onClick={() => onDelete(alarm)} />
        <Switch checked={alarm.enabled} onChange={(on) => onToggle(alarm, on)} />
      </div>
    </div>
  );
}

export default function AlarmsView({ alarms, now, reload }) {
  const toast = useToast();
  const { songs, refreshSongs } = useTones();
  const [editing, setEditing] = useState(null);
  const initial = useMemo(() => (editing ? fromAlarm(editing) : blank()), [editing]);
  const list = (alarms || []).filter((a) => a.kind !== 'timer');

  const toggle = async (alarm, enabled) => {
    try {
      await saveAlarm({ id: alarm.id, enabled });
      reload();
    } catch (err) {
      toast(`Couldn't change the alarm: ${err.message}`, 'error');
    }
  };

  const remove = async (alarm) => {
    try {
      await deleteAlarm(alarm.id);
      if (editing?.id === alarm.id) setEditing(null);
      reload();
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, 'error');
    }
  };

  return (
    <div className="alarms-grid">
      <AlarmForm
        initial={initial}
        songs={songs}
        onRefreshSongs={refreshSongs}
        now={now}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => setEditing(null)}
      />
      <Card title="Your alarms" icon={AlarmClock} padded={false}>
        {alarms === null ? (
          <div className="loading" />
        ) : list.length === 0 ? (
          <Empty icon={AlarmClock} title="No alarms">
            Add one here or say "wake me up at 7 on weekdays".
          </Empty>
        ) : (
          <div className="rows">
            {list.map((a) => (
              <AlarmRow
                key={a.id}
                alarm={a}
                songs={songs}
                now={now}
                active={editing?.id === a.id}
                onEdit={setEditing}
                onToggle={toggle}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
