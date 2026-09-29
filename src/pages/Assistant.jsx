import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Sparkles, Brain, StickyNote, KeyRound, AlertTriangle, Save, Trash2, ChevronDown, FileText, Info, MessagesSquare, Settings2, Wrench, Timer, AudioLines, Bug, X } from 'lucide-react';
import { Banner, Button, Card, Empty, Field, IconButton, PageHeader, Pill, Segmented, Switch } from '../components/ui';
import Conversation from './assistant/Conversation';
import McpCard from './assistant/McpCard';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { ASSISTANT_STATES } from './Home';
import {
  MEMORY_FILE, NOTES_DIR, deleteFile, getAssistantConfig, getAssistantModels, listFiles, readTextFile, saveAssistantConfig, writeTextFile,
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

const SILENCE_MIN = 3;
const SILENCE_MAX = 60;
const RESUME_MIN_LIMIT = 0;
const RESUME_MAX_LIMIT = 120;
const KEEPALIVE_MIN = 0;
const KEEPALIVE_MAX = 180;
const VAD_PREFIX_MIN = 0;
const VAD_PREFIX_MAX = 2000;
const VAD_SILENCE_MIN = 0;
const VAD_SILENCE_MAX = 5000;

// Google Search per model: the firmware gives it to the 2.5 Live models only
// (3.x refuses it); the others search through the MCP web_search tool.
const searchNote = (status) =>
  status === 'yes'
    ? 'Built into this model.'
    : 'Not on this model: it searches with the Remote Skills (MCP) web search instead.';

const formFrom = (cfg) => ({
  voice: cfg.voice || '',
  model: stripModelPrefix(cfg.model),
  system_prompt: cfg.system_prompt || '',
  transcripts: cfg.transcripts ?? true,
  transcript_log: cfg.transcript_log ?? true,
  manual_silence_s: cfg.manual_silence_s ?? 10,
  resume_min: cfg.resume_min ?? 60,
  keepalive_s: cfg.keepalive_s ?? 60,
  echo_measure: cfg.echo_measure ?? false,
  barge_in: cfg.barge_in ?? false,
  web_search: cfg.web_search ?? true,
  weather_location: cfg.weather_location || '',
  vad_start: cfg.vad_start ?? 1,
  vad_end: cfg.vad_end ?? 0,
  vad_prefix_ms: cfg.vad_prefix_ms ?? 0,
  vad_silence_ms: cfg.vad_silence_ms ?? 0,
});

// Loose compare: inputs hold strings, the config numbers.
const sameForm = (a, b) => Object.keys(a).every((k) => String(a[k]) === String(b[k]));

const intIn = (value, min, max, what) => {
  const n = Math.round(Number(value));
  if (!(n >= min && n <= max)) throw new Error(`${what} must be ${min}-${max}`);
  return n;
};

// The Gemini config, loaded once for all tabs.
function useAssistantConfig() {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const load = async () => {
    try {
      setConfig(await getAssistantConfig());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  };
  useEffect(() => { load(); }, []);
  return { config, loadError, load };
}

// One form for the Personality, Skills and Advanced tabs: it lives above the
// tabs, so switching tabs keeps unsaved edits, and one Save sends them all.
function useSettingsForm({ config, load }) {
  const toast = useToast();
  const [form, setForm] = useState(() => formFrom(config || {}));
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState({ list: null, loading: true, error: null });

  useEffect(() => { if (config) setForm(formFrom(config)); }, [config]);

  useEffect(() => {
    let active = true;
    getAssistantModels()
      .then((res) => active && setModels({ list: res?.models || [], loading: false, error: null }))
      .catch((err) => active && setModels({ list: null, loading: false, error: err.message }));
    return () => { active = false; };
  }, []);

  const dirty = !!config && (!sameForm(form, formFrom(config)) || !!newKey.trim());
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setValue = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const discard = () => {
    setForm(formFrom(config || {}));
    setNewKey('');
  };

  const save = async () => {
    setSaving(true);
    try {
      // Keep any other fields already in the file; drop the read-only extras.
      const { api_key_set, defaults: _d, config_error, ...rest } = config?.config_error ? {} : config || {};
      const body = {
        ...rest,
        voice: form.voice,
        model: form.model.trim(),
        system_prompt: form.system_prompt,
        transcripts: form.transcripts,
        transcript_log: form.transcript_log,
        manual_silence_s: intIn(form.manual_silence_s, SILENCE_MIN, SILENCE_MAX, 'The silence timeout (s)'),
        resume_min: intIn(form.resume_min, RESUME_MIN_LIMIT, RESUME_MAX_LIMIT, 'Continue the last conversation (minutes)'),
        keepalive_s: intIn(form.keepalive_s, KEEPALIVE_MIN, KEEPALIVE_MAX, 'Keep the connection open (s)'),
        echo_measure: !!form.echo_measure,
        barge_in: !!form.barge_in,
        web_search: !!form.web_search,
        weather_location: form.weather_location.trim(),
        vad_start: intIn(form.vad_start, 0, 2, 'Start-of-speech sensitivity'),
        vad_end: intIn(form.vad_end, 0, 2, 'End-of-speech sensitivity'),
        vad_prefix_ms: intIn(form.vad_prefix_ms, VAD_PREFIX_MIN, VAD_PREFIX_MAX, 'Speech prefix (ms)'),
        vad_silence_ms: intIn(form.vad_silence_ms, VAD_SILENCE_MIN, VAD_SILENCE_MAX, 'Silence duration (ms)'),
      };
      if (body.weather_location.length > 64) throw new Error('The home city must be at most 64 characters');
      for (const k of ['voice', 'system_prompt']) if (!body[k]) delete body[k];
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

  return { config, form, set, setValue, newKey, setNewKey, models, dirty, saving, save, discard };
}

function SaveBar({ s }) {
  if (!s.dirty) return null;
  return (
    <div className="save-bar">
      <span className="small"><Info size={14} /> Unsaved changes. They apply to the next conversation.</span>
      <div className="inline-row" style={{ gap: 8 }}>
        <Button icon={X} onClick={s.discard} disabled={s.saving}>Discard</Button>
        <Button variant="primary" icon={Save} busy={s.saving} onClick={s.save}>Save</Button>
      </div>
    </div>
  );
}

function ModelField({ s }) {
  const { form, set, models, config } = s;
  const defaultModelName = stripModelPrefix(config.defaults?.model);
  if (models.error) {
    return (
      <Field label="Model" hint={`Couldn't load the model list (${models.error}). Enter a Gemini Live model name.`}>
        <input value={form.model} onChange={set('model')} placeholder={defaultModelName || 'gemini live model'} spellCheck={false} />
      </Field>
    );
  }
  const savedInList = !form.model || (models.list && models.list.some((m) => m.name === form.model));
  return (
    <Field
      label="Model"
      hint={models.loading ? 'Loading the model list from the device…' : form.model ? 'Selected model' : `Default: ${defaultModelName || 'built-in'}`}
    >
      <select value={form.model} onChange={set('model')} disabled={models.loading && !models.list}>
        <option value="">Firmware default ({defaultModelName || 'built-in'})</option>
        {models.list?.map((m) => (
          <option key={m.name} value={m.name}>{m.display_name || m.name}</option>
        ))}
        {!savedInList && form.model && <option value={form.model}>{form.model} (saved)</option>}
      </select>
    </Field>
  );
}

function PersonalityTab({ s }) {
  const { form, set, setValue, config } = s;
  const defaults = config.defaults || {};
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
        <ModelField s={s} />
      </div>
      <Field label="Personality & instructions" hint="Sent to the assistant at the start of every conversation, e.g. tone, language, how brief to be.">
        <textarea
          rows={6}
          value={form.system_prompt}
          onChange={set('system_prompt')}
          placeholder="You are Nexus, a friendly speaker assistant. Keep answers short. Reply in Hindi when I speak Hindi."
        />
      </Field>
      <Switch checked={form.barge_in} onChange={setValue('barge_in')} label="Barge-in: talk over a reply to interrupt it (experimental)" />
    </Card>
  );
}

function SkillsTab({ s }) {
  const { form, set, setValue, models, config } = s;
  const active = form.model || stripModelPrefix(config.defaults?.model);
  const model = models.list?.find((m) => m.name === active);
  return (
    <div className="assistant-grid">
      <Card title="Built-in skills" icon={Wrench}>
        <div className="stack">
          <Switch checked={form.web_search} onChange={setValue('web_search')} label="Google Search for up-to-date answers" />
          {form.web_search && model && <p className="muted small" style={{ margin: 0 }}>{searchNote(model.search)}</p>}
          <Field label="Weather home city" hint="Used when you ask for the weather without naming a place, and in the morning briefing.">
            <input value={form.weather_location} onChange={set('weather_location')} maxLength={64} placeholder="e.g. Pune" />
          </Field>
        </div>
      </Card>
      <McpCard />
    </div>
  );
}

function AdvancedTab({ s }) {
  const { form, set, setValue, newKey, setNewKey, config } = s;
  const number = (k, min, max) => (
    <input type="number" min={min} max={max} value={form[k]} onChange={set(k)} className="narrow-input" />
  );
  return (
    <div className="assistant-grid">
      <Card title="Sessions" icon={Timer}>
        <div className="stack">
          <Field label="Silence timeout (s)" hint={`For conversations started from this dashboard: how long it waits for you to speak before ending. The wake word always uses 3 s. ${SILENCE_MIN}-${SILENCE_MAX} s.`}>
            {number('manual_silence_s', SILENCE_MIN, SILENCE_MAX)}
          </Field>
          <Field label="Continue the last conversation within (minutes)" hint={`A session started within this many minutes of the last one continues that conversation; 0 = always start fresh. ${RESUME_MIN_LIMIT}-${RESUME_MAX_LIMIT} min.`}>
            {number('resume_min', RESUME_MIN_LIMIT, RESUME_MAX_LIMIT)}
          </Field>
          <Field label="Keep the connection open after a session (s)" hint={`A quick follow-up wake then starts instantly; 0 = close at once. ${KEEPALIVE_MIN}-${KEEPALIVE_MAX} s.`}>
            {number('keepalive_s', KEEPALIVE_MIN, KEEPALIVE_MAX)}
          </Field>
        </div>
      </Card>
      <div className="stack">
        <Card title="Voice detection" icon={AudioLines}>
          <div className="form-grid">
            <Field label="Start-of-speech sensitivity" hint="Low: reply echo and room noise interrupt less often">
              <select value={form.vad_start} onChange={set('vad_start')}>
                <option value={0}>Gemini default</option>
                <option value={1}>Low</option>
                <option value={2}>High</option>
              </select>
            </Field>
            <Field label="End-of-speech sensitivity" hint="Low: waits longer before answering">
              <select value={form.vad_end} onChange={set('vad_end')}>
                <option value={0}>Gemini default</option>
                <option value={1}>Low</option>
                <option value={2}>High</option>
              </select>
            </Field>
            <Field label="Speech prefix (ms)" hint={`Speech needed before a start counts; 0 = Gemini default. ${VAD_PREFIX_MIN}-${VAD_PREFIX_MAX} ms.`}>
              {number('vad_prefix_ms', VAD_PREFIX_MIN, VAD_PREFIX_MAX)}
            </Field>
            <Field label="Silence duration (ms)" hint={`Silence that ends your turn; 0 = Gemini default. ${VAD_SILENCE_MIN}-${VAD_SILENCE_MAX} ms.`}>
              {number('vad_silence_ms', VAD_SILENCE_MIN, VAD_SILENCE_MAX)}
            </Field>
          </div>
        </Card>
        <Card title="Transcripts & debug" icon={Bug}>
          <div className="stack">
            <Switch checked={form.transcripts} onChange={setValue('transcripts')} label="Transcripts: show what's said on the Conversation tab" />
            <Switch
              checked={form.transcripts && form.transcript_log}
              disabled={!form.transcripts}
              onChange={setValue('transcript_log')}
              label="Also print each turn to the device log"
            />
            <Switch checked={form.echo_measure} onChange={setValue('echo_measure')} label="Echo measurement: log how much echo the mic picks up during replies" />
          </div>
        </Card>
        <Card title="Gemini API key" icon={KeyRound}>
          <Field hint={config.api_key_set ? 'A key is saved on the device. It is never shown; type a new one to replace it.' : 'No key saved; the key built into the firmware is used.'}>
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
        </Card>
      </div>
    </div>
  );
}

// The settings tabs wait for the config.
function SettingsTabs({ cfg, s, sub }) {
  if (cfg.loadError) return <Card title="Settings" icon={Settings2}><Banner tone="danger" icon={AlertTriangle}>{cfg.loadError}</Banner></Card>;
  if (!cfg.config) return <Card title="Settings" icon={Settings2}><div className="loading" /></Card>;
  return (
    <>
      {sub === 'personality' && <PersonalityTab s={s} />}
      {sub === 'skills' && <SkillsTab s={s} />}
      {sub === 'advanced' && <AdvancedTab s={s} />}
    </>
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

const SUBS = ['conversation', 'personality', 'skills', 'memory', 'advanced'];
const OLD_SUBS = { settings: 'personality' };

const subFromHash = () => {
  const raw = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  const sub = OLD_SUBS[raw] || raw;
  return SUBS.includes(sub) ? sub : 'conversation';
};

export default function Assistant() {
  const { snapshot } = useNexus();
  const st = ASSISTANT_STATES[snapshot.assistant.state] || ASSISTANT_STATES.idle;
  const [sub, setSub] = useState(subFromHash);
  const cfg = useAssistantConfig();
  const settings = useSettingsForm(cfg);

  useEffect(() => {
    const onHash = () => setSub(subFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const change = (v) => {
    window.history.replaceState(null, '', `#/assistant/${v}`);
    setSub(v);
  };

  return (
    <>
      <PageHeader
        title="Assistant"
        subtitle="Talk to it from here, and set how it sounds, what it can do and what it remembers."
        status={<Pill tone={st.tone} pulse={snapshot.assistant.state !== 'idle'}>{st.label}</Pill>}
      >
        <Segmented
          value={sub}
          onChange={change}
          options={[
            { value: 'conversation', label: 'Conversation', icon: MessagesSquare },
            { value: 'personality', label: 'Personality', icon: Sparkles },
            { value: 'skills', label: 'Skills', icon: Wrench },
            { value: 'memory', label: 'Memory', icon: Brain },
            { value: 'advanced', label: 'Advanced', icon: Settings2 },
          ]}
        />
      </PageHeader>
      {sub === 'conversation' && <Conversation config={cfg.config} />}
      {['personality', 'skills', 'advanced'].includes(sub) && <SettingsTabs cfg={cfg} s={settings} sub={sub} />}
      {sub === 'memory' && (
        <div className="assistant-grid">
          <Memory />
          <Notes />
        </div>
      )}
      <SaveBar s={settings} />
    </>
  );
}
