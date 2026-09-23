// Parser for the device's SD music catalog (/sdcard/music/catalog.db).
//
// The file is an array of fixed 1024-byte little-endian records (TrackRecord
// in firmware components/media_player/include/media_player/CatalogDB.h).
// The device serves it as a plain file; there is no JSON library endpoint.

export const CATALOG_PATH = '/sdcard/music/catalog.db';

const RECORD_SIZE = 1024;
const MAGIC = 0xcafebeef;
const SCHEMA_VERSION = 2;
const FLAG_VALID = 1 << 0;
const FLAG_HAS_THUMBNAIL = 1 << 4;

const decoder = new TextDecoder('utf-8');

// Fixed-size C string; titles are cut at the field size, which can split a
// multi-byte character, so a trailing replacement character is dropped.
function cString(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return decoder.decode(end === -1 ? field : field.subarray(0, end)).replace(/�+$/, '');
}

// Same shape as the /api/music/library JSON rows.
export function parseCatalog(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tracks = [];
  for (let off = 0; off + RECORD_SIZE <= buffer.byteLength; off += RECORD_SIZE) {
    if (view.getUint32(off, true) !== MAGIC) continue;
    const flags = view.getUint8(off + 6);
    if (!(flags & FLAG_VALID)) continue;
    const version = view.getUint16(off + 4, true);
    if (version !== SCHEMA_VERSION) throw new Error(`Unsupported catalog version ${version}`);

    const size = view.getUint32(off + 180, true);
    tracks.push({
      id: cString(bytes, off + 16, 32),
      title: cString(bytes, off + 48, 64),
      artist: cString(bytes, off + 112, 32),
      duration: Math.floor(view.getUint32(off + 176, true) / 1000),
      size,
      has_thumb: (flags & FLAG_HAS_THUMBNAIL) !== 0,
      cached: size > 0,
      cached_at: view.getUint32(off + 188, true),
      play_count: view.getUint32(off + 196, true),
    });
  }
  return tracks;
}

export function filterTracks(tracks, filter) {
  const f = filter.trim().toLowerCase();
  if (!f) return tracks;
  return tracks.filter((t) => [t.title, t.artist, t.id].some((s) => s.toLowerCase().includes(f)));
}
