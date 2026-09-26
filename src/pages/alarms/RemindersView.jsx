import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { BellRing, Check, Pencil, Plus, Save, StickyNote, Trash2, X } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton, Pill, Switch } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ackReminder, deleteReminder, saveReminder } from '../../lib/api';
import { daysLabel, formatUntil, formatWhen, timeOf } from '../../lib/schedule';
import { WhenFields, whenFromItem, whenToFields } from './WhenFields';

const MAX_TEXT = 200;   // AlarmService::MAX_REMINDER_TEXT

const blank = () => ({ id: 0, text: '', when: { time: '09:00', days: 0, date: '' } });

function ReminderForm({ initial, now, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const editing = form.id > 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveReminder({
        ...(editing ? { id: form.id } : {}),
        ...whenToFields(form.when, now),
        text: form.text.trim(),
        enabled: true,
      });
      toast(saved.next_fire ? `Reminder set for ${formatWhen(saved.next_fire, now)}` : 'Reminder saved');
      onSaved();
    } catch (err) {
      toast(`Couldn't save the reminder: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={editing ? 'Edit reminder' : 'New reminder'} icon={editing ? Pencil : Plus}>
      <form className="stack" onSubmit={submit}>
        <Field label="Remind me to" hint={`${form.text.length}/${MAX_TEXT}. The assistant says it when it's due.`}>
          <textarea
            rows={2}
            required
            maxLength={MAX_TEXT}
            value={form.text}
            placeholder="take the bins out"
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </Field>
        <WhenFields value={form.when} onChange={(when) => setForm({ ...form, when })} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon={editing ? Save : Plus} busy={busy}>{editing ? 'Save' : 'Add reminder'}</Button>
          {editing && <Button type="button" icon={X} onClick={onCancel}>Cancel</Button>}
        </div>
      </form>
    </Card>
  );
}

function ReminderRow({ reminder: r, now, active, onEdit, onToggle, onDelete, onAck }) {
  let next = r.last_fired && !r.days ? 'Done' : 'Off';
  if (r.enabled) next = r.next_fire ? `${formatWhen(r.next_fire, now)} · ${formatUntil(r.next_fire - now)}` : 'Already passed';
  const when = r.at ? formatWhen(r.at, now) : `${daysLabel(r.days)} at ${timeOf(r)}`;
  return (
    <div className={clsx('alarm', !r.enabled && !r.pending && 'is-off', active && 'is-selected')}>
      <div className="alarm-main">
        <span className="reminder-text">{r.text}</span>
        <span className="small">{when}</span>
        <span className="muted small">
          {r.pending ? <Pill tone="warn">Due, not heard yet</Pill> : next}
        </span>
      </div>
      <div className="alarm-actions">
        {r.pending && <Button size="sm" icon={Check} onClick={() => onAck(r)}>Got it</Button>}
        <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(r)} />
        <IconButton icon={Trash2} label="Delete" danger onClick={() => onDelete(r)} />
        <Switch checked={r.enabled} onChange={(on) => onToggle(r, on)} />
      </div>
    </div>
  );
}

export default function RemindersView({ reminders, now, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const initial = useMemo(() => (editing ? { id: editing.id, text: editing.text, when: whenFromItem(editing) } : blank()), [editing]);
  const list = reminders || [];
  const pending = list.filter((r) => r.pending);
  const rest = list
    .filter((r) => !r.pending)
    .sort((a, b) => (b.enabled - a.enabled) || ((a.next_fire || Infinity) - (b.next_fire || Infinity)));

  const run = async (fn, what) => {
    try {
      await fn();
      reload();
    } catch (err) {
      toast(`Couldn't ${what}: ${err.message}`, 'error');
    }
  };

  const rowProps = {
    now,
    onEdit: setEditing,
    onToggle: (r, enabled) => run(() => saveReminder({ id: r.id, enabled }), 'change the reminder'),
    onDelete: (r) => run(async () => {
      await deleteReminder(r.id);
      if (editing?.id === r.id) setEditing(null);
    }, 'delete'),
    onAck: (r) => run(() => ackReminder(r.id), 'acknowledge'),
  };

  return (
    <div className="alarms-grid">
      <ReminderForm
        initial={initial}
        now={now}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => setEditing(null)}
      />
      <div className="stack">
        {pending.length > 0 && (
          <Card title="Due" icon={BellRing} padded={false}>
            <div className="rows">
              {pending.map((r) => <ReminderRow key={r.id} reminder={r} active={editing?.id === r.id} {...rowProps} />)}
            </div>
          </Card>
        )}
        <Card title="Reminders" icon={StickyNote} padded={false}>
          {reminders === null ? (
            <div className="loading" />
          ) : rest.length === 0 ? (
            <Empty icon={StickyNote} title={pending.length ? 'Nothing else coming up' : 'No reminders'}>
              Add one here or say "remind me to call mum tomorrow at 6".
            </Empty>
          ) : (
            <div className="rows">
              {rest.map((r) => <ReminderRow key={r.id} reminder={r} active={editing?.id === r.id} {...rowProps} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
