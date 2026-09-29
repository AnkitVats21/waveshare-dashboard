import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlarmClock, Plus, Trash2, Pencil, Volume2, Save, X } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton, Pill, Segmented, Switch } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { deleteAlarm, getBriefingMusic, getLibrary, saveAlarm, stopAlarm, testRing } from '../../lib/api';
import { daysLabel, formatUntil, formatWhen, timeOf } from '../../lib/schedule';
import { needsResolution, resolveTrackInfo } from '../../lib/trackMetadata';
import { WhenFields, whenFromItem, whenToFields } from './WhenFields';
import { TonePicker, formatTone } from './TonePicker';
import BriefingMusicCard from './BriefingMusicCard';

const DEFAULT_VOLUME = 60;   // AlarmService::MIN_VOLUME: the floor when volume is 0

const blank = () => ({
  id: 0,
  when: { time: '07:00', days: 0x7f, date: '' },
  label: '',
  kind: 'alarm',
  briefing_start: 'after_stop',
  tone: 'builtin:classic',
  snooze_min: 9,
  volume: 0,
});

const fromAlarm = (a) => ({
  id: a.id,
  when: whenFromItem(a),
  label: a.label || '',
  kind: a.kind === 'briefing' ? 'briefing' : 'alarm',
  briefing_start: a.briefing_start === 'automatic' ? 'automatic' : 'after_stop',
  tone: a.tone || (a.kind === 'briefing' ? '' : 'builtin:classic'),
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
      const isBriefing = form.kind === 'briefing';
      const saved = await saveAlarm({
        ...(editing ? { id: form.id } : {}),
        ...whenToFields(form.when, now),
        label: form.label.trim(),
        kind: form.kind,
        ...(isBriefing ? { briefing_start: form.briefing_start || 'after_stop' } : {}),
        tone: isBriefing ? (form.tone.startsWith('file:') ? form.tone : '') : form.tone,
        snooze_min: Number(form.snooze_min) || 9,
        volume: Number(form.volume) || 0,
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
      // A briefing preview plays only its music: the briefing flags would
      // start a real briefing session on the device.
      let tone = form.tone;
      if (form.kind === 'briefing' && !tone.startsWith('file:')) {
        const { music } = await getBriefingMusic();
        tone = music ? `file:${music}` : 'builtin:rising';
      }
      await testRing(tone, 4);
      toast(form.kind === 'briefing' ? 'Playing briefing music for 4 s' : 'Playing tone preview for 4 s');
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
        <Field label="Alarm type">
          <Segmented
            value={form.kind}
            onChange={(kind) => {
              const newTone = kind === 'briefing'
                ? (form.tone.startsWith('file:') ? form.tone : '')
                : (form.tone === '' ? 'builtin:classic' : form.tone);
              set({ kind, tone: newTone });
            }}
            options={[
              { value: 'alarm', label: 'Alarm' },
              { value: 'briefing', label: 'Briefing' },
            ]}
          />
        </Field>
        {form.kind === 'briefing' && (
          <Field label="Briefing start">
            <div className="stack" style={{ gap: 8, marginTop: 4 }}>
              <label
                className={clsx('chip-toggle', (form.briefing_start || 'after_stop') === 'after_stop' && 'is-on')}
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '10px 14px', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="briefing_start"
                  value="after_stop"
                  checked={(form.briefing_start || 'after_stop') === 'after_stop'}
                  onChange={() => set({ briefing_start: 'after_stop' })}
                  style={{ margin: '0 8px 0 0' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <strong>After I stop it</strong>
                  <span className="muted small">Music rings until stopped, then the assistant speaks your morning briefing.</span>
                </div>
              </label>
              <label
                className={clsx('chip-toggle', form.briefing_start === 'automatic' && 'is-on')}
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '10px 14px', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="briefing_start"
                  value="automatic"
                  checked={form.briefing_start === 'automatic'}
                  onChange={() => set({ briefing_start: 'automatic' })}
                  style={{ margin: '0 8px 0 0' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <strong>Automatic</strong>
                  <span className="muted small">Briefing starts speaking immediately at alarm time over the background music.</span>
                </div>
              </label>
            </div>
          </Field>
        )}
        <Field label="Label">
          <input
            value={form.label}
            maxLength={64}
            placeholder={form.kind === 'briefing' ? 'Morning briefing' : 'Wake up'}
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>
        <Field
          label={form.kind === 'briefing' ? 'Music' : 'Tone'}
          action={
            <IconButton
              type="button"
              icon={Volume2}
              label={`Preview ${form.kind === 'briefing' ? 'music' : 'tone'} (rings for 4 s)`}
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
            isBriefing={form.kind === 'briefing'}
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
  const isBriefing = alarm.kind === 'briefing';
  const musicOrTone = formatTone(alarm.tone, songs, alarm.kind);
  const badge = isBriefing
    ? (alarm.briefing_start === 'automatic' ? 'Briefing · auto' : 'Briefing')
    : null;

  const details = [
    alarm.at ? formatWhen(alarm.at, now).replace(/ \d\d:\d\d$/, '') : daysLabel(alarm.days),
    alarm.label,
    musicOrTone,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="alarm-time mono">{timeOf(alarm)}</span>
          {badge && <Pill tone="accent">{badge}</Pill>}
        </div>
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
      <div className="stack" style={{ gap: 20 }}>
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
        <BriefingMusicCard />
      </div>
    </div>
  );
}
