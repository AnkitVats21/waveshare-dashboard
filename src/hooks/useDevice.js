import { useEffect, useRef, useState, useCallback } from 'react';
import { wsUrl } from '../lib/api';

const RECONNECT_MS = 3000;
const TRANSCRIPT_KEEP = 100;   // entries kept in the browser; the device keeps 32

export const EMPTY_SNAPSHOT = {
  connected: false,
  up: 0,
  c0: 0,
  c1: 0,
  sram: 0,
  psram: 0,
  rssi: 0,
  rx: 0,   // Wi-Fi bytes received since boot (wraps at 4 GB)
  tx: 0,
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
    cache: { state: 'none' },   // the current song on the card: none | saving | saved
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
//
// The transcript is subscribed on connect: the device sends every entry it
// has, then {"type":"transcript","entries"} with the entries that changed.
// `transcript` is [{id, role: 'user'|'model', t_ms, done, text}], oldest first.
export function useDevice(host) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [online, setOnline] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const wsRef = useRef(null);
  const entriesRef = useRef(new Map());

  useEffect(() => {
    let destroyed = false;
    let timer = null;

    const connect = () => {
      if (destroyed) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (destroyed) return;
        setOnline(true);
        // The device resends everything it has, and its ids restart after a
        // reboot, so start from empty.
        entriesRef.current = new Map();
        setTranscript([]);
        ws.send(JSON.stringify({ cmd: 'subscribe', transcript: true }));
      };
      ws.onmessage = (evt) => {
        if (destroyed) return;
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'transcript') {
            const map = entriesRef.current;
            for (const e of data.entries || []) map.set(e.id, e);
            const all = [...map.values()].sort((a, b) => a.id - b.id);
            const kept = all.slice(-TRANSCRIPT_KEEP);
            if (kept.length < all.length) entriesRef.current = new Map(kept.map((e) => [e.id, e]));
            setTranscript(kept);
            return;
          }
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

  return { snapshot, online, send, transcript };
}
