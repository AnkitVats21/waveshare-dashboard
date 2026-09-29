import React, { useEffect, useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { Button, IconButton, Segmented } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { formatBytes } from '../../lib/format';
import {
  deleteToneFile,
  getAlarmTones,
  getYouTubeToneStatus,
  startYouTubeTone,
  uploadToneFile,
} from '../../lib/api';
import { sniffAudioFile, opusErrorMessage } from '../../lib/audioSniff';

const TONE_SOURCES = [
  { value: 'builtin', label: 'Built-in' },
  { value: 'files', label: 'My files' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'library', label: 'Library' },
];

export function extractYouTubeId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (url.searchParams.has('v')) {
      const v = url.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    const match = url.pathname.match(/\/(embed|v)\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[2];
  } catch {}
  const match = trimmed.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

export function getToneSource(tone) {
  if (!tone || tone === 'builtin' || tone.startsWith('builtin:')) return 'builtin';
  if (tone.startsWith('file:')) return 'files';
  return 'library';
}

export function formatTone(tone, songs) {
  if (!tone || tone === 'builtin' || tone === 'builtin:classic') return 'Classic';
  if (tone.startsWith('builtin:')) {
    const name = tone.slice('builtin:'.length);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (tone.startsWith('file:')) {
    return tone.slice('file:'.length);
  }
  const s = songs?.find((song) => song.id === tone);
  return s ? s.title : `Song (${tone})`;
}

export function TonePicker({ value, onChange, songs, onRefreshLibrary }) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [tonesData, setTonesData] = useState({
    builtin: ['classic', 'chime', 'digital', 'rising'],
    files: [],
  });
  const [source, setSource] = useState(() => getToneSource(value));

  // File states
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // YouTube states
  const [ytInput, setYtInput] = useState('');
  const [ytBusy, setYtBusy] = useState(false);
  const [ytProgress, setYtProgress] = useState(null);

  const refreshTones = async () => {
    try {
      const res = await getAlarmTones();
      if (res) {
        setTonesData({
          builtin: res.builtin || ['classic', 'chime', 'digital', 'rising'],
          files: res.files || [],
        });
      }
    } catch {}
  };

  useEffect(() => {
    refreshTones();
  }, []);

  // Sync tab source if external value changes (e.g. form switches between alarms)
  useEffect(() => {
    const detected = getToneSource(value);
    setSource(detected);
  }, [value]);

  const handleSourceChange = (newSource) => {
    setSource(newSource);
    if (newSource === 'builtin') {
      if (!value || !value.startsWith('builtin')) {
        onChange('builtin:classic');
      }
    } else if (newSource === 'files') {
      if (!value.startsWith('file:')) {
        if (tonesData.files.length > 0) {
          onChange(`file:${tonesData.files[0].name}`);
        } else {
          onChange('file:');
        }
      }
    } else if (newSource === 'library') {
      if (value.startsWith('builtin:') || value.startsWith('file:') || !value) {
        if (songs.length > 0) {
          onChange(songs[0].id);
        }
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const sniff = await sniffAudioFile(file);
    if (!sniff.playable) {
      toast(opusErrorMessage(sniff.format), 'error');
      return;
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.ogg', '.opus', '.webm'].includes(ext)) {
      toast(opusErrorMessage(sniff.format), 'error');
      return;
    }

    if (
      file.name.length > 48 ||
      /^[.\s]/.test(file.name) ||
      !/^[a-zA-Z0-9 _.-]+$/.test(file.name)
    ) {
      toast(
        'File name must be at most 48 characters, cannot start with "." or space, and can only contain letters, numbers, spaces, -, _, .',
        'error'
      );
      return;
    }

    setUploading(true);
    try {
      await uploadToneFile(file.name, file);
      toast(`Uploaded ${file.name}`);
      await refreshTones();
      onChange(`file:${file.name}`);
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const currentFileName = value.startsWith('file:') ? value.slice('file:'.length) : '';

  const handleDeleteFile = async () => {
    if (!currentFileName) return;
    if (!window.confirm(`Delete tone file "${currentFileName}"?`)) return;
    setDeleting(true);
    try {
      await deleteToneFile(currentFileName);
      toast(`Deleted ${currentFileName}`);
      await refreshTones();
      onChange('builtin:classic');
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleYtDownload = async () => {
    const id = extractYouTubeId(ytInput);
    if (!id) {
      toast('Please enter a valid YouTube URL or 11-character video ID', 'error');
      return;
    }
    setYtBusy(true);
    setYtProgress({ state: 'resolving', bytes: 0, total: 0 });
    try {
      await startYouTubeTone({ id });
      const interval = setInterval(async () => {
        try {
          const status = await getYouTubeToneStatus();
          setYtProgress(status);
          if (status.state === 'done') {
            clearInterval(interval);
            setYtBusy(false);
            toast(status.title ? `Downloaded "${status.title}" to library` : 'Downloaded to library');
            onChange(id);
            onRefreshLibrary?.();
          } else if (status.state === 'failed') {
            clearInterval(interval);
            setYtBusy(false);
            toast(`Download failed: ${status.error || 'Unknown error'}`, 'error');
          }
        } catch (err) {
          clearInterval(interval);
          setYtBusy(false);
          toast(`Error polling download: ${err.message}`, 'error');
        }
      }, 1500);
    } catch (err) {
      setYtBusy(false);
      setYtProgress(null);
      toast(`Download failed: ${err.message}`, 'error');
    }
  };

  // Determine current builtin pattern
  let currentBuiltin = 'classic';
  if (value && value.startsWith('builtin:')) {
    currentBuiltin = value.slice('builtin:'.length) || 'classic';
  }

  return (
    <div className="tone-picker stack" style={{ gap: 8 }}>
      <Segmented options={TONE_SOURCES} value={source} onChange={handleSourceChange} />

      {source === 'builtin' && (
        <select
          value={currentBuiltin}
          onChange={(e) => {
            const pattern = e.target.value;
            onChange(pattern === 'classic' ? 'builtin:classic' : `builtin:${pattern}`);
          }}
        >
          {tonesData.builtin.map((pattern) => (
            <option key={pattern} value={pattern}>
              {pattern === 'classic'
                ? 'Classic (default)'
                : pattern.charAt(0).toUpperCase() + pattern.slice(1)}
            </option>
          ))}
        </select>
      )}

      {source === 'files' && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="inline-field">
            <select
              value={currentFileName}
              onChange={(e) => onChange(e.target.value ? `file:${e.target.value}` : 'builtin:classic')}
              disabled={!tonesData.files.length}
            >
              {!tonesData.files.length ? (
                <option value="">No tone files uploaded yet</option>
              ) : (
                <>
                  <option value="">Select a tone file...</option>
                  {tonesData.files.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name} ({formatBytes(f.bytes)})
                    </option>
                  ))}
                </>
              )}
            </select>
            <input
              type="file"
              ref={fileInputRef}
              accept=".ogg,.opus,.webm"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              icon={Upload}
              busy={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </Button>
            <IconButton
              type="button"
              icon={Trash2}
              danger
              label="Delete tone file"
              disabled={!currentFileName || deleting}
              onClick={handleDeleteFile}
            />
          </div>
        </div>
      )}

      {source === 'youtube' && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="inline-field">
            <input
              type="text"
              placeholder="Paste YouTube URL or 11-char video ID"
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              disabled={ytBusy}
            />
            <Button type="button" icon={Download} busy={ytBusy} onClick={handleYtDownload}>
              Download
            </Button>
          </div>
          {ytProgress && ytBusy && (
            <div className="progress-block" style={{ gap: 4 }}>
              <div className="small muted">
                {ytProgress.state === 'resolving'
                  ? 'Resolving video...'
                  : ytProgress.title
                  ? `Downloading: ${ytProgress.title}`
                  : 'Downloading audio...'}
                {ytProgress.total > 0 &&
                  ` · ${formatBytes(ytProgress.bytes)} / ${formatBytes(ytProgress.total)}`}
              </div>
              <div
                style={{
                  height: 6,
                  background: 'var(--surface-3)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'var(--accent)',
                    width:
                      ytProgress.total > 0
                        ? `${Math.min(100, Math.round((ytProgress.bytes / ytProgress.total) * 100))}%`
                        : '40%',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
          {value && !value.startsWith('builtin:') && !value.startsWith('file:') && (
            <div className="small muted">
              Selected song ID: <code>{value}</code>
            </div>
          )}
        </div>
      )}

      {source === 'library' && (
        <select
          value={!value.startsWith('builtin:') && !value.startsWith('file:') ? value : ''}
          onChange={(e) => onChange(e.target.value || 'builtin:classic')}
        >
          <option value="">Select a library song...</option>
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.artist ? `${s.title} · ${s.artist}` : s.title}
            </option>
          ))}
        </select>
      )}

      <div className="field-hint" style={{ marginTop: 2 }}>
        If the tone can't play, the classic tone rings.
      </div>
    </div>
  );
}
