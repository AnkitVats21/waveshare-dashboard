// Browser-side audio format sniffing.
// Alarm and briefing media on the device must be Opus in Ogg or WebM.
// Matches the device's AudioSniff.cpp logic.

export const AUDIO_SNIFF_MIN = 64;
export const AUDIO_SNIFF_BYTES = 4096;

/**
 * Sniffs the format of an audio file from its first 4 KB.
 * @param {Uint8Array} d - bytes (up to 4096)
 * @returns {{ playable: boolean, format: string }}
 */
export function sniffAudioBytes(d) {
  const len = d ? d.length : 0;
  if (!d || len < AUDIO_SNIFF_MIN) {
    return { playable: false, format: 'too short' };
  }

  const startsWith = (at, s) => {
    if (at + s.length > len) return false;
    for (let i = 0; i < s.length; i++) {
      if (d[at + i] !== s.charCodeAt(i)) return false;
    }
    return true;
  };

  const startsWithBytes = (at, bytes) => {
    if (at + bytes.length > len) return false;
    for (let i = 0; i < bytes.length; i++) {
      if (d[at + i] !== bytes[i]) return false;
    }
    return true;
  };

  const contains = (s) => {
    const slen = s.length;
    for (let i = 0; i + slen <= len; i++) {
      let match = true;
      for (let j = 0; j < slen; j++) {
        if (d[i + j] !== s.charCodeAt(j)) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  };

  // Ogg: first page (27-byte header + segment table) holds codec identification
  if (startsWith(0, 'OggS')) {
    const packet = 27 + d[26];
    if (startsWith(packet, 'OpusHead')) return { playable: true, format: 'ogg-opus' };
    if (startsWithBytes(packet, [0x01]) && startsWith(packet + 1, 'vorbis')) {
      return { playable: false, format: 'ogg-vorbis' };
    }
    if (startsWithBytes(packet, [0x7f]) && startsWith(packet + 1, 'FLAC')) {
      return { playable: false, format: 'ogg-flac' };
    }
    return { playable: false, format: 'ogg-other' };
  }

  // WebM / Matroska: EBML magic 1A 45 DF A3
  if (startsWithBytes(0, [0x1a, 0x45, 0xdf, 0xa3])) {
    if (contains('A_OPUS')) return { playable: true, format: 'webm-opus' };
    if (contains('A_VORBIS')) return { playable: false, format: 'webm-vorbis' };
    if (contains('A_AAC')) return { playable: false, format: 'webm-aac' };
    return { playable: false, format: 'webm-other' };
  }

  if (startsWith(0, 'ID3') || (d[0] === 0xff && (d[1] & 0xe0) === 0xe0)) {
    return { playable: false, format: 'mp3' };
  }
  if (startsWith(0, 'RIFF') && startsWith(8, 'WAVE')) {
    return { playable: false, format: 'wav' };
  }
  if (startsWith(0, 'fLaC')) {
    return { playable: false, format: 'flac' };
  }
  if (startsWith(4, 'ftyp')) {
    return { playable: false, format: 'mp4' };
  }

  return { playable: false, format: 'unknown' };
}

/**
 * Sniffs a browser File / Blob by reading up to 4 KB.
 * @param {Blob} file
 * @returns {Promise<{ playable: boolean, format: string }>}
 */
export async function sniffAudioFile(file) {
  const slice = file.slice(0, AUDIO_SNIFF_BYTES);
  const buffer = await slice.arrayBuffer();
  return sniffAudioBytes(new Uint8Array(buffer));
}

/**
 * Returns user-facing error message when a non-Opus file is provided.
 * @param {string} format
 * @returns {string}
 */
export function opusErrorMessage(format) {
  return `This file is ${format}; the device plays only Opus (.ogg, .opus or .webm). Convert it: ffmpeg -i input.mp3 -ac 1 -c:a libopus -b:a 64k output.ogg`;
}
