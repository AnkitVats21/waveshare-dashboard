import { useEffect, useRef, useState, useCallback } from 'react';
import { wsUrl } from '../lib/api';

const RECONNECT_MS = 3000;

export const EMPTY_SNAPSHOT = {
  connected: false,
  up: 0,
  c0: 0,
  c1: 0,
  sram: 0,
  psram: 0,
  rssi: 0,
  state: { speaker_volume: 0, mic_gain_db: 0, mic_enabled: true, is_recording: false, sample_rate: 0 },
  led: { mode: 0, color: { r: 0, g: 0, b: 0 }, speed_ms: 500 },
  music: {
    state: 'IDLE',
    current_track: { id: '', title: '', artist: '', duration: 0 },
    position_ms: 0,
    duration_ms: 0,
    seekable: false,
    repeat_mode: 0,
    autoplay: true,
    caching: false,
    queue: [],
    queue_length: 0,
  },
  assistant: { state: 'idle', connection: 'disconnected' },
  alarm: { ringing: false, id: 0, state: 'idle' },
};

// Single WebSocket to the device control channel (/api/ws).
//
// The device pushes a full state snapshot on connect, after every change and
// every ~2 s. `send(cmd, payload)` sends {"cmd": cmd, ...payload}. The device
// accepts one client at a time; a newer connection takes over.
export function useDevice(host) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let destroyed = false;
    let timer = null;

    const connect = () => {
      if (destroyed) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => !destroyed && setOnline(true);
      ws.onmessage = (evt) => {
        if (destroyed) return;
        try {
          const data = JSON.parse(evt.data);
          // Merge over the defaults so older firmware (no queue/assistant) still renders.
          setSnapshot({
            ...EMPTY_SNAPSHOT,
            ...data,
            music: { ...EMPTY_SNAPSHOT.music, ...data.music },
            assistant: { ...EMPTY_SNAPSHOT.assistant, ...data.assistant },
            alarm: { ...EMPTY_SNAPSHOT.alarm, ...data.alarm },
          });
        } catch (e) {
          console.warn('[ws] parse error', e);
        }
      };
      ws.onclose = () => {
        setOnline(false);
        if (!destroyed) timer = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();
    return () => {
      destroyed = true;
      clearTimeout(timer);
      wsRef.current?.close();
      setOnline(false);
    };
  }, [host]);

  const send = useCallback((cmd, payload = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ cmd, ...payload }));
    return true;
  }, []);

  return { snapshot, online, send };
}
