import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlarmClock, Plus, Trash2, Info, Pencil, Check, X } from 'lucide-react';
import { Banner, Button, Card, Empty, Field, IconButton, PageHeader, Switch } from '../components/ui';
import { useToast } from '../components/Toast';
import { ALARM_TONES_DIR, deleteAlarm, getAlarms, listFiles, saveAlarm } from '../lib/api';
import { formatIn, minutesUntil, pad2 } from '../lib/format';

const toneName = (path) => (path || '').split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
const toTimeValue = (a) => `${pad2(a.hour)}:${pad2(a.minute)}`;
const parseTime = (v) => {
  const [h, m] = v.split(':').map(Number);
  return { hour: h, minute: m };
};

function ToneSelect({ tones, value, onChange }) {
  const options = tones.includes(value) || !value ? tones : [value, ...tones];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.length === 0 && <option value="">Default tone</option>}
      {options.map((t) => <option key={t} value={t}>{toneName(t)}</option>)}
    </select>
  );
}

function AlarmRow({ alarm, tones, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(toTimeValue(alarm));
  const [tone, setTone] = useState(alarm.tone_file);

  useEffect(() => {
    setTime(toTimeValue(alarm));
    setTone(alarm.tone_file);
  }, [alarm]);

  const commit = async () => {
    await onSave({ ...alarm, ...parseTime(time), tone_file: tone });
    setEditing(false);
  };

  return (
    <div className={clsx('alarm', !alarm.enabled && 'is-off')}>
      {editing ? (
        <div className="alarm-edit">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          <ToneSelect tones={tones} value={tone} onChange={setTone} />
          <IconButton icon={Check} label="Save" onClick={commit} />
          <IconButton icon={X} label="Cancel" onClick={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <div className="alarm-main">
            <span className="alarm-time mono">{toTimeValue(alarm)}</span>
            <span className="muted small">
              {alarm.enabled ? formatIn(minutesUntil(alarm.hour, alarm.minute)) : 'Off'} · {toneName(alarm.tone_file) || 'default tone'}
            </span>
          </div>
          <div className="alarm-actions">
            <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(true)} />
            <IconButton icon={Trash2} label="Delete" danger onClick={() => onDelete(alarm)} />
            <Switch checked={alarm.enabled} onChange={(on) => onSave({ ...alarm, enabled: on })} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Alarms() {
  const toast = useToast();
  const [alarms, setAlarms] = useState(null);
  const [tones, setTones] = useState([]);
  const [time, setTime] = useState('07:00');
  const [tone, setTone] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      const list = await getAlarms();
      setAlarms([...(list || [])].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
    } catch (err) {
      toast(`Couldn't load alarms: ${err.message}`, 'error');
      setAlarms([]);
    }
  };

  useEffect(() => {
    load();
    listFiles(ALARM_TONES_DIR)
      .then((d) => {
        const wavs = (d?.entries || []).filter((e) => !e.is_dir && /\.wav$/i.test(e.name)).map((e) => `${ALARM_TONES_DIR}/${e.name}`);
        setTones(wavs);
        setTone((t) => t || wavs.find((w) => w.includes('soft_wake_up')) || wavs[0] || '');
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (alarm) => {
    try {
      await saveAlarm(alarm);
      await load();
    } catch (err) {
      toast(`Couldn't save the alarm: ${err.message}`, 'error');
    }
  };

  const add = async (e) => {
    e.preventDefault();
    setAdding(true);
    await save({ ...parseTime(time), tone_file: tone, enabled: true });
    toast(`Alarm set for ${time}`);
    setAdding(false);
  };

  const remove = async (alarm) => {
    try {
      await deleteAlarm(alarm.id);
      await load();
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Alarms" subtitle="Set wake-up alarms. You can also ask the assistant to set one." />
      <Banner tone="info" icon={Info}>
        Alarms are saved on the device, but ringing is switched off in the current firmware, so they won't sound yet.
      </Banner>
      <div className="alarms-grid">
        <Card title="New alarm" icon={Plus}>
          <form className="stack" onSubmit={add}>
            <Field label="Time">
              <input type="time" className="time-input" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Field>
            <Field label="Tone">
              <ToneSelect tones={tones} value={tone} onChange={setTone} />
            </Field>
            <Button type="submit" variant="primary" icon={Plus} busy={adding}>Add alarm</Button>
          </form>
        </Card>
        <Card title="Your alarms" icon={AlarmClock} padded={false}>
          {alarms === null ? (
            <div className="loading" />
          ) : alarms.length === 0 ? (
            <Empty icon={AlarmClock} title="No alarms">Add one here or say "set an alarm for 7 AM".</Empty>
          ) : (
            <div className="rows">
              {alarms.map((a) => <AlarmRow key={a.id} alarm={a} tones={tones} onSave={save} onDelete={remove} />)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
