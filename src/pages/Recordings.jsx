import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Download, Mic, Pause, Pencil, Play, Speaker, Square, Trash2, X } from 'lucide-react';
import { Button, Card, Empty, IconButton, PageHeader, Pill, Segmented } from '../components/ui';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { usePoll } from '../hooks/usePoll';
import {
  RECORDING_MODES, deleteRecording, downloadRecording, getRecordings, getStorageInfo, playRecordingOnDevice,
  recordingTrackId, recordingUrl, renameRecording, startRecording, stopRecording,
} from '../lib/api';
import { formatBytes, formatClock } from '../lib/format';

const MAX_RECORDING_MS = 10 * 60 * 1000;  // AudioRecorder::MAX_DURATION_MS
const MAX_NAME = 60;                       // Services::MAX_RECORDING_NAME
const NAME_RE = /^[A-Za-z0-9 _\-.()]+$/;

const MODE_LABELS = { stereo: 'Stereo', processed: 'Processed', unknown: 'Other' };

const baseName = (file) => file.replace(/\.[^.]+$/, '');
// The device's player decodes Ogg Opus only (the old WAV test files don't play there).
const playsOnDevice = (file) => /\.(opus|ogg)$/i.test(file);

function formatStarted(epoch) {
  if (!epoch) return 'Unknown date';
  return new Date(epoch * 1000).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatRate(r) {
  if (!r.sample_rate) return '';
  const khz = `${Math.round(r.sample_rate / 1000)} kHz`;
  return r.channels > 2 ? `${khz}, ${r.channels} ch` : khz;
}

// Elapsed recording time: the snapshot's record_ms (every ~2 s), ticking
// locally in between.
function useRecordingTime(state) {
  const recording = !!state.is_recording;
  const [ms, setMs] = useState(state.record_ms || 0);
  useEffect(() => setMs(state.record_ms || 0), [state.record_ms]);
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setMs((m) => m + 250), 250);
    return () => clearInterval(id);
  }, [recording]);
  return recording ? ms : 0;
}

function RecorderCard({ state, online, onStopped }) {
  const toast = useToast();
  const [mode, setMode] = useState('stereo');
  const [busy, setBusy] = useState(false);
  const recording = !!state.is_recording;
  const elapsed = useRecordingTime(state);

  const toggle = async () => {
    setBusy(true);
    try {
      if (recording) {
        await stopRecording();
        onStopped();
      } else {
        await startRecording(mode);
      }
    } catch (err) {
      toast(`Couldn't ${recording ? 'stop' : 'start'} recording: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Recorder" icon={Mic}>
      <div className="rec-recorder">
        {recording ? (
          <div className="rec-live">
            <Pill tone="danger" pulse>Recording · {MODE_LABELS[state.record_mode] || 'audio'}</Pill>
            <span className="rec-timer mono">{formatClock(elapsed)}</span>
            <span className="muted small">stops by itself at {formatClock(MAX_RECORDING_MS)}</span>
          </div>
        ) : (
          <div className="rec-live">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'stereo', label: 'Stereo' },
                { value: 'processed', label: 'Processed' },
              ]}
            />
            <span className="muted small">
              {mode === 'stereo'
                ? 'Both microphones as they hear the room, 24 kHz (16 kHz while music plays).'
                : 'The cleaned-up voice the wake word listens to, 16 kHz mono.'}
            </span>
          </div>
        )}
        <Button
          variant={recording ? 'danger' : 'primary'}
          icon={recording ? Square : Mic}
          busy={busy}
          disabled={!online}
          onClick={toggle}
        >
          {recording ? 'Stop' : 'Start recording'}
        </Button>
      </div>
    </Card>
  );
}

function RenameField({ rec, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(baseName(rec.file));
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => input.current?.select(), []);
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= MAX_NAME && NAME_RE.test(trimmed) && !trimmed.startsWith('.');

  const save = async () => {
    if (trimmed === baseName(rec.file)) return onDone(false);
    if (!valid) return toast('Use letters, digits, spaces or - _ . ( ), up to 60 characters', 'error');
    setBusy(true);
    try {
      await renameRecording(rec.id, trimmed);
      onDone(true);
    } catch (err) {
      toast(`Couldn't rename: ${err.message}`, 'error');
      setBusy(false);
    }
    return undefined;
  };

  return (
    <form
      className="rec-rename"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        ref={input}
        value={name}
        maxLength={MAX_NAME}
        disabled={busy}
        aria-invalid={!valid}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone(false)}
      />
      <IconButton icon={Check} label="Save name" type="submit" disabled={busy || !valid} />
      <IconButton icon={X} label="Cancel" type="button" disabled={busy} onClick={() => onDone(false)} />
    </form>
  );
}

// device: 'playing' or 'paused' while this recording is the device's track, else null.
function RecordingRow({ rec, playing, device, online, renaming, onPlay, onDevice, onRename, onRenamed, onDelete, onDownload }) {
  const mode = RECORDING_MODES[rec.mode] || 'unknown';
  const deviceOk = playsOnDevice(rec.file);
  const deviceLabel = !deviceOk ? 'The device plays Ogg Opus recordings only'
    : device === 'playing' ? 'Pause on the device'
      : device === 'paused' ? 'Resume on the device' : 'Play on the device';
  return (
    <div className={clsx('rec-row', (playing || device) && 'is-selected')}>
      <div className="alarm">
        <IconButton icon={playing ? Pause : Play} label={playing ? 'Stop playing here' : 'Play here'} onClick={onPlay} />
        <IconButton
          icon={device === 'playing' ? Pause : Speaker}
          label={deviceLabel}
          active={!!device}
          disabled={!online || !deviceOk}
          onClick={onDevice}
        />
        <div className="alarm-main">
          {renaming ? (
            <RenameField rec={rec} onDone={onRenamed} />
          ) : (
            <span className="rec-name" title={rec.file}>{baseName(rec.file)}</span>
          )}
          <span className="muted small">
            {formatStarted(rec.started)} · {formatClock(rec.duration_ms)} · {formatBytes(rec.size)}
          </span>
        </div>
        <span className="hide-mobile">
          <Pill tone={mode === 'stereo' ? 'accent' : mode === 'processed' ? 'ok' : 'neutral'}>
            {MODE_LABELS[mode]} {formatRate(rec)}
          </Pill>
        </span>
        <div className="alarm-actions">
          {!renaming && <IconButton icon={Pencil} label="Rename" onClick={onRename} />}
          <IconButton icon={Download} label="Download" onClick={onDownload} />
          <IconButton icon={Trash2} label="Delete" danger onClick={onDelete} />
        </div>
      </div>
      {playing && (
        // Seekable: the device answers Range requests.
        <audio className="rec-audio" src={recordingUrl(rec.file)} controls autoPlay onEnded={onPlay} />
      )}
    </div>
  );
}

export default function Recordings() {
  const toast = useToast();
  const { snapshot, online, act } = useNexus();
  const state = snapshot.state || {};
  const music = snapshot.music || {};
  const list = usePoll(getRecordings, 30000);
  const storage = usePoll(getStorageInfo, 60000);
  const reload = list.refresh;
  const [filter, setFilter] = useState('all');
  const [playingId, setPlayingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);

  // A recording stopped elsewhere (button, voice, 10-minute cap) adds a file.
  const wasRecording = useRef(!!state.is_recording);
  useEffect(() => {
    if (wasRecording.current && !state.is_recording) reload();
    wasRecording.current = !!state.is_recording;
  }, [state.is_recording, reload]);

  const all = list.data || [];
  const shown = filter === 'all' ? all : all.filter((r) => RECORDING_MODES[r.mode] === filter);
  const total = all.reduce((sum, r) => sum + (r.size || 0), 0);
  const totalMs = all.reduce((sum, r) => sum + (r.duration_ms || 0), 0);

  const remove = async (rec) => {
    if (!window.confirm(`Delete "${baseName(rec.file)}" from the SD card?`)) return;
    if (playingId === rec.id) setPlayingId(null);
    try {
      await deleteRecording(rec.id);
      reload();
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, 'error');
    }
  };

  const deviceState = (rec) => {
    if (music.current_track?.id !== recordingTrackId(rec.id)) return null;
    return music.state === 'PLAYING' ? 'playing' : music.state === 'PAUSED' ? 'paused' : null;
  };

  const playOnDevice = async (rec) => {
    const st = deviceState(rec);
    if (st === 'playing') return act('pause');
    if (st === 'paused') return act('resume');
    if (playingId === rec.id) setPlayingId(null);  // one place at a time
    try {
      await playRecordingOnDevice(rec.id);
    } catch (err) {
      toast(`Couldn't play on the device: ${err.message}`, 'error');
    }
    return undefined;
  };

  const download = async (rec) => {
    try {
      await downloadRecording(rec.file);
    } catch (err) {
      toast(`Couldn't download: ${err.message}`, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Recordings" subtitle="Audio recorded on the device, saved on its SD card. Play them here or on the device, rename or download them." />
      <RecorderCard state={state} online={online} onStopped={reload} />
      <Card
        title="Saved"
        icon={Mic}
        padded={false}
        action={all.length > 0 && (
          <span className="muted small">
            {all.length} · {formatClock(totalMs)} · {formatBytes(total)}
            {storage.data?.free_bytes != null && ` · ${formatBytes(storage.data.free_bytes)} free on the card`}
          </span>
        )}
      >
        {all.length > 1 && (
          <div className="rec-filter">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'stereo', label: 'Stereo' },
                { value: 'processed', label: 'Processed' },
              ]}
            />
          </div>
        )}
        {list.loading && !list.data ? (
          <div className="loading" />
        ) : list.error && !list.data ? (
          <Empty icon={Mic} title="Couldn't load the recordings">{list.error.message}</Empty>
        ) : shown.length === 0 ? (
          <Empty icon={Mic} title={all.length ? 'None in this mode' : 'No recordings yet'}>
            Start one above, or with the recording button on the device.
          </Empty>
        ) : (
          <div className="rows">
            {shown.map((rec) => (
              <RecordingRow
                key={rec.id}
                rec={rec}
                playing={playingId === rec.id}
                device={deviceState(rec)}
                online={online}
                renaming={renamingId === rec.id}
                onPlay={() => setPlayingId(playingId === rec.id ? null : rec.id)}
                onDevice={() => playOnDevice(rec)}
                onRename={() => {
                  // The browser would keep requesting the old name.
                  if (playingId === rec.id) setPlayingId(null);
                  setRenamingId(rec.id);
                }}
                onRenamed={(changed) => {
                  setRenamingId(null);
                  if (changed) reload();
                }}
                onDelete={() => remove(rec)}
                onDownload={() => download(rec)}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
