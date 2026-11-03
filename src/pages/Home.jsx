import React from 'react';
import clsx from 'clsx';
import {
  Play, Pause, SkipForward, ListMusic, AlarmClock, Sparkles, Activity, Mic, MicOff,
  Lightbulb, LightbulbOff, Volume2, ChevronRight, Music2,
} from 'lucide-react';
import { Card, Empty, Meter, Pill, Stat, IconButton, Button } from '../components/ui';
import CommitSlider from '../components/CommitSlider';
import OutputPicker from '../components/OutputPicker';
import { useAudioOutputs } from '../hooks/useAudioOutputs';
import { TrackArt, useTrackInfo } from '../components/Track';
import { useNexus, LED_MODES } from '../DeviceContext';
import { usePoll } from '../hooks/usePoll';
import { getAlarms, getReminders } from '../lib/api';
import { formatUntil, formatWhen, timeOf } from '../lib/schedule';
import { formatBytes, formatUptime, signalLabel } from '../lib/format';

export const ASSISTANT_STATES = {
  idle: { label: 'Waiting for wake word', tone: 'neutral' },
  starting: { label: 'Waking up', tone: 'accent' },
  connecting: { label: 'Connecting', tone: 'accent' },
  listening: { label: 'Listening', tone: 'ok' },
  speaking: { label: 'Speaking', tone: 'accent' },
  followup: { label: 'Waiting for follow-up', tone: 'ok' },
  closing: { label: 'Ending session', tone: 'neutral' },
  error: { label: 'Error, retrying soon', tone: 'danger' },
};

export const assistantLabel = (snapshot) => {
  const st = ASSISTANT_STATES[snapshot.assistant.state] || ASSISTANT_STATES.idle;
  return snapshot.assistant.profile ? `${st.label} · ${snapshot.assistant.profile}` : st.label;
};

const QUICK_GENRES = [
  { label: 'Lofi chill', query: 'lofi hip hop beats to relax' },
  { label: 'Synthwave', query: 'synthwave retrowave mix' },
  { label: 'Top Hits', query: 'today top hits' },
  { label: 'Focus', query: 'deep focus instrumental' },
];

function NowPlaying() {
  const { snapshot, online, act, currentTrack } = useNexus();
  const info = useTrackInfo(currentTrack);
  const { music } = snapshot;
  // The speaker the music plays on (the board's, or a hub speaker's own).
  const { activeVolume: volume } = useAudioOutputs();
  const playing = music.state === 'PLAYING';
  const hasTrack = !!(currentTrack?.id || currentTrack?.title);

  if (!hasTrack) {
    return (
      <Card className="now-card">
        <div className="ready-hero">
          <div className="ready-icon">
            <Music2 size={32} />
          </div>
          <div className="ready-content">
            <span className="eyebrow">Acoustic Player Ready</span>
            <h2 className="now-title">What do you want to hear?</h2>
            <p className="muted small">
              Pick a vibe below, <a href="#/music" className="link">search the library</a>, or say the wake word.
            </p>
            <div className="chips ready-chips">
              {QUICK_GENRES.map((g) => (
                <a key={g.label} href="#/music" className="chip">
                  {g.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="now-card">
      <div className="now">
        <TrackArt id={currentTrack.id} size="xl" />
        <div className="now-body">
          <span className="eyebrow">{playing ? 'Now playing' : music.state === 'PAUSED' ? 'Paused' : music.state.toLowerCase()}</span>
          <h2 className="now-title">{info.title || currentTrack.id}</h2>
          <p className="now-artist">{info.artist}</p>

          <div className="now-controls-row">
            <div className="now-actions">
              <button
                className="play-btn play-btn-lg"
                disabled={!online}
                onClick={() => act(playing ? 'pause' : 'resume')}
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <IconButton icon={SkipForward} label="Next" disabled={!online} onClick={() => act('next')} />
              <OutputPicker />
            </div>

            <div className="now-volume">
              <Volume2 size={16} className="muted" />
              <CommitSlider
                min={0}
                max={100}
                value={volume.value}
                disabled={!online}
                onCommit={volume.commit}
                aria-label="Volume"
              />
              <span className="mono small">{volume.value}%</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CommandStrip() {
  const { online, controls } = useNexus();
  const { micMuted, led } = controls;
  const { data: alarms } = usePoll(getAlarms, 60000);
  const now = Date.now() / 1000;
  const next = (alarms || [])
    .filter((a) => a.kind !== 'timer' && a.enabled && a.next_fire)
    .sort((a, b) => a.next_fire - b.next_fire)[0];
  const ledOn = led.value.mode !== 0;
  const ledModeName = LED_MODES[led.value.mode] || 'solid';

  return (
    <div className="cmd-strip">
      <button
        type="button"
        className={clsx('cmd-tile', !micMuted.value ? 'cmd-ok' : 'cmd-danger')}
        disabled={!online}
        onClick={() => micMuted.commit(!micMuted.value)}
      >
        <div className="cmd-icon">
          {micMuted.value ? <MicOff size={18} /> : <Mic size={18} />}
        </div>
        <div className="cmd-text">
          <span className="cmd-title">{micMuted.value ? 'Mic: Muted' : 'Mic: Listening'}</span>
          <span className="cmd-sub">{micMuted.value ? 'Wake word ignored' : 'Wake word active'}</span>
        </div>
      </button>

      <button
        type="button"
        className={clsx('cmd-tile', ledOn && 'cmd-accent')}
        disabled={!online}
        onClick={() => led.commit({ ...led.value, mode: ledOn ? 0 : LED_MODES.indexOf('solid') })}
      >
        <div className="cmd-icon">
          {ledOn ? <Lightbulb size={18} /> : <LightbulbOff size={18} />}
        </div>
        <div className="cmd-text">
          <span className="cmd-title">{ledOn ? `Light: ${ledModeName}` : 'Light: Off'}</span>
          <span className="cmd-sub">{ledOn ? 'WS2812 ring on' : 'Tap to turn on'}</span>
        </div>
      </button>

      <a href="#/schedules" className="cmd-tile">
        <div className="cmd-icon">
          <AlarmClock size={18} />
        </div>
        <div className="cmd-text">
          <span className="cmd-title">{next ? `Alarm: ${timeOf(next)}` : 'No Alarms'}</span>
          <span className="cmd-sub">{next ? formatUntil(next.next_fire - now) : 'Tap to view schedules'}</span>
        </div>
      </a>
    </div>
  );
}

function AssistantStatus() {
  const { snapshot } = useNexus();
  const st = ASSISTANT_STATES[snapshot.assistant.state] || ASSISTANT_STATES.idle;
  const active = snapshot.assistant.state !== 'idle';
  return (
    <Card title="Assistant" icon={Sparkles} action={<a className="link" href="#/assistant">Open <ChevronRight size={14} /></a>}>
      <div className="assistant-status">
        <div className={clsx('orb', active && `orb-${snapshot.assistant.state}`)} />
        <div>
          <Pill tone={st.tone} pulse={active}>{assistantLabel(snapshot)}</Pill>
          <p className="muted small">Say the wake word to start a conversation, or open chat.</p>
        </div>
      </div>
    </Card>
  );
}

function Health() {
  const { snapshot, online } = useNexus();
  return (
    <Card title="Device health" icon={Activity} action={<a className="link" href="#/system">System <ChevronRight size={14} /></a>}>
      {!online ? (
        <p className="muted small">The device is offline.</p>
      ) : (
        <div className="stats-grid">
          <Stat label="CPU 0" value={`${snapshot.c0}%`}><Meter value={snapshot.c0} /></Stat>
          <Stat label="CPU 1" value={`${snapshot.c1}%`}><Meter value={snapshot.c1} /></Stat>
          <Stat label="Free SRAM" value={formatBytes(snapshot.sram)} hint={`low ${formatBytes(snapshot.min_sram)}`} />
          <Stat label="Free PSRAM" value={formatBytes(snapshot.psram)} />
          <Stat label="Wi-Fi" value={signalLabel(snapshot.rssi)} hint={snapshot.rssi ? `${snapshot.rssi} dBm` : ''} />
          <Stat label="Uptime" value={formatUptime(snapshot.up)} />
        </div>
      )}
    </Card>
  );
}

function UpNext() {
  const { snapshot } = useNexus();
  const { queue, queue_length: total } = snapshot.music;

  if (queue.length === 0) return null;

  return (
    <Card
      title="Up next"
      icon={ListMusic}
      action={<a className="link" href="#/music/queue">Queue <ChevronRight size={14} /></a>}
    >
      <ol className="mini-list">
        {queue.slice(0, 4).map((t, i) => (
          <li key={`${t.id}-${i}`}>
            <TrackArt id={t.id} size="sm" />
            <div className="mini-text">
              <span className="ellipsis">{t.title}</span>
              <span className="muted small ellipsis">{t.artist}</span>
            </div>
          </li>
        ))}
        {total > 4 && <li className="muted small more">+{total - 4} more</li>}
      </ol>
    </Card>
  );
}

export default function Home() {
  return (
    <div className="home-layout">
      {/* Zone 1: Sound Stage */}
      <NowPlaying />

      {/* Zone 2: Command Strip */}
      <CommandStrip />

      {/* Zone 3: Dual Operations */}
      <div className="home-split">
        <AssistantStatus />
        <Health />
      </div>

      {/* Zone 4: Up Next (if any) */}
      <UpNext />
    </div>
  );
}
