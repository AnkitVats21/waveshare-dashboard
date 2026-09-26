import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDevice } from './hooks/useDevice';
import { usePendingValue } from './hooks/usePendingValue';
import { getHost, setHost as persistHost, playStream, resolveStreamUrl } from './lib/api';

const DeviceContext = createContext(null);

export const LED_MODES = ['off', 'solid', 'blink', 'breath', 'rainbow'];

const ledEqual = (a, b) =>
  a.mode === b.mode && a.speed_ms === b.speed_ms &&
  a.color.r === b.color.r && a.color.g === b.color.g && a.color.b === b.color.b;

// A track the user just started is shown immediately, before the device's
// next snapshot confirms it (stream resolution takes a few seconds).
const TRACK_OPTIMISM_MS = 8000;

export function DeviceProvider({ children }) {
  const [host, setHostState] = useState(getHost());
  const { snapshot, online, send, transcript } = useDevice(host);
  const [optimisticTrack, setOptimisticTrack] = useState(null);

  const setHost = useCallback((h) => setHostState(persistHost(h)), []);

  useEffect(() => {
    if (!optimisticTrack) return undefined;
    if (snapshot.music.current_track?.id === optimisticTrack.id) {
      setOptimisticTrack(null);
      return undefined;
    }
    const t = setTimeout(() => setOptimisticTrack(null), TRACK_OPTIMISM_MS);
    return () => clearTimeout(t);
  }, [optimisticTrack, snapshot.music.current_track?.id]);

  const volume = usePendingValue(snapshot.state.speaker_volume, (v) => send('volume', { value: v }));
  const micGain = usePendingValue(snapshot.state.mic_gain_db, (v) => send('mic_gain', { value: v }));
  const micMuted = usePendingValue(!snapshot.state.mic_enabled, (v) => send('mic_mute', { value: v }));
  const repeat = usePendingValue(snapshot.music.repeat_mode, (v) => send('action', { action: 'repeat', value: v }));
  const autoplay = usePendingValue(snapshot.music.autoplay, (v) => send('action', { action: 'autoplay', value: v }));
  const caching = usePendingValue(snapshot.music.caching, (v) => send('action', { action: 'caching', value: v }));
  const led = usePendingValue(
    snapshot.led,
    (v) => send('led', { mode: LED_MODES[v.mode] || 'off', color: v.color, speed_ms: v.speed_ms }),
    ledEqual,
  );

  const act = useCallback((action, extra = {}) => send('action', { action, ...extra }), [send]);

  // track: {id, title, artist, duration}. Resolves the stream in the browser,
  // then hands the URL to the device; falls back to a device-side search.
  const playTrack = useCallback(async (track) => {
    setOptimisticTrack(track);
    try {
      const url = await resolveStreamUrl(track.id);
      await playStream(track, url);
    } catch (err) {
      console.warn('Direct playback failed, asking the device to search instead:', err);
      act('play', { data: `${track.title} ${track.artist || ''}`.trim() });
    }
  }, [act]);

  const queueTrack = useCallback((track, front = false) =>
    act('queue_add', { id: track.id, title: track.title, artist: track.artist, duration: track.duration || 0, front }), [act]);

  const value = useMemo(() => ({
    host,
    setHost,
    online,
    snapshot,
    transcript,
    send,
    act,
    playTrack,
    queueTrack,
    setOptimisticTrack,
    currentTrack: optimisticTrack || snapshot.music.current_track,
    controls: { volume, micGain, micMuted, repeat, autoplay, caching, led },
  }), [host, setHost, online, snapshot, transcript, send, act, playTrack, queueTrack, optimisticTrack,
    volume, micGain, micMuted, repeat, autoplay, caching, led]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export const useNexus = () => useContext(DeviceContext);
