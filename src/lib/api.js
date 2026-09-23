// Host configuration + REST calls.
//
// Single gateway: the Nexus device itself (advertised over mDNS as nexus.local).
// Live state/commands go over its WebSocket (/api/ws, one client at a time,
// newest connection takes over); one-shot operations (SD library, alert chime,
// direct stream playback) use its REST API.
//
// Search + stream-URL resolution hit the Invidious-compatible stream resolver
// directly from the browser.

// The device build (`npm run bundle`, served by the ESP itself) talks to the
// host it was loaded from; dev/Docker builds default to the mDNS name.
const DEFAULT_GATEWAY_HOST = import.meta.env.MODE === 'device' ? window.location.host : 'nexus.local';
const STREAM_API_BASE = 'https://stream.ankitm.xyz/api/v1';

function cleanHost(host) {
  return host.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function getGatewayHost() {
  return localStorage.getItem('gateway_host') ||
         localStorage.getItem('daemon_host') ||
         DEFAULT_GATEWAY_HOST;
}

export function setGatewayHost(host) {
  const clean = cleanHost(host);
  localStorage.setItem('gateway_host', clean);
  localStorage.setItem('daemon_host', clean);
  localStorage.setItem('esp_host', clean);
  return clean;
}

export function getEspHost() {
  return getGatewayHost();
}

export function setEspHost(host) {
  return setGatewayHost(host);
}

export function getDaemonHost() {
  return getGatewayHost();
}

export function setDaemonHost(host) {
  return setGatewayHost(host);
}

export function getGatewayBaseUrl() {
  return `http://${getGatewayHost()}`;
}

export function getEspBaseUrl() {
  return getGatewayBaseUrl();
}

export function getDaemonBaseUrl() {
  return getGatewayBaseUrl();
}

export function getDaemonWsUrl() {
  return `ws://${getGatewayHost()}/api/ws`;
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Search / stream resolution (one-shot, browser -> resolver directly) ────

export async function searchYouTube(query) {
  if (!query || !query.trim()) return [];
  return fetchJson(`${STREAM_API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
}

export async function resolveStreamUrl(videoId) {
  const data = await fetchJson(`${STREAM_API_BASE}/videos/${encodeURIComponent(videoId)}`);
  const formats = data.adaptiveFormats || [];

  const opusFormat = formats.find((f) => f.type && f.type.includes('opus'));
  if (opusFormat && opusFormat.url) return opusFormat.url;

  const webmFormat = formats.find((f) => f.type && f.type.includes('audio/webm'));
  if (webmFormat && webmFormat.url) return webmFormat.url;

  const audioFormat = formats.find((f) => f.type && f.type.startsWith('audio/'));
  if (audioFormat && audioFormat.url) return audioFormat.url;

  if (formats.length > 0 && formats[0].url) return formats[0].url;

  throw new Error('No playable audio stream found for video');
}

// ── SD library (one-shot, browser -> ESP directly) ──────────────────────────

export async function getMusicLibrary(filter = '') {
  const query = filter ? `?q=${encodeURIComponent(filter)}` : '';
  return fetchJson(`${getEspBaseUrl()}/api/music/library${query}`);
}

export async function scanMusicLibrary() {
  return fetchJson(`${getEspBaseUrl()}/api/music/library/scan`, { method: 'POST' });
}

export async function deleteFromLibrary(id) {
  return fetchJson(`${getEspBaseUrl()}/api/music/library?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function playLocalOnEsp(idOrPath) {
  return fetchJson(`${getEspBaseUrl()}/api/music/play_local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: idOrPath }),
  });
}

export async function playStreamOnEsp(track, streamUrl) {
  return fetchJson(`${getEspBaseUrl()}/api/music/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stream_url: streamUrl,
      id: track.id || track.videoId || '',
      title: track.title || 'Unknown Title',
      artist: track.artist || track.author || 'Unknown Artist',
      duration: track.duration || track.lengthSeconds || 0,
    }),
  });
}

// ── Alert chime (one-shot, browser -> ESP directly) ─────────────────────────
//
// Deviation from brief: the daemon's WAL wire protocol (StarProtocol.h /
// WalTypes.h) has no field or command id for triggering the chime - on the
// ESP side AlertPlayer is invoked straight from its own local HTTP handler,
// not through SysDb. Routing it through the daemon's WS channel would either
// require an ESP firmware change (out of scope: only web-app + daemon are
// in play here) or silently be a no-op. Kept as a direct one-shot REST call,
// same as the SD library operations above.

export async function playAlertSound() {
  return fetchJson(`${getEspBaseUrl()}/api/audio/alert`, { method: 'POST' });
}

// ── Daemon read-only snapshot (rarely needed; WS pushes this on connect) ────

export async function getDaemonStatus() {
  return fetchJson(`${getDaemonBaseUrl()}/api/status`);
}
