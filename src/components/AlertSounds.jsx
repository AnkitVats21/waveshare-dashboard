import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { BellRing, Play, RotateCcw } from 'lucide-react';
import { Button, Card, IconButton, Pill, Switch } from './ui';
import CommitSlider from './CommitSlider';
import { useToast } from './Toast';
import { usePoll } from '../hooks/usePoll';
import { getAlerts, previewAlert, resetAlert, updateAlert, uploadAlert } from '../lib/api';

const LABELS = {
  wake_confirm: ['Wake', 'The wake word was heard.'],
  ready_to_speak: ['Ready to speak', 'The assistant is listening.'],
  session_end: ['Session end', 'A conversation closed.'],
  error: ['Error', 'A session failed.'],
  offline: ['Offline', 'Woken without Wi-Fi.'],
};
const BUILTIN = 'builtin';
const UPLOAD = '__upload';

const seconds = (ms) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
const formatDb = (db) => `${db > 0 ? '+' : ''}${Number(db.toFixed(1))} dB`;

function AlertRow({ alert, files, limits, disabled, onChange }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [label, when] = LABELS[alert.name] || [alert.name, ''];
  const defaultFile = `${alert.name}.ogg`;
  const hasDefaultFile = files.some((f) => f.name === defaultFile);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.alert) onChange(res.alert);
      if (done) toast(done);
    } catch (err) {
      toast(`${label}: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const chooseSource = (value) => {
    if (value === UPLOAD) {
      fileRef.current?.click();
      return;
    }
    run(() => updateAlert(alert.name, { source: value }));
  };

  const upload = (file) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (limits && file.size > limits.max_file_bytes) {
      toast(`${file.name} is over ${Math.round(limits.max_file_bytes / 1024)} KB`, 'error');
      return;
    }
    run(() => uploadAlert(alert.name, file), `${label} now plays ${file.name}`);
  };

  // A saved file that is gone from the folder still shows as the selection.
  const sourceFiles = files.map((f) => f.name);
  if (alert.source && alert.source !== BUILTIN && !sourceFiles.includes(alert.source)) sourceFiles.push(alert.source);

  return (
    <div className={clsx('alert-row', !alert.enabled && 'is-off')}>
      <div className="alert-head">
        <div className="row-text">
          <div>{label}</div>
          <div className="muted small">{when}</div>
        </div>
        <IconButton icon={Play} label={`Play ${label}`} disabled={disabled || busy} onClick={() => run(() => previewAlert(alert.name))} />
        <Switch checked={alert.enabled} disabled={disabled || busy} onChange={(on) => run(() => updateAlert(alert.name, { enabled: on }))} />
      </div>

      <div className="alert-controls">
        <select value={alert.source} disabled={disabled || busy} onChange={(e) => chooseSource(e.target.value)} aria-label={`${label} sound`}>
          <option value="">Default ({hasDefaultFile ? defaultFile : 'built-in tone'})</option>
          <option value={BUILTIN}>Built-in tone</option>
          {sourceFiles.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
          <option value={UPLOAD}>Upload a file…</option>
        </select>
        <div className="slider-row">
          <div className="slider-head">
            <span className="muted small">Level</span>
            <span className="mono small">{formatDb(alert.gain_db)}</span>
          </div>
          <CommitSlider
            value={alert.gain_db}
            min={limits?.min_gain_db ?? -24}
            max={limits?.max_gain_db ?? 6}
            step={1}
            disabled={disabled || busy}
            onCommit={(db) => run(() => updateAlert(alert.name, { gain_db: db }))}
          />
        </div>
      </div>

      <div className="alert-meta small">
        <span className="muted">
          {alert.playing === BUILTIN ? 'Built-in tone' : alert.playing} · {seconds(alert.duration_ms)}
        </span>
        {alert.truncated && <Pill tone="warn">Cut to {limits?.max_seconds ?? 3} s</Pill>}
        {alert.error && alert.error !== 'no file' && <Pill tone="danger">{alert.error}</Pill>}
        {alert.custom && (
          <Button size="sm" icon={RotateCcw} disabled={disabled || busy} onClick={() => run(() => resetAlert(alert.name), `${label} reset`)}>
            Reset
          </Button>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".ogg,.opus,.webm,audio/ogg,audio/webm" hidden onChange={(e) => upload(e.target.files[0])} />
    </div>
  );
}

// Per-alert sound, level and on/off, stored on the device (/api/alerts).
export default function AlertSounds({ disabled }) {
  const { data, error, refresh } = usePoll(getAlerts, 0, [disabled]);
  const [overrides, setOverrides] = useState({});
  const alerts = (data?.alerts || []).map((a) => overrides[a.name] || a);

  const onChange = (alert) => {
    setOverrides((o) => ({ ...o, [alert.name]: alert }));
    // An upload adds a file to the folder; reload the list for the pickers.
    refresh().then(() => setOverrides({}));
  };

  return (
    <Card title="Sounds" icon={BellRing} className="span-2">
      {error && !data && <p className="muted small">Could not load the alert sounds: {error.message}</p>}
      <div className="alert-list">
        {alerts.map((a) => (
          <AlertRow key={a.name} alert={a} files={data.files || []} limits={data.limits} disabled={disabled} onChange={onChange} />
        ))}
      </div>
      <p className="muted small">
        Ogg or WebM (Opus) files up to {Math.round((data?.limits?.max_file_bytes ?? 262144) / 1024)} KB; the first{' '}
        {data?.limits?.max_seconds ?? 3} s are played. Level is relative to the speaker volume.
      </p>
    </Card>
  );
}
