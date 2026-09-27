# waveshare-dashboard

The web dashboard for the [Nexus firmware](https://github.com/AnkitVats21/waveshare)
on the Waveshare ESP32-S3 audio board. React 19 + Vite, no UI framework.
It is served by the device itself from flash (`http://nexus.local`) and
talks to it directly: live state over the `/api/ws` WebSocket, everything
else over the REST API.

## Pages

| Page | What |
|---|---|
| Home | Now playing, up next, next alarm, quick controls, assistant, device health |
| Music | Search, queue, library (every song played; saved ones play offline), player (with a link to the song on YouTube) |
| Assistant | Talk to it, live transcript, voice and personality settings, notes and memory |
| Alarms | Alarms, timers, reminders, the device clock |
| Recordings | Record (stereo/processed), play in the browser or on the device, rename, download, delete |
| Device | Speaker, microphone, LED light, alert sounds |
| System | Health, Wi-Fi, SD card, logs, firmware and web app updates, which device to talk to |

The player bar at the bottom controls whatever the device is playing
(seek, ±10 s, stop, volume, repeat, autoplay).

## Development

```bash
npm install
npm run dev          # http://localhost:5173, talks to a device on the LAN
```

In development the dashboard needs to know where the device is: set its
address on the System page (it is remembered in the browser). The device answers
with CORS headers, so the dev server can call it directly. `/api/ws` takes
one client at a time, so a second open dashboard takes over from the
first.

## Putting it on the device

```bash
NEXUS_HOST=nexus.local npm run deploy
```

`deploy` builds in `device` mode (the dashboard then uses the host it was
loaded from), packs `dist/` into a web bundle with the firmware repo's
`tools/webbundle/mkbundle.py` and uploads it to `/api/ota/frontend`. The
device keeps two slots and switches to the new one, so a bad bundle can be
rolled back; a built-in page at `/recovery` always works. `npm run bundle`
only builds `nexus-web.bin`.

The firmware repo is expected next to this one (`../waveshare`): `bundle`,
`deploy` and `ndb` use its tools.

## Reading the device's databases

The library, recordings and some settings come from nexus_db files on the
device's SD card, downloaded whole (`GET /api/db/<name>`) and parsed in the
browser by `src/lib/ndb.js`, with the field layout from
`src/lib/ndb_schema.js`. Both are generated from the firmware repo:

```bash
npm run ndb          # after a schema change in ../waveshare/schema/db/
```

## Layout

| Path | What |
|---|---|
| `src/App.jsx` | Pages and navigation |
| `src/DeviceContext.jsx`, `src/hooks/useDevice.js` | The WebSocket connection, the live snapshot, actions |
| `src/lib/api.js` | REST calls |
| `src/lib/ndb.js`, `ndb_schema.js` | Generated nexus_db reader (don't edit by hand) |
| `src/pages/`, `src/components/` | Pages and shared components (`ui.jsx` holds the basic building blocks) |

A `Dockerfile` (nginx) is included for serving the dashboard from a PC.

When an alarm rings or is snoozed, a banner with stop and snooze appears
on every page.
