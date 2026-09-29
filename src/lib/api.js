// Device host + REST calls.
//
// Live state and commands go over the device WebSocket (/api/ws, see
// hooks/useDevice.js). Everything one-shot (library, alarms, config, files,
// OTA, logs) uses the REST API below. Search and stream-URL resolution hit the
// Invidious-compatible resolver directly from the browser.

import { readNdb } from './ndb';
import { NDB_SCHEMAS } from './ndb_schema';

// The device build (`npm run bundle`, served by the ESP itself) talks to the
// host it was loaded from; dev builds default to the fixed LAN address.
const DEFAULT_HOST = import.meta.env.MODE === 'device' ? window.location.host : '192.168.1.14';
const STREAM_API_BASE = 'https://stream.ankitm.xyz/api/v1';
const HOST_KEY = 'nexus_host';

export const isDeviceBuild = import.meta.env.MODE === 'device';

function cleanHost(host) {
  return host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function getHost() {
  try {
    return localStorage.getItem(HOST_KEY) || DEFAULT_HOST;
  } catch {
    return DEFAULT_HOST;
  }
}

export function setHost(host) {
  const clean = cleanHost(host);
  try {
    localStorage.setItem(HOST_KEY, clean);
  } catch {
    // Private mode: the choice just won't persist.
  }
  return clean;
}

const base = () => `http://${getHost()}`;
export const wsUrl = () => `ws://${getHost()}/api/ws`;

async function request(path, { method = 'GET', json, body, headers, raw = false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (json !== undefined) {
    opts.body = JSON.stringify(json);
    opts.headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    opts.body = body;
  }
  const res = await fetch(`${base()}${path}`, opts);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // Not JSON; keep the status text.
    }
    throw new Error(message);
  }
  const text = await res.text();
  if (raw) return text;
  return text ? JSON.parse(text) : null;
}

const q = (params) => new URLSearchParams(params).toString();

// ── Search / stream resolution (browser -> resolver) ──────────────────────

export async function searchYouTube(query) {
  if (!query || !query.trim()) return [];
  const res = await fetch(`${STREAM_API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// A YouTube mix (radio) seeded by one song: [{videoId, title, author,
// lengthSeconds}]. The resolver runs yt-dlp for it, ~10 s.
export async function getMix(videoId) {
  const res = await fetch(`${STREAM_API_BASE}/mixes/RD${encodeURIComponent(videoId)}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return ((await res.json()).videos || []).filter((v) => v.videoId && v.videoId !== videoId);
}

export async function resolveStreamUrl(videoId) {
  const res = await fetch(`${STREAM_API_BASE}/videos/${encodeURIComponent(videoId)}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const formats = (await res.json()).adaptiveFormats || [];
  const pick =
    formats.find((f) => f.type?.includes('opus')) ||
    formats.find((f) => f.type?.includes('audio/webm')) ||
    formats.find((f) => f.type?.startsWith('audio/')) ||
    formats[0];
  if (!pick?.url) throw new Error('No playable audio stream found for this video');
  return pick.url;
}

// ── Music ──────────────────────────────────────────────────────────────────

// The library is music.ndb itself, decoded here (lib/ndb.js): every song
// played or found on the card. `cached` is false for a song whose file isn't
// (or is no longer) on the card; it plays by streaming. Most recent first.
// Filtering reuses the last fetch.
let libraryCache = null;

function filterTracks(tracks, filter) {
  const f = filter.trim().toLowerCase();
  if (!f) return tracks;
  return tracks.filter((t) => [t.title, t.artist, t.id].some((s) => s.toLowerCase().includes(f)));
}

export async function getLibrary(filter = '') {
  if (!filter || !libraryCache) {
    const res = await fetch(`${base()}/api/db/music`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'Library not ready yet' : `${res.status} ${res.statusText}`);
    const db = readNdb(await res.arrayBuffer(), NDB_SCHEMAS.music);
    libraryCache = [...db.collections.tracks]
      .map(([id, d]) => ({
        id,
        // Titles cut by the old catalog's fixed fields can end mid-character.
        title: d.title.replace(/\uFFFD+$/, ''),
        artist: d.artist,
        album: d.album,
        duration: Math.floor(d.duration_ms / 1000),
        size: d.file_size,
        cached: d.file_size > 0,
        has_thumb: d.thumbnail,
        added_at: d.added_at,
        last_played_at: d.last_played_at,
        play_count: d.play_count,
      }))
      .sort((a, b) => (b.last_played_at || b.added_at) - (a.last_played_at || a.added_at));
  }
  return filterTracks(libraryCache, filter);
}
export const scanLibrary = () => request('/api/music/library/scan', { method: 'POST' });
export const deleteFromLibrary = (id) => request(`/api/music/library?${q({ id })}`, { method: 'DELETE' });
export const clearUnsavedHistory = () => request('/api/music/library?unsaved=1', { method: 'DELETE' });
export const playLocal = (idOrPath) => request('/api/music/play_local', { method: 'POST', json: { id: idOrPath } });

export const playStream = (track, streamUrl) =>
  request('/api/music/play', {
    method: 'POST',
    json: {
      stream_url: streamUrl,
      id: track.id || '',
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      duration: track.duration || 0,
    },
  });

// ── Audio ──────────────────────────────────────────────────────────────────


// Alert chimes: settings live in system.ndb on the device. Each POST returns
// { alert } with the alert's new state.
export const getAlerts = () => request('/api/alerts');
export const updateAlert = (name, changes) => request(`/api/alerts/${name}`, { method: 'POST', json: changes });
export const previewAlert = (name) => request(`/api/alerts/${name}/play`, { method: 'POST' });
export const resetAlert = (name) => request(`/api/alerts/${name}/reset`, { method: 'POST' });
export const uploadAlert = (name, file) =>
  request(`/api/alerts/${name}/upload?${q({ file: file.name })}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  });

// ── Recordings ─────────────────────────────────────────────────────────────

export const RECORDINGS_DIR = '/sdcard/recordings';
export const RECORDING_MODES = { 0: 'unknown', 1: 'stereo', 2: 'processed' };

// The list is recordings.ndb itself, decoded here (lib/ndb.js), newest first.
// Each entry: {id, file, started, duration_ms, mode, sample_rate, channels, size}.
export async function getRecordings() {
  const res = await fetch(`${base()}/api/db/recordings`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'Recordings list not ready yet' : `${res.status} ${res.statusText}`);
  const db = readNdb(await res.arrayBuffer(), NDB_SCHEMAS.recordings);
  return [...db.collections.recordings]
    .map(([key, doc]) => ({ id: Number(key), ...doc }))
    .sort((a, b) => (b.started - a.started) || (b.id - a.id));
}
// The file with Range support, so <audio> can seek.
export const recordingUrl = (file) => `${base()}/api/files/download?${q({ path: `${RECORDINGS_DIR}/${file}` })}`;
// Saves the file in the browser. Through a Blob because <a download> is
// ignored across origins (dev builds load from another host than the device).
export async function downloadRecording(file) {
  const res = await fetch(recordingUrl(file));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Returns {status, id, file}; the name keeps the file's extension.
// Plays on the device's speaker, like a song (the player bar controls it).
export const playRecordingOnDevice = (id) => request('/api/recordings/play', { method: 'POST', json: { id } });
// The player's track id while a recording plays on the device.
export const recordingTrackId = (id) => `file:${id}`;
export const renameRecording = (id, name) => request('/api/recordings/rename', { method: 'POST', json: { id, name } });
export const deleteRecording = (id) => request(`/api/recordings?${q({ id })}`, { method: 'DELETE' });
// mode: 'stereo' (both mics) or 'processed' (the AFE output).
export const startRecording = (mode) => request(`/api/audio/record/start?${q({ mode })}`, { method: 'POST' });
export const stopRecording = () => request('/api/audio/record/stop', { method: 'POST' });

// ── Alarms ─────────────────────────────────────────────────────────────────

// Alarms and timers (kind "timer") share /api/alarms. POST without an id
// creates; with one it updates only the fields sent. Each returns the saved row.
export const getAlarms = () => request('/api/alarms');
export const saveAlarm = (alarm) => request('/api/alarms', { method: 'POST', json: alarm });
export const deleteAlarm = (id) => request(`/api/alarms?${q({ id })}`, { method: 'DELETE' });
export const getAlarmStatus = () => request('/api/alarms/status');
export const stopAlarm = () => request('/api/alarms/stop', { method: 'POST' });
export const snoozeAlarm = () => request('/api/alarms/snooze', { method: 'POST' });
// Rings now for up to limitS seconds; tone setting string, '' = built-in.
export const testRing = (tone, limitS = 20, extra = {}) =>
  request('/api/alarms/ring', { method: 'POST', json: { tone, ring_limit_s: limitS, ...extra } });
export const getAlarmTones = () => request('/api/alarms/tones');
export const uploadToneFile = (name, file) =>
  request(`/api/files/upload?${q({ path: `/sdcard/media/alarm/${name}` })}`, {
    method: 'POST',
    body: file,
  });
export const deleteToneFile = (name) => deleteFile(`/sdcard/media/alarm/${name}`);
export const renameToneFile = (from, to) =>
  request('/api/files/rename', {
    method: 'POST',
    json: { old_path: `/sdcard/media/alarm/${from}`, new_path: `/sdcard/media/alarm/${to}` },
  });
export const startYouTubeTone = ({ id, title, artist }) =>
  request('/api/alarms/tones/youtube', { method: 'POST', json: { id, title, artist } });
export const getYouTubeToneStatus = () => request('/api/alarms/tones/youtube');

export const getBriefingMusic = () => request('/api/alarms/briefing');
export const saveBriefingMusic = ({ music, duck }) => {
  const json = {};
  if (music !== undefined) json.music = music;
  if (duck !== undefined) json.duck = Number(duck);
  return request('/api/alarms/briefing', { method: 'POST', json });
};
export const playAlarmMedia = (nameOrPath) => {
  const path = nameOrPath.startsWith('/') ? nameOrPath : `/sdcard/media/alarm/${nameOrPath}`;
  return request(`/api/music/play_local?${q({ path })}`, { method: 'POST' });
};
export const stopMusic = () => request('/api/music/control', { method: 'POST', json: { action: 'stop' } });

export const getReminders = () => request('/api/reminders');
export const saveReminder = (reminder) => request('/api/reminders', { method: 'POST', json: reminder });
export const deleteReminder = (id) => request(`/api/reminders?${q({ id })}`, { method: 'DELETE' });
export const ackReminder = (id) => request(`/api/reminders/ack?${q({ id })}`, { method: 'POST' });

// Device clock: {epoch, local, timezone, valid, source, last_ntp_sync?, ntp}.
export const getTime = () => request('/api/time');
export const setTime = (epoch, timezone) =>
  request('/api/time', { method: 'POST', json: timezone ? { epoch, timezone } : { epoch } });
export const syncTime = () => request('/api/time/sync', { method: 'POST' });

// ── Assistant ──────────────────────────────────────────────────────────────

export const getAssistantConfig = () => request('/api/config/gemini');
export const getAssistantModels = () => request('/api/config/gemini/models');
export const saveAssistantConfig = (config) => request('/api/config/gemini', { method: 'POST', json: config });
// MCP (Model Context Protocol) remote skills
export const getMcpStatus = () => request('/api/mcp');
export const saveMcpConfig = ({ url, max_tools, token }) => {
  const json = {};
  if (url !== undefined) json.url = url;
  if (max_tools !== undefined) json.max_tools = Number(max_tools);
  if (token !== undefined && token !== '') json.token = token;
  return request('/api/mcp', { method: 'POST', json });
};
export const refreshMcpTools = () => request('/api/mcp/refresh', { method: 'POST' });
// Start: a conversation as if the wake word was heard, with the longer
// silence timeout (manual_silence_s). Stop: ends it in any state.
export const startConversation = () => request('/api/assistant/start', { method: 'POST' });
export const stopConversation = () => request('/api/assistant/stop', { method: 'POST' });

export const MEMORY_FILE = '/sdcard/gemini_memory.txt';
export const NOTES_DIR = '/sdcard/notes';

// ── Files ──────────────────────────────────────────────────────────────────

export const listFiles = (path) => request(`/api/files?${q({ path })}`);
export const readTextFile = (path) => request(`/api/files/download?${q({ path })}`, { raw: true });
export const writeTextFile = (path, text) =>
  request(`/api/files/upload?${q({ path })}`, { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' } });
export const deleteFile = (path) => request(`/api/files?${q({ path })}`, { method: 'DELETE' });

// ── System ─────────────────────────────────────────────────────────────────

export const getMetrics = () => request('/api/system/metrics');
export const getStorageInfo = () => request('/api/storage/info');
// Partitions with offset, size and (where known) used bytes, version, detail.
export const getFlashInfo = () => request('/api/system/flash');
export const getFirmwareStatus = () => request('/api/ota/status');
export const getFrontendStatus = () => request('/api/ota/frontend');
export const rollbackFrontend = () => request('/api/ota/frontend/rollback', { method: 'POST' });
export const reboot = () => request('/api/system/reboot', { method: 'POST' });
export const getLogs = (since = 0) => request(`/api/logs?${q({ since })}`);

// Uploads a firmware image; XHR rather than fetch for upload progress.
export function uploadFirmware(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base()}/api/ota`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Keep null.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.message || `${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.send(file);
  });
}
