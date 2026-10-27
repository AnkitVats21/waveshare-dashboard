import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2, UserRound, Users, X } from 'lucide-react';
import { Banner, Button, Card, Field, IconButton, Pill } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { activateProfile, deleteProfile, getProfiles, saveProfile } from '../../lib/api';
import { formatBytes } from '../../lib/format';

// Gemini Live prebuilt voices and their style.
export const VOICES = [
  ['Zephyr', 'Bright'], ['Puck', 'Upbeat'], ['Charon', 'Informative'], ['Kore', 'Firm'], ['Fenrir', 'Excitable'],
  ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'],
  ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'],
  ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'],
  ['Alnilam', 'Firm'], ['Schedar', 'Even'], ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'],
  ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm'],
];

const NAME_MAX = 32;
const EMPTY = { id: 0, name: '', voice: '', model: '', instructions: '' };
const formOf = (p) => ({ id: p.id, name: p.name || '', voice: p.voice || '', model: p.model || '', instructions: p.instructions || '' });
const sameProfile = (a, b) => ['name', 'voice', 'model', 'instructions'].every((k) => a[k] === b[k]);

// A model picker; the empty option is `emptyLabel` (the global model for a
// profile, the firmware default for the global setting).
export function ModelSelect({ value, onChange, models, emptyLabel }) {
  if (models.error) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={emptyLabel} spellCheck={false} />;
  }
  const savedInList = !value || (models.list && models.list.some((m) => m.name === value));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={models.loading && !models.list}>
      <option value="">{emptyLabel}</option>
      {models.list?.map((m) => (
        <option key={m.name} value={m.name}>{m.display_name || m.name}</option>
      ))}
      {!savedInList && value && <option value={value}>{value} (saved)</option>}
    </select>
  );
}

function ProfileRow({ p, active, selected, isDefault, onSelect, onActivate, onDelete }) {
  return (
    <div className={clsx('alarm', selected && 'is-selected')}>
      <button className="row-text" onClick={onSelect}>
        <span className="reminder-text">{p.name}</span>
        <span className="muted small">{p.voice || 'Default voice'}{p.model ? ` · ${p.model}` : ''}</span>
      </button>
      <div className="alarm-actions">
        {active ? (
          <Pill tone="ok">Active</Pill>
        ) : (
          <Button size="sm" icon={CheckCircle2} onClick={onActivate}>Activate</Button>
        )}
        {!isDefault && <IconButton icon={Trash2} label="Delete profile" danger onClick={onDelete} />}
      </div>
    </div>
  );
}

// Assistant profiles: personas with their own voice, instructions and
// (optionally) model. One is active; switch here or by voice ("switch to
// the yoga teacher"). Memory, skills and the Advanced settings are shared.
export default function Profiles({ models, defaults, globalModel, onActiveChange }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async (selectId) => {
    try {
      const res = await getProfiles();
      setData(res);
      setError(null);
      const want = selectId ?? form?.id ?? res.active;
      const p = res.profiles.find((x) => x.id === want) || res.profiles.find((x) => x.id === res.active);
      setForm(p ? formOf(p) : { ...EMPTY });
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  if (error) return <Card title="Profiles" icon={Users}><Banner tone="danger" icon={AlertTriangle}>{error}</Banner></Card>;
  if (!data || !form) return <Card title="Profiles" icon={Users}><div className="loading" /></Card>;

  const saved = data.profiles.find((p) => p.id === form.id);
  const dirty = saved ? !sameProfile(form, formOf(saved)) : !!(form.name || form.instructions || form.voice || form.model);
  const full = data.profiles.length >= data.max_profiles;
  const size = new Blob([form.instructions]).size;
  const tooBig = size > data.max_instructions;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const select = (p) => {
    if (dirty && !window.confirm('Discard the unsaved changes to this profile?')) return;
    setForm(p ? formOf(p) : { ...EMPTY });
  };

  const save = async () => {
    if (!form.name.trim()) return toast('Give the profile a name', 'error');
    setSaving(true);
    try {
      const body = { name: form.name.trim(), voice: form.voice, model: form.model.trim(), instructions: form.instructions };
      if (form.id) body.id = form.id;
      const res = await saveProfile(body);
      toast(form.id === data.active ? 'Saved. Applies to the next conversation.' : 'Profile saved');
      await load(res.id);
      if (form.id === data.active) onActiveChange?.();
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const activate = async (p) => {
    try {
      await activateProfile(p.id);
      toast(`${p.name} is active from the next conversation`);
      await load();
      onActiveChange?.();
    } catch (err) {
      toast(`Couldn't activate: ${err.message}`, 'error');
    }
  };

  const remove = async (p) => {
    const note = p.id === data.active ? ' It is active, so the default profile takes over.' : '';
    if (!window.confirm(`Delete the profile "${p.name}"?${note}`)) return;
    try {
      await deleteProfile(p.id);
      toast('Profile deleted');
      await load(form.id === p.id ? data.default_id : undefined);
      onActiveChange?.();
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, 'error');
    }
  };

  return (
    <div className="assistant-grid">
      <Card
        title="Profiles"
        icon={Users}
        padded={false}
        action={<Button size="sm" icon={Plus} disabled={full} onClick={() => select(null)}>New</Button>}
      >
        <p className="muted small profiles-intro">
          Each profile is a persona with its own voice and instructions. Switch here, or say
          “switch to the {data.profiles.find((p) => p.id !== data.active)?.name || 'yoga teacher'}”.
          Memory, skills and the Advanced settings are shared.
        </p>
        <div className="rows">
          {data.profiles.map((p) => (
            <ProfileRow
              key={p.id}
              p={p}
              active={p.id === data.active}
              selected={p.id === form.id}
              isDefault={p.id === data.default_id}
              onSelect={() => select(p)}
              onActivate={() => activate(p)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
        {full && <p className="muted small profiles-intro">At most {data.max_profiles} profiles.</p>}
      </Card>

      <Card title={form.id ? `Edit “${saved?.name || form.name}”` : 'New profile'} icon={UserRound}>
        <div className="stack">
          <div className="form-grid">
            <Field label="Name" hint="Say it to switch, so make it easy to say.">
              <input value={form.name} onChange={set('name')} maxLength={NAME_MAX} placeholder="e.g. Yoga teacher" />
            </Field>
            <Field label="Voice" hint={`Default: ${defaults.voice || 'built-in'}`}>
              <select value={form.voice} onChange={set('voice')}>
                <option value="">Default ({defaults.voice || 'built-in'})</option>
                {VOICES.map(([name, style]) => (
                  <option key={name} value={name}>{name} · {style}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Model" hint="Leave on the global model unless this persona needs another one.">
            <ModelSelect value={form.model} onChange={setValue('model')} models={models} emptyLabel={`Global model (${globalModel || 'built-in'})`} />
          </Field>
          <Field
            label="Personality & instructions"
            hint={
              <span className={clsx(tooBig && 'text-danger')}>
                Sent at the start of every conversation with this profile: tone, language, how brief to be. {formatBytes(size)} / 8 KB
              </span>
            }
          >
            <textarea
              rows={8}
              value={form.instructions}
              onChange={set('instructions')}
              placeholder="You are a calm yoga teacher. Guide me through poses step by step, and keep each answer short."
            />
          </Field>
          <div className="form-actions">
            {form.id === data.active && <span className="muted small">Active: changes start a new conversation.</span>}
            <Button icon={X} disabled={!dirty || saving} onClick={() => setForm(saved ? formOf(saved) : { ...EMPTY })}>Discard</Button>
            <Button variant="primary" icon={Save} busy={saving} disabled={!dirty || tooBig} onClick={save}>
              {form.id ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
