import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Radio, Volume2, Volume1, VolumeX, Loader2,
  RotateCcw, RotateCw, Square, ExternalLink,
} from 'lucide-react';
import CommitSlider from './CommitSlider';
import { IconButton } from './ui';
import { TrackArt, useTrackInfo } from './Track';
import { useNexus } from '../DeviceContext';
import { formatClock } from '../lib/format';
import { looksLikeVideoId } from '../lib/trackMetadata';

const REPEAT_LABELS = ['Repeat: off', 'Repeat: this track', 'Repeat: all'];

const SKIP_MS = 10000;
// After a seek, snapshots far from the target are ignored for this long: one
// sent before the seek landed would pull the bar back to the old position.
const SEEK_SETTLE_MS = 4000;

// Position that ticks locally between the device's ~2 s snapshots. jump(ms)
// moves it at once after a seek.
function useLivePosition(music, playing) {
  const [pos, setPos] = useState(music.position_ms || 0);
  const seek = useRef(null);  // { target, at }
  useEffect(() => {
    const p = music.position_ms || 0;
    const s = seek.current;
    if (s) {
      const age = Date.now() - s.at;
      const expected = s.target + (playing ? age : 0);
      if (age < SEEK_SETTLE_MS && Math.abs(p - expected) > 3000) return;
      seek.current = null;
    }
    setPos(p);
  }, [music.position_ms]);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setPos((p) => (music.duration_ms > 0 ? Math.min(p + 500, music.duration_ms) : p + 500));
    }, 500);
    return () => clearInterval(id);
  }, [playing, music.duration_ms]);
  const jump = (ms) => {
    seek.current = { target: ms, at: Date.now() };
    setPos(ms);
  };
  return [pos, jump];
}

export default function PlayerBar() {
  const { snapshot, online, act, currentTrack, controls } = useNexus();
  const { music } = snapshot;
  const { volume, repeat, autoplay } = controls;
  const playing = music.state === 'PLAYING';
  const busy = music.state === 'RESOLVING' || music.state === 'BUFFERING';
  const hasTrack = !!(currentTrack?.id || currentTrack?.title);
  const info = useTrackInfo(currentTrack);
  const [pos, jump] = useLivePosition(music, playing);
  const [dragPos, setDragPos] = useState(null);
  const hasDuration = music.duration_ms > 0;
  const canSeek = online && hasDuration && music.seekable;
  const seekTo = (ms) => {
    const v = Math.max(0, Math.min(Math.round(ms), music.duration_ms - 1000));
    jump(v);
    act('seek', { value: v });
  };
  const [lastVolume, setLastVolume] = useState(60);
  const disabled = !online;

  const toggleMute = () => {
    if (volume.value > 0) {
      setLastVolume(volume.value);
      volume.commit(0);
    } else {
      volume.commit(lastVolume || 60);
    }
  };

  const VolIcon = volume.value === 0 ? VolumeX : volume.value < 50 ? Volume1 : Volume2;
  const progress = hasDuration ? Math.min(100, (pos / music.duration_ms) * 100) : 0;

  return (
    <footer className={clsx('player', !hasTrack && 'is-empty', disabled && 'is-offline')}>
      <div className="player-progress-mobile" style={{ width: `${progress}%` }} />

      <div className="player-track">
        <TrackArt id={currentTrack?.id} size="sm" />
        <div className="player-text">
          <span className="player-title">{hasTrack ? info.title || currentTrack.id : 'Nothing playing'}</span>
          <span className="player-artist">
            {busy ? (
              <><Loader2 size={12} className="spin" /> {music.state === 'RESOLVING' ? 'Finding stream…' : 'Buffering…'}</>
            ) : hasTrack ? (
              info.artist
            ) : (
              'Search for a song or say the wake word'
            )}
          </span>
        </div>
        {looksLikeVideoId(currentTrack?.id) && (
          <IconButton
            icon={ExternalLink}
            label="Open on YouTube"
            size={16}
            onClick={() => window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(currentTrack.id)}`, '_blank', 'noopener')}
          />
        )}
      </div>

      <div className="player-center">
        <div className="player-transport">
          <IconButton
            icon={repeat.value === 1 ? Repeat1 : Repeat}
            label={REPEAT_LABELS[repeat.value] || REPEAT_LABELS[0]}
            active={repeat.value > 0}
            className="hide-mobile"
            disabled={disabled}
            onClick={() => repeat.commit((repeat.value + 1) % 3)}
          />
          <IconButton icon={SkipBack} label="Previous" className="hide-mobile" disabled={disabled} onClick={() => act('prev')} />
          <IconButton icon={RotateCcw} label="Back 10 s" className="hide-mobile" disabled={!canSeek} onClick={() => seekTo(pos - SKIP_MS)} />
          <button
            className="play-btn"
            onClick={() => act(playing ? 'pause' : 'resume')}
            disabled={disabled || !hasTrack}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <IconButton
            icon={Square}
            label="Stop (clears the queue)"
            className="hide-mobile"
            disabled={disabled || !hasTrack}
            onClick={() => act('stop')}
          />
          <IconButton icon={RotateCw} label="Forward 10 s" className="hide-mobile" disabled={!canSeek} onClick={() => seekTo(pos + SKIP_MS)} />
          <IconButton icon={SkipForward} label="Next" disabled={disabled} onClick={() => act('next')} />
          <IconButton
            icon={Radio}
            label={autoplay.value ? 'Autoplay similar songs: on' : 'Autoplay similar songs: off'}
            active={autoplay.value}
            className="hide-mobile"
            disabled={disabled}
            onClick={() => autoplay.commit(!autoplay.value)}
          />
        </div>
        <div className="player-scrub">
          <span className="mono time">{formatClock(dragPos ?? pos)}</span>
          <CommitSlider
            min={0}
            max={hasDuration ? music.duration_ms : 100}
            value={hasDuration ? Math.min(pos, music.duration_ms) : 0}
            disabled={!canSeek}
            onDrag={setDragPos}
            onCommit={seekTo}
            aria-label="Seek"
          />
          <span className="mono time">{hasDuration ? formatClock(music.duration_ms) : '--:--'}</span>
        </div>
      </div>

      <div className="player-volume">
        <IconButton icon={VolIcon} label={volume.value === 0 ? 'Unmute' : 'Mute'} disabled={disabled} onClick={toggleMute} />
        <CommitSlider min={0} max={100} value={volume.value} disabled={disabled} onCommit={volume.commit} aria-label="Volume" />
        <span className="mono time">{volume.value}%</span>
      </div>
    </footer>
  );
}

