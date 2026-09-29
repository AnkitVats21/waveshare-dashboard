import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { BellRing, Check, Pencil, Plus, Save, StickyNote, Trash2, X, Zap } from 'lucide-react';
import { Button, Card, Empty, Field, IconButton, Pill, Switch } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ackReminder, deleteReminder, saveReminder } from '../../lib/api';
import { daysLabel, formatUntil, formatWhen, timeOf } from '../../lib/schedule';
import { WhenFields, whenFromItem, whenToFields } from './WhenFields';

const MAX_TEXT = 200;   // AlarmService::MAX_REMINDER_TEXT

const blank = (action) => ({ id: 0, text: '', action, when: { time: '09:00', days: 0, date: '' } });

function ReminderForm({ initial, now, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const editing = form.id > 0;
  const isAction = Boolean(form.action);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveReminder({
        ...(editing ? { id: form.id } : {}),
        ...whenToFields(form.when, now),
        text: form.text.trim(),
        action: isAction,
        enabled: true,
      });
      const label = isAction ? 'Action' : 'Reminder';
      toast(saved.next_fire ? `${label} set for ${formatWhen(saved.next_fire, now)}` : `${label} saved`);
      onSaved();
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={editing ? (isAction ? 'Edit action' : 'Edit reminder') : (isAction ? 'New action' : 'New reminder')}
      icon={editing ? Pencil : Plus}
    >
      <form className="stack" onSubmit={submit}>
        <Field
          label={isAction ? 'Instruction' : 'Remind me to'}
          hint={`${form.text.length}/${MAX_TEXT}. ${isAction ? 'The assistant carries out the instruction when due.' : "The assistant says it when it's due."}`}
        >
          <textarea
            rows={2}
            required
            maxLength={MAX_TEXT}
            value={form.text}
            placeholder={isAction ? 'Play lofi music at volume 30' : 'Call the bank'}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </Field>
        <WhenFields value={form.when} onChange={(when) => setForm({ ...form, when })} />
        {isAction && (
          <p className="muted small">
            Runs through the assistant at that time; skipped if the device is offline. Routines: put the steps in a note called routines.
          </p>
        )}
        <div className="form-actions">
          <Button type="submit" variant="primary" icon={editing ? Save : Plus} busy={busy}>
            {editing ? 'Save' : isAction ? 'Add action' : 'Add reminder'}
          </Button>
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
  const isAction = Boolean(r.action);
  return (
    <div className={clsx('alarm', !r.enabled && !r.pending && 'is-off', active && 'is-selected')}>
      <div className="alarm-main">
        <span className="reminder-text">
          {r.text}
        </span>
        <span className="small">{when}</span>
        <span className="muted small">
          {!isAction && r.pending ? <Pill tone="warn">Due, not heard yet</Pill> : next}
        </span>
      </div>
      <div className="alarm-actions">
        {!isAction && r.pending && <Button size="sm" icon={Check} onClick={() => onAck(r)}>Got it</Button>}
        <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(r)} />
        <IconButton icon={Trash2} label="Delete" danger onClick={() => onDelete(r)} />
        <Switch checked={r.enabled} onChange={(on) => onToggle(r, on)} />
      </div>
    </div>
  );
}

// One view for both tabs: reminders (the device chimes and the assistant
// says them) and actions (the assistant carries them out). Both are stored
// as reminders; `action` tells them apart.
export default function RemindersView({ reminders, now, reload, actions = false }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const initial = useMemo(
    () => (editing ? { id: editing.id, text: editing.text, action: Boolean(editing.action), when: whenFromItem(editing) } : blank(actions)),
    [editing, actions]
  );
  const list = (reminders || []).filter((r) => Boolean(r.action) === actions);
  const pending = actions ? [] : list.filter((r) => r.pending);
  const rest = list
    .filter((r) => actions || !r.pending)
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
    onToggle: (r, enabled) => run(() => saveReminder({ id: r.id, enabled }), actions ? 'change the action' : 'change the reminder'),
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
        <Card title={actions ? 'Actions' : 'Reminders'} icon={actions ? Zap : StickyNote} padded={false}>
          {reminders === null ? (
            <div className="loading" />
          ) : rest.length === 0 ? (
            actions ? (
              <Empty icon={Zap} title="No actions">
                Add one here or say "play lofi music at 7 am tomorrow".
              </Empty>
            ) : (
              <Empty icon={StickyNote} title={pending.length ? 'Nothing else coming up' : 'No reminders'}>
                Add one here or say "remind me to call mum tomorrow at 6".
              </Empty>
            )
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
