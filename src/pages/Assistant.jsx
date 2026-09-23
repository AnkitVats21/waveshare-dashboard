import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Sparkles, Brain, StickyNote, KeyRound, AlertTriangle, Save, Trash2, ChevronDown, FileText, Info } from 'lucide-react';
import { Banner, Button, Card, Empty, Field, IconButton, PageHeader, Pill } from '../components/ui';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { ASSISTANT_STATES } from './Home';
import {
  MEMORY_FILE, NOTES_DIR, deleteFile, getAssistantConfig, listFiles, readTextFile, saveAssistantConfig, writeTextFile,
} from '../lib/api';
import { formatBytes } from '../lib/format';

// Gemini Live prebuilt voices and their style.
const VOICES = [
  ['Zephyr', 'Bright'], ['Puck', 'Upbeat'], ['Charon', 'Informative'], ['Kore', 'Firm'], ['Fenrir', 'Excitable'],
  ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'],
  ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'],
  ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'],
  ['Alnilam', 'Firm'], ['Schedar', 'Even'], ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'],
  ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm'],
];

const MEMORY_LIMIT = 16384;
const stripModelPrefix = (m) => (m || '').replace(/^models\//, '');

function Settings() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ voice: '', model: '', system_prompt: '' });
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    try {
      const cfg = await getAssistantConfig();
      setConfig(cfg);
      setForm({ voice: cfg.voice || '', model: stripModelPrefix(cfg.model), system_prompt: cfg.system_prompt || '' });
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const defaults = config?.defaults || {};
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      // Keep any other fields already in the file; drop the read-only extras.
      const { api_key_set, defaults: _d, config_error, ...rest } = config?.config_error ? {} : config || {};
      const body = { ...rest, voice: form.voice, model: form.model.trim(), system_prompt: form.system_prompt };
      for (const k of ['voice', 'model', 'system_prompt']) if (!body[k]) delete body[k];
      if (newKey.trim()) body.api_key = newKey.trim();
      await saveAssistantConfig(body);
      setNewKey('');
      toast('Saved. Applies to the next conversation.');
      load();
    } catch (err) {
      toast(`Couldn't save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <Card title="Voice & personality" icon={Sparkles}><Banner tone="danger" icon={AlertTriangle}>{loadError}</Banner></Card>;
  if (!config) return <Card title="Voice & personality" icon={Sparkles}><div className="loading" /></Card>;

  return (
    <Card title="Voice & personality" icon={Sparkles}>
      {config.config_error && (
        <Banner tone="warn" icon={AlertTriangle}>
          The settings file on the SD card is damaged, so the device is using its built-in settings.
          Saving here rewrites it and keeps your API key.
        </Banner>
      )}
      <div className="form-grid">
        <Field label="Voice" hint={`Default: ${defaults.voice || 'built-in'}`}>
          <select value={form.voice} onChange={set('voice')}>
            <option value="">Default ({defaults.voice || 'built-in'})</option>
            {VOICES.map(([name, style]) => (
              <option key={name} value={name}>{name} · {style}</option>
            ))}
          </select>
        </Field>
        <Field label="Model" hint="Leave empty for the default. Must be a Gemini Live model.">
          <input
            value={form.model}
            onChange={set('model')}
            placeholder={stripModelPrefix(defaults.model) || 'gemini live model'}
            spellCheck={false}
            list="model-options"
          />
          <datalist id="model-options">
            {defaults.model && <option value={stripModelPrefix(defaults.model)} />}
          </datalist>
        </Field>
      </div>
      <Field label="Personality & instructions" hint="Sent to the assistant at the start of every conversation, e.g. tone, language, how brief to be.">
        <textarea
          rows={5}
          value={form.system_prompt}
          onChange={set('system_prompt')}
          placeholder="You are Nexus, a friendly speaker assistant. Keep answers short. Reply in Hindi when I speak Hindi."
        />
      </Field>
      <Field label="Gemini API key" hint={config.api_key_set ? 'A key is saved on the SD card. It is never shown; type a new one to replace it.' : 'No key on the SD card; the key built into the firmware is used.'}>
        <div className="input-icon">
          <KeyRound size={16} />
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={config.api_key_set ? '•••••••• (saved)' : 'Paste a key to store it on the device'}
            autoComplete="off"
          />
        </div>
      </Field>
      <div className="form-actions">
        <span className="muted small"><Info size={14} /> Changes apply to the next conversation.</span>
        <Button variant="primary" icon={Save} busy={saving} onClick={save}>Save</Button>
      </div>
    </Card>
  );
}

function Memory() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const t = await readTextFile(MEMORY_FILE);
      setText(t);
      setOriginal(t);
    } catch {
      setText('');
      setOriginal('');
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (value) => {
    setSaving(true);
    try {
      await writeTextFile(MEMORY_FILE, value);
      setText(value);
      setOriginal(value);
      toast(value ? 'Memory saved' : 'Memory cleared');
    } catch (err) {
      toast(`Couldn't save memory: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const size = new Blob([text]).size;
  const dirty = text !== original;

  return (
    <Card
      title="Memory"
      icon={Brain}
      action={<span className={clsx('mono small', size > MEMORY_LIMIT ? 'text-danger' : 'muted')}>{formatBytes(size)} / 16 KB</span>}
    >
      <p className="muted small">
        Facts the assistant saved when you asked it to remember something. They're given to it at the start of every conversation.
      </p>
      {!loaded ? (
        <div className="loading" />
      ) : (
        <>
          <textarea className="mono-area" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nothing remembered yet." />
          <div className="form-actions">
            <Button
              icon={Trash2}
              disabled={!original || saving}
              onClick={() => window.confirm('Forget everything the assistant remembered?') && save('')}
            >
              Forget all
            </Button>
            <Button variant="primary" icon={Save} busy={saving} disabled={!dirty} onClick={() => save(text)}>Save</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function NoteItem({ file, onDelete }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(null);
  const toggle = async () => {
    setOpen((o) => !o);
    if (content === null) {
      try {
        setContent(await readTextFile(`${NOTES_DIR}/${file.name}`));
      } catch (err) {
        setContent(`Couldn't read this note: ${err.message}`);
      }
    }
  };
  return (
    <div className={clsx('note', open && 'is-open')}>
      <div className="row">
        <FileText size={16} className="muted" />
        <button className="row-text note-title" onClick={toggle}>
          <span className="ellipsis">{file.name}</span>
          <span className="muted small">{formatBytes(file.size)}</span>
        </button>
        <IconButton icon={ChevronDown} label={open ? 'Hide' : 'Show'} className="chevron" onClick={toggle} />
        <IconButton icon={Trash2} label="Delete note" danger onClick={() => onDelete(file)} />
      </div>
      {open && <pre className="note-body">{content ?? 'Loading…'}</pre>}
    </div>
  );
}

function Notes() {
  const toast = useToast();
  const [files, setFiles] = useState(null);
  const load = async () => {
    try {
      const data = await listFiles(NOTES_DIR);
      setFiles((data?.entries || []).filter((e) => !e.is_dir).sort((a, b) => b.mtime - a.mtime));
    } catch {
      setFiles([]);
    }
  };
  useEffect(() => { load(); }, []);

  const remove = async (f) => {
    if (!window.confirm(`Delete the note "${f.name}"?`)) return;
    try {
      await deleteFile(`${NOTES_DIR}/${f.name}`);
      load();
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, 'error');
    }
  };

  return (
    <Card title="Notes" icon={StickyNote} padded={false}>
      {files === null ? (
        <div className="loading" />
      ) : files.length === 0 ? (
        <Empty icon={StickyNote} title="No notes yet">Ask the assistant to "save a note called shopping".</Empty>
      ) : (
        <div className="rows">{files.map((f) => <NoteItem key={f.name} file={f} onDelete={remove} />)}</div>
      )}
    </Card>
  );
}

export default function Assistant() {
  const { snapshot } = useNexus();
  const st = ASSISTANT_STATES[snapshot.assistant.state] || ASSISTANT_STATES.idle;
  return (
    <>
      <PageHeader title="Assistant" subtitle="How the voice assistant sounds and behaves, and what it remembers.">
        <Pill tone={st.tone} pulse={snapshot.assistant.state !== 'idle'}>{st.label}</Pill>
      </PageHeader>
      <div className="assistant-grid">
        <Settings />
        <div className="stack">
          <Memory />
          <Notes />
        </div>
      </div>
    </>
  );
}
