import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Music, Pencil, Play, Square, Trash2, Upload, X } from 'lucide-react';
import { Button, Card, Field, IconButton, Pill } from '../../components/ui';
import CommitSlider from '../../components/CommitSlider';
import { useToast } from '../../components/Toast';
import { formatBytes } from '../../lib/format';
import {
  deleteToneFile,
  getAlarms,
  getAlarmStatus,
  getBriefingMusic,
  playAlarmMedia,
  saveBriefingMusic,
  renameToneFile,
  saveAlarm,
  stopMusic,
  uploadToneFile,
} from '../../lib/api';
import { sniffAudioFile, opusErrorMessage } from '../../lib/audioSniff';
import { useNexus } from '../../DeviceContext';

// The device's rules for files in the alarm folder.
function nameError(name) {
  if (name.length > 48 || /^[.\s]/.test(name) || !/^[a-zA-Z0-9 _.-]+$/.test(name)) {
    return 'File name must be at most 48 characters, cannot start with "." or space, and can only contain letters, numbers, spaces, -, _, .';
  }
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!['.ogg', '.opus', '.webm'].includes(ext)) return 'The name must end in .ogg, .opus or .webm';
  return null;
}

// Alarms whose tone is this file.
async function alarmsUsing(name) {
  const alarms = (await getAlarms()) || [];
  return alarms.filter((a) => a.tone === `file:${name}`);
}

export default function BriefingMusicCard() {
  const toast = useToast();
  const { snapshot } = useNexus();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [music, setMusic] = useState('');
  const [duck, setDuck] = useState(20);
  const [dragDuck, setDragDuck] = useState(null);
  const [files, setFiles] = useState([]);
  const [previewing, setPreviewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState('off');
  const [renaming, setRenaming] = useState(null);   // file name being renamed
  const [newName, setNewName] = useState('');
  const [busyFile, setBusyFile] = useState(null);

  const loadConfig = async () => {
    try {
      const res = await getBriefingMusic();
      if (res) {
        setMusic(res.music || '');
        setDuck(typeof res.duck === 'number' ? res.duck : 20);
        setFiles(res.files || []);
      }
    } catch (err) {
      console.warn('Could not load briefing music config:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      const st = await getAlarmStatus();
      if (st?.briefing_music) {
        setPhase(st.briefing_music);
      } else {
        setPhase('off');
      }
    } catch {}
  };

  useEffect(() => {
    loadConfig();
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // If playback ends on the device, clear local previewing indicator
  useEffect(() => {
    if (snapshot?.music?.state === 'IDLE' && previewing) {
      setPreviewing(null);
    }
  }, [snapshot?.music?.state, previewing]);

  const handleSelect = async (fileName) => {
    const prev = music;
    setMusic(fileName);
    try {
      await saveBriefingMusic({ music: fileName });
      toast(fileName ? `Briefing music set to ${fileName}` : 'Briefing music set to None (voice only)');
    } catch (err) {
      setMusic(prev);
      toast(`Failed to set briefing music: ${err.message}`, 'error');
    }
  };

  const handleDuckCommit = async (val) => {
    const prev = duck;
    setDuck(val);
    try {
      await saveBriefingMusic({ duck: val });
      toast(`Duck level set to ${val}%`);
    } catch (err) {
      setDuck(prev);
      toast(`Failed to update duck level: ${err.message}`, 'error');
    }
  };

  const handlePreview = async (name) => {
    try {
      await playAlarmMedia(name);
      setPreviewing(name);
      toast(`Previewing ${name} on device`);
    } catch (err) {
      toast(`Preview failed: ${err.message}`, 'error');
    }
  };

  const handleStop = async () => {
    try {
      await stopMusic();
      setPreviewing(null);
      toast('Preview stopped');
    } catch (err) {
      toast(`Stop failed: ${err.message}`, 'error');
    }
  };

  const startRename = (name) => {
    setRenaming(name);
    setNewName(name);
  };

  // Renames the file, then points the briefing music setting and any alarm
  // that uses it at the new name.
  const handleRename = async (from) => {
    const to = newName.trim();
    if (!to || to === from) {
      setRenaming(null);
      return;
    }
    const err = nameError(to);
    if (err) {
      toast(err, 'error');
      return;
    }
    if (files.some((f) => f.name === to)) {
      toast(`${to} already exists`, 'error');
      return;
    }
    setBusyFile(from);
    try {
      if (previewing === from) await handleStop();
      await renameToneFile(from, to);
      if (music === from) await saveBriefingMusic({ music: to });
      const users = await alarmsUsing(from);
      for (const a of users) await saveAlarm({ id: a.id, tone: `file:${to}` });
      toast(users.length ? `Renamed to ${to}; ${users.length} alarm(s) updated` : `Renamed to ${to}`);
      setRenaming(null);
    } catch (e) {
      toast(`Rename failed: ${e.message}`, 'error');
    } finally {
      setBusyFile(null);
      await loadConfig();
    }
  };

  // Deletes the file. The briefing music setting falls back to None, and
  // alarms that used it go back to their default (a briefing alarm: the
  // briefing music; an alarm: the classic tone).
  const handleDelete = async (name) => {
    let users = [];
    try {
      users = await alarmsUsing(name);
    } catch {}
    const parts = [];
    if (music === name) parts.push('it is the current briefing music');
    if (users.length) parts.push(`${users.length} alarm(s) use it`);
    const note = parts.length ? ` (${parts.join('; ')})` : '';
    if (!window.confirm(`Delete ${name}${note}?`)) return;
    setBusyFile(name);
    try {
      if (previewing === name) await handleStop();
      await deleteToneFile(name);
      if (music === name) await saveBriefingMusic({ music: '' });
      for (const a of users) await saveAlarm({ id: a.id, tone: '' });
      toast(`Deleted ${name}`);
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    } finally {
      setBusyFile(null);
      await loadConfig();
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Browser-side binary format check
    const sniff = await sniffAudioFile(file);
    if (!sniff.playable) {
      toast(opusErrorMessage(sniff.format), 'error');
      return;
    }

    const nameErr = nameError(file.name);
    if (nameErr) {
      toast(nameErr, 'error');
      return;
    }

    setUploading(true);
    try {
      await uploadToneFile(file.name, file);
      toast(`Uploaded ${file.name}`);
      await loadConfig();
      await handleSelect(file.name);
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // If a music file was saved in settings but isn't present in files list, show it
  const allFiles = [...files];
  if (music && !allFiles.some((f) => f.name === music)) {
    allFiles.push({ name: music, bytes: 0, missing: true });
  }

  const isPlayingPreview = !!previewing;

  return (
    <Card
      title="Briefing music"
      icon={Music}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {phase && phase !== 'off' && (
            <Pill tone="accent" pulse={phase !== 'idle'}>
              Phase: {phase}
            </Pill>
          )}
          {isPlayingPreview && (
            <Button size="sm" icon={Square} onClick={handleStop}>
              Stop
            </Button>
          )}
        </div>
      }
    >
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        Background music played while the assistant reads your morning briefing. Audio ducks down during speech.
      </p>

      {loading ? (
        <div className="loading" />
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="briefing-music-list stack" style={{ gap: 6 }}>
            <div
              className={clsx('briefing-music-item', music === '' && 'is-selected')}
              onClick={() => handleSelect('')}
              role="button"
              tabIndex={0}
            >
              <div className="briefing-item-radio">
                <input
                  type="radio"
                  name="briefing-music-pick"
                  checked={music === ''}
                  onChange={() => handleSelect('')}
                />
              </div>
              <div className="briefing-item-info">
                <span className="briefing-item-title">None</span>
                <span className="muted small">Voice only (no background music)</span>
              </div>
            </div>

            {allFiles.map((f) => {
              const selected = music === f.name;
              const isCurrentPreview = previewing === f.name;
              return (
                <div
                  key={f.name}
                  className={clsx('briefing-music-item', selected && 'is-selected')}
                  onClick={() => handleSelect(f.name)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="briefing-item-radio">
                    <input
                      type="radio"
                      name="briefing-music-pick"
                      checked={selected}
                      onChange={() => handleSelect(f.name)}
                    />
                  </div>
                  {renaming === f.name ? (
                    <div className="briefing-item-info" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={newName}
                        maxLength={48}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(f.name);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="briefing-item-info">
                      <span className="briefing-item-title">{f.name}</span>
                      <span className="muted small">
                        {f.missing ? 'Missing from SD card' : formatBytes(f.bytes)}
                      </span>
                    </div>
                  )}
                  <div className="briefing-item-actions" onClick={(e) => e.stopPropagation()}>
                    {renaming === f.name ? (
                      <>
                        <IconButton
                          icon={Check}
                          label="Save name"
                          disabled={busyFile === f.name}
                          onClick={() => handleRename(f.name)}
                        />
                        <IconButton icon={X} label="Cancel" onClick={() => setRenaming(null)} />
                      </>
                    ) : (
                      <>
                        <IconButton
                          icon={Pencil}
                          label={`Rename ${f.name}`}
                          disabled={f.missing || busyFile === f.name}
                          onClick={() => startRename(f.name)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${f.name}`}
                          danger
                          disabled={f.missing || busyFile === f.name}
                          onClick={() => handleDelete(f.name)}
                        />
                      </>
                    )}
                    {isCurrentPreview ? (
                      <IconButton
                        icon={Square}
                        label={`Stop ${f.name}`}
                        onClick={handleStop}
                      />
                    ) : (
                      <IconButton
                        icon={Play}
                        label={`Preview ${f.name}`}
                        disabled={f.missing}
                        onClick={() => handlePreview(f.name)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="inline-row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ogg,.opus,.webm"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
            <Button
              icon={Upload}
              size="sm"
              busy={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload music
            </Button>
            <span className="muted small">Opus audio (.ogg, .opus, .webm)</span>
          </div>

          <div className="settings-group" style={{ margin: '8px 0 0' }}>
            <Field
              label="Music duck level"
              hint={
                music === ''
                  ? 'No background music selected (voice only)'
                  : `Lowers background music to ${dragDuck ?? duck}% while the assistant speaks (10%–50%).`
              }
            >
              <div className="slider-row">
                <div className="slider-head">
                  <span className="muted small">Speech ducking</span>
                  <span className="mono small">{dragDuck ?? duck}%</span>
                </div>
                <CommitSlider
                  min={10}
                  max={50}
                  step={1}
                  value={duck}
                  disabled={music === ''}
                  onDrag={setDragDuck}
                  onCommit={handleDuckCommit}
                />
              </div>
            </Field>
          </div>
        </div>
      )}
    </Card>
  );
}
