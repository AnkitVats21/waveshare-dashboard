// Device host + REST calls.
//
// Live state and commands go over the device WebSocket (/api/ws, see
// hooks/useDevice.js). Everything one-shot (library, alarms, config, files,
// OTA, logs) uses the REST API below. Search and stream-URL resolution hit the
// Invidious-compatible resolver directly from the browser.

import { CATALOG_PATH, filterTracks, parseCatalog } from './catalog';

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

// The library is the raw catalog file, parsed here (lib/catalog.js).
// Filtering reuses the last fetch.
let libraryCache = null;

export async function getLibrary(filter = '') {
  if (!filter || !libraryCache) {
    const res = await fetch(`${base()}/api/files/download?${q({ path: CATALOG_PATH })}`);
    if (res.status === 404) {
      libraryCache = [];
    } else if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    } else {
      libraryCache = parseCatalog(await res.arrayBuffer());
    }
  }
  return filterTracks(libraryCache, filter);
}
export const scanLibrary = () => request('/api/music/library/scan', { method: 'POST' });
export const deleteFromLibrary = (id) => request(`/api/music/library?${q({ id })}`, { method: 'DELETE' });
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

export const playChime = () => request('/api/audio/alert', { method: 'POST' });

// ── Alarms ─────────────────────────────────────────────────────────────────

export const getAlarms = () => request('/api/alarms');
export const saveAlarm = (alarm) => request('/api/alarms', { method: 'POST', json: alarm });
export const deleteAlarm = (id) => request(`/api/alarms?${q({ id })}`, { method: 'DELETE' });
export const stopAlarm = () => request('/api/alarms/stop', { method: 'POST' });

// ── Assistant ──────────────────────────────────────────────────────────────

export const getAssistantConfig = () => request('/api/config/gemini');
export const saveAssistantConfig = (config) => request('/api/config/gemini', { method: 'POST', json: config });

export const MEMORY_FILE = '/sdcard/gemini_memory.txt';
export const NOTES_DIR = '/sdcard/notes';
export const ALARM_TONES_DIR = '/sdcard/alarms';

// ── Files ──────────────────────────────────────────────────────────────────

export const listFiles = (path) => request(`/api/files?${q({ path })}`);
export const readTextFile = (path) => request(`/api/files/download?${q({ path })}`, { raw: true });
export const writeTextFile = (path, text) =>
  request(`/api/files/upload?${q({ path })}`, { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' } });
export const deleteFile = (path) => request(`/api/files?${q({ path })}`, { method: 'DELETE' });

// ── System ─────────────────────────────────────────────────────────────────

export const getMetrics = () => request('/api/system/metrics');
export const getStorageInfo = () => request('/api/storage/info');
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
