import React from 'react';
import clsx from 'clsx';
import {
  Play, Pause, SkipForward, ListMusic, AlarmClock, Sparkles, Activity, Mic, MicOff, Lightbulb, LightbulbOff, Volume2, ChevronRight,
} from 'lucide-react';
import { Card, Empty, Meter, Pill, Stat, IconButton } from '../components/ui';
import CommitSlider from '../components/CommitSlider';
import { TrackArt, useTrackInfo } from '../components/Track';
import { useNexus, LED_MODES } from '../DeviceContext';
import { usePoll } from '../hooks/usePoll';
import { getAlarms } from '../lib/api';
import { formatBytes, formatIn, formatUptime, minutesUntil, pad2, signalLabel } from '../lib/format';

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

function NowPlaying() {
  const { snapshot, online, act, currentTrack } = useNexus();
  const info = useTrackInfo(currentTrack);
  const { music } = snapshot;
  const playing = music.state === 'PLAYING';
  const hasTrack = !!(currentTrack?.id || currentTrack?.title);

  if (!hasTrack) {
    return (
      <Card className="now-card">
        <Empty icon={Play} title="Nothing playing">
          <a href="#/music">Find something to play</a> or ask the assistant.
        </Empty>
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
          <div className="now-actions">
            <button className="play-btn play-btn-lg" disabled={!online} onClick={() => act(playing ? 'pause' : 'resume')} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <IconButton icon={SkipForward} label="Next" disabled={!online} onClick={() => act('next')} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function UpNext() {
  const { snapshot } = useNexus();
  const { queue, queue_length: total } = snapshot.music;
  return (
    <Card
      title="Up next"
      icon={ListMusic}
      action={<a className="link" href="#/music/queue">Queue <ChevronRight size={14} /></a>}
    >
      {queue.length === 0 ? (
        <p className="muted small">The queue is empty. Autoplay picks similar songs when it runs out.</p>
      ) : (
        <ol className="mini-list">
          {queue.slice(0, 3).map((t, i) => (
            <li key={`${t.id}-${i}`}>
              <TrackArt id={t.id} size="sm" />
              <div className="mini-text">
                <span className="ellipsis">{t.title}</span>
                <span className="muted small ellipsis">{t.artist}</span>
              </div>
            </li>
          ))}
          {total > 3 && <li className="muted small more">+{total - 3} more</li>}
        </ol>
      )}
    </Card>
  );
}

function NextAlarm() {
  const { data: alarms } = usePoll(getAlarms, 60000);
  const enabled = (alarms || []).filter((a) => a.enabled);
  const next = enabled.map((a) => ({ ...a, inMin: minutesUntil(a.hour, a.minute) })).sort((a, b) => a.inMin - b.inMin)[0];
  return (
    <Card title="Next alarm" icon={AlarmClock} action={<a className="link" href="#/alarms">Alarms <ChevronRight size={14} /></a>}>
      {next ? (
        <div className="big-time">
          <span className="mono">{pad2(next.hour)}:{pad2(next.minute)}</span>
          <span className="muted small">{formatIn(next.inMin)}</span>
        </div>
      ) : (
        <p className="muted small">No alarms set.</p>
      )}
    </Card>
  );
}

function AssistantStatus() {
  const { snapshot } = useNexus();
  const st = ASSISTANT_STATES[snapshot.assistant.state] || ASSISTANT_STATES.idle;
  const active = snapshot.assistant.state !== 'idle';
  return (
    <Card title="Assistant" icon={Sparkles} action={<a className="link" href="#/assistant">Settings <ChevronRight size={14} /></a>}>
      <div className="assistant-status">
        <div className={clsx('orb', active && `orb-${snapshot.assistant.state}`)} />
        <div>
          <Pill tone={st.tone} pulse={active}>{st.label}</Pill>
          <p className="muted small">Say the wake word to start a conversation.</p>
        </div>
      </div>
    </Card>
  );
}

function QuickControls() {
  const { online, controls } = useNexus();
  const { volume, micMuted, led } = controls;
  const ledOn = led.value.mode !== 0;
  return (
    <Card title="Quick controls">
      <div className="quick">
        <div className="quick-volume">
          <Volume2 size={18} />
          <CommitSlider min={0} max={100} value={volume.value} disabled={!online} onCommit={volume.commit} aria-label="Volume" />
          <span className="mono small">{volume.value}%</span>
        </div>
        <div className="quick-toggles">
          <button className={clsx('chip-toggle', !micMuted.value && 'is-on')} disabled={!online} onClick={() => micMuted.commit(!micMuted.value)}>
            {micMuted.value ? <MicOff size={16} /> : <Mic size={16} />} {micMuted.value ? 'Mic off' : 'Mic on'}
          </button>
          <button
            className={clsx('chip-toggle', ledOn && 'is-on')}
            disabled={!online}
            onClick={() => led.commit({ ...led.value, mode: ledOn ? 0 : LED_MODES.indexOf('solid') })}
          >
            {ledOn ? <Lightbulb size={16} /> : <LightbulbOff size={16} />} {ledOn ? 'Light on' : 'Light off'}
          </button>
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

export default function Home() {
  return (
    <div className="home-grid">
      <div className="home-main">
        <NowPlaying />
        <div className="two-col">
          <AssistantStatus />
          <NextAlarm />
        </div>
        <Health />
      </div>
      <div className="home-side">
        <QuickControls />
        <UpNext />
      </div>
    </div>
  );
}
