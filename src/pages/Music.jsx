import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Search, HardDrive, ListMusic, Play, ListPlus, ListStart, Loader2, RefreshCw, Trash2, X, Shuffle, Music2, HardDriveDownload, Sparkles,
} from 'lucide-react';
import { Button, Card, Empty, IconButton, PageHeader, Segmented, Switch } from '../components/ui';
import { TrackArt, useTrackInfo } from '../components/Track';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { clearUnsavedHistory, deleteFromLibrary, getLibrary, getMix, playLocal, scanLibrary, searchYouTube } from '../lib/api';
import { needsResolution, resolveTrackInfo } from '../lib/trackMetadata';
import { formatBytes, formatSeconds } from '../lib/format';

const QUICK_PICKS = [
  { label: 'Lofi chill', query: 'lofi hip hop beats to relax' },
  { label: 'Synthwave', query: 'synthwave retrowave mix' },
  { label: 'Coldplay', query: 'Coldplay top hits' },
  { label: 'Hans Zimmer', query: 'Hans Zimmer soundtrack' },
  { label: 'A.R. Rahman', query: 'A.R. Rahman hits' },
  { label: 'Focus', query: 'deep focus instrumental' },
];

const subFromHash = () => {
  const sub = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  return ['foryou', 'search', 'library', 'queue'].includes(sub) ? sub : 'foryou';
};

// One song as a card: play, and with something playing, queue it.
// track: {id, title, artist, duration}.
function TrackCard({ track, onPlay, starting }) {
  const { online, queueTrack, snapshot } = useNexus();
  const toast = useToast();
  const somethingPlaying = snapshot.music.state !== 'IDLE';
  const enqueue = (front) => {
    queueTrack(track, front);
    toast(front ? `"${track.title}" plays next` : `Added "${track.title}" to the queue`);
  };
  return (
    <article className="result">
      <div className="result-art">
        <TrackArt id={track.id} size="fill" />
        {track.duration > 0 && <span className="result-duration mono">{formatSeconds(track.duration)}</span>}
        <button className="result-play" onClick={() => onPlay(track)} disabled={!online || starting} aria-label={`Play ${track.title}`}>
          {starting ? <Loader2 size={22} className="spin" /> : <Play size={22} fill="currentColor" />}
        </button>
      </div>
      <div className="result-body">
        <h3 className="result-title" title={track.title}>{track.title}</h3>
        <p className="result-artist">{track.artist}</p>
      </div>
      {somethingPlaying && (
        <div className="result-actions">
          <IconButton icon={ListStart} label="Play next" size={16} disabled={!online} onClick={() => enqueue(true)} />
          <IconButton icon={ListPlus} label="Add to queue" size={16} disabled={!online} onClick={() => enqueue(false)} />
        </div>
      )}
    </article>
  );
}

// ── For you ───────────────────────────────────────────────────────────────

const MIX_SEEDS = 3;
const SEED_MAX_S = 15 * 60;   // long tracks (podcasts, 1 h mixes) make poor seeds
const MIX_TTL_MS = 6 * 3600 * 1000;   // a mix takes ~10 s to fetch; keep it a while

function cachedMix(id) {
  try {
    const c = JSON.parse(localStorage.getItem(`nexus_mix_${id}`) || 'null');
    return c && Date.now() - c.at < MIX_TTL_MS ? c.tracks : null;
  } catch {
    return null;
  }
}

function storeMix(id, tracks) {
  try {
    localStorage.setItem(`nexus_mix_${id}`, JSON.stringify({ at: Date.now(), tracks }));
  } catch {
    // Not cached.
  }
}

function Shelf({ title, note, tracks, onPlay, startingId, loading }) {
  return (
    <section>
      <div className="shelf-head">
        <h2>{title}</h2>
        {note && <span className="muted small">{note}</span>}
      </div>
      {loading ? (
        <div className="loading"><Loader2 className="spin" /></div>
      ) : (
        <div className="shelf">
          {tracks.map((t) => <TrackCard key={t.id} track={t} onPlay={onPlay} starting={startingId === t.id} />)}
        </div>
      )}
    </section>
  );
}

// A feed from the device's own history: recently and most played songs from
// the library, and YouTube mixes seeded by the latest songs (different
// artists). No account and nothing leaves the browser but the mix requests.
function ForYouView() {
  const { setOptimisticTrack, playTrack } = useNexus();
  const toast = useToast();
  const [library, setLibrary] = useState(null);
  const [mixes, setMixes] = useState([]);   // [{seed, tracks|null}]
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    let active = true;
    getLibrary('')
      .then((list) => {
        if (!active) return;
        setLibrary(list);
        // Songs saved without metadata show their id; look them up (cached).
        const byRecent = [...list].filter((x) => x.last_played_at).sort((a, b) => b.last_played_at - a.last_played_at);
        const byCount = [...list].filter((x) => x.play_count > 1).sort((a, b) => b.play_count - a.play_count);
        new Set([...byRecent.slice(0, 12), ...byCount.slice(0, 12)]).forEach(async (t) => {
          if (!needsResolution(t)) return;
          const meta = await resolveTrackInfo(t.id);
          if (meta && active) setLibrary((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...meta } : x)));
        });
        const seeds = [];
        const artists = new Set();
        for (const t of byRecent) {
          if (t.duration > SEED_MAX_S) continue;
          // Unknown artists don't count as the same artist.
          const a = needsResolution(t) ? t.id : (t.artist || t.id).toLowerCase();
          if (artists.has(a)) continue;
          artists.add(a);
          seeds.push(t);
          if (seeds.length === MIX_SEEDS) break;
        }
        setMixes(seeds.map((seed) => ({ seed, tracks: cachedMix(seed.id) })));
        seeds.forEach(async (seed) => {
          if (cachedMix(seed.id)) return;
          try {
            const tracks = (await getMix(seed.id)).map((v) => ({
              id: v.videoId, title: v.title, artist: v.author, duration: v.lengthSeconds,
            }));
            storeMix(seed.id, tracks);
            if (active) setMixes((m) => m.map((x) => (x.seed.id === seed.id ? { ...x, tracks } : x)));
          } catch {
            if (active) setMixes((m) => m.map((x) => (x.seed.id === seed.id ? { ...x, tracks: [] } : x)));
          }
        });
      })
      .catch((err) => {
        if (active) setLibrary([]);
        toast(`Couldn't load the library: ${err.message}`, 'error');
      });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inLibrary = (id) => library?.find((t) => t.id === id);
  const play = async (track) => {
    const saved = inLibrary(track.id);
    if (saved?.cached) {
      try {
        await playLocal(track.id);
        setOptimisticTrack(track);
      } catch (err) {
        toast(`Playback failed: ${err.message}`, 'error');
      }
      return;
    }
    setStartingId(track.id);
    try {
      await playTrack(track);
    } finally {
      setStartingId(null);
    }
  };

  if (library === null) return <div className="loading"><Loader2 className="spin" /></div>;
  const asTrack = (t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration });
  const recent = library.filter((t) => t.last_played_at).sort((a, b) => b.last_played_at - a.last_played_at).slice(0, 12).map(asTrack);
  const most = library.filter((t) => t.play_count > 1).sort((a, b) => b.play_count - a.play_count).slice(0, 12).map(asTrack);
  if (recent.length === 0) {
    return (
      <Empty icon={Sparkles} title="Nothing here yet">
        Play a few songs; this page then shows what you played and mixes based on it.
      </Empty>
    );
  }
  const shared = { onPlay: play, startingId };
  return (
    <div className="stack" style={{ gap: 22 }}>
      <Shelf title="Recently played" tracks={recent} {...shared} />
      {mixes.map(({ seed, tracks }) => (tracks === null || tracks.length > 0) && (
        <Shelf
          key={seed.id}
          title={`Because you played ${inLibrary(seed.id)?.title || seed.title}`}
          note="YouTube mix"
          tracks={tracks || []}
          loading={tracks === null}
          {...shared}
        />
      ))}
      {most.length > 0 && <Shelf title="Most played" tracks={most} {...shared} />}
    </div>
  );
}

// ── Search ────────────────────────────────────────────────────────────────

function SearchView() {
  const { playTrack } = useNexus();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [searched, setSearched] = useState(false);

  const search = async (term = query) => {
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await searchYouTube(q);
      setResults((Array.isArray(data) ? data : []).filter((r) => r.videoId));
      setSearched(true);
    } catch (err) {
      toast(`Search failed: ${err.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const toTrack = (r) => ({ id: r.videoId, title: r.title, artist: r.author, duration: r.lengthSeconds });

  const play = async (track) => {
    setStartingId(track.id);
    try {
      await playTrack(track);
    } finally {
      setStartingId(null);
    }
  };

  return (
    <>
      <form className="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <Search size={18} className="search-icon" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs or artists" aria-label="Search" />
        <Button type="submit" variant="primary" busy={searching}>Search</Button>
      </form>
      <div className="chips">
        {QUICK_PICKS.map((p) => (
          <button key={p.query} className="chip" onClick={() => { setQuery(p.query); search(p.query); }}>{p.label}</button>
        ))}
      </div>

      {results.length > 0 ? (
        <div className="results">
          {results.map((r) => (
            <TrackCard key={r.videoId} track={toTrack(r)} onPlay={play} starting={startingId === r.videoId} />
          ))}
        </div>
      ) : (
        !searching && (
          <Empty icon={Music2} title={searched ? 'No results' : 'Find something to play'}>
            {searched ? 'Try a different search.' : 'Streams are resolved in your browser and sent to the speaker.'}
          </Empty>
        )
      )}
    </>
  );
}

// ── SD library ────────────────────────────────────────────────────────────

// A song whose file isn't on the card stays listed (with its play count) as
// "Not saved"; it plays by streaming.
function LibraryRow({ track, onPlay, onDelete, disabled, starting }) {
  const info = useTrackInfo({ id: track.id, title: track.title, artist: track.artist });
  return (
    <div className={clsx('row', !track.cached && 'is-dim')}>
      <TrackArt id={track.id} size="sm" />
      <div className="row-text">
        <span className="ellipsis">{info.title || track.title}</span>
        <span className="muted small ellipsis">{info.artist || 'Local file'}</span>
      </div>
      {track.cached ? (
        <span className="mono muted small hide-mobile">{formatBytes(track.size)}</span>
      ) : (
        <span className="pill pill-neutral" title="The file isn't on the SD card; plays by streaming">Not saved</span>
      )}
      <span className="mono muted small">{formatSeconds(track.duration)}</span>
      <IconButton
        icon={starting ? Loader2 : Play}
        label={track.cached ? 'Play from SD card' : 'Stream'}
        disabled={disabled || starting}
        onClick={() => onPlay(track)}
      />
      <IconButton
        icon={Trash2}
        label="Delete the file from the SD card"
        danger
        disabled={!track.cached}
        onClick={() => onDelete(track)}
      />
    </div>
  );
}

function LibraryView({ onCount }) {
  const { online, setOptimisticTrack, controls, playTrack } = useNexus();
  const toast = useToast();
  const [tracks, setTracks] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [savedOnly, setSavedOnly] = useState(false);

  const load = async (f = filter) => {
    try {
      const data = await getLibrary(f);
      const list = Array.isArray(data) ? data : data?.tracks || [];
      setTracks(list);
      if (!f) onCount(list.filter((t) => t.cached).length);
      list.filter(needsResolution).forEach(async (t) => {
        const meta = await resolveTrackInfo(t.id);
        if (meta) setTracks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...meta } : x)));
      });
    } catch (err) {
      toast(`Couldn't load the library: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setScanning(true);
    try {
      const res = await scanLibrary();
      toast(`Scan complete: ${res?.scanned_count ?? 0} songs on the card`);
      await load();
    } catch (err) {
      toast(`Scan failed: ${err.message}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const unsavedCount = tracks.filter((t) => !t.cached).length;
  const clearUnsaved = async () => {
    if (!window.confirm(`Remove ${unsavedCount} songs that aren't saved on the SD card from the library? Their play history goes too.`)) return;
    try {
      const res = await clearUnsavedHistory();
      toast(`Removed ${res?.removed ?? 0} entries`);
      load();
    } catch (err) {
      toast(`Couldn't clear: ${err.message}`, 'error');
    }
  };

  const play = async (t) => {
    const track = { id: t.id, title: t.title, artist: t.artist, duration: t.duration };
    if (!t.cached) {
      setStartingId(t.id);
      try {
        await playTrack(track);
      } finally {
        setStartingId(null);
      }
      return;
    }
    try {
      await playLocal(t.id);
      setOptimisticTrack(track);
    } catch (err) {
      toast(`Playback failed: ${err.message}`, 'error');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}"? The file and its library entry, with its play history, are removed.`)) return;
    try {
      await deleteFromLibrary(t.id);
      toast(`Deleted "${t.title}"`);
      load();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const shown = savedOnly ? tracks.filter((t) => t.cached) : tracks;

  return (
    <Card padded={false}>
      <div className="toolbar">
        <div className="search search-sm">
          <Search size={16} className="search-icon" />
          <input value={filter} onChange={(e) => { setFilter(e.target.value); load(e.target.value); }} placeholder="Filter the library" aria-label="Filter" />
        </div>
        <Switch label="Saved only" checked={savedOnly} onChange={setSavedOnly} />
        <Switch label="Save streams to SD" checked={controls.caching.value} disabled={!online} onChange={controls.caching.commit} />
        <Button icon={Trash2} disabled={!online || unsavedCount === 0} onClick={clearUnsaved}>Clear unsaved ({unsavedCount})</Button>
        <Button icon={RefreshCw} busy={scanning} onClick={scan}>Rescan</Button>
      </div>
      {loading ? (
        <div className="loading"><Loader2 className="spin" /></div>
      ) : shown.length === 0 ? (
        <Empty icon={HardDriveDownload} title={filter ? 'No matches' : savedOnly ? 'No songs saved yet' : 'No songs yet'}>
          {filter ? 'Try another filter.' : 'Turn on "Save streams to SD" and songs you play are kept for offline playback.'}
        </Empty>
      ) : (
        <div className="rows">
          {shown.map((t) => (
            <LibraryRow
              key={t.id}
              track={t}
              disabled={!online}
              starting={startingId === t.id}
              onPlay={play}
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Queue ─────────────────────────────────────────────────────────────────

function QueueRow({ track, index, onRemove, disabled }) {
  const info = useTrackInfo(track);
  return (
    <div className="row">
      <span className="row-index mono muted">{index + 1}</span>
      <TrackArt id={track.id} size="sm" />
      <div className="row-text">
        <span className="ellipsis">{info.title || track.title}</span>
        <span className="muted small ellipsis">{info.artist || track.artist}</span>
      </div>
      <span className="mono muted small">{formatSeconds(track.duration)}</span>
      <IconButton icon={X} label="Remove from queue" disabled={disabled} onClick={() => onRemove(index)} />
    </div>
  );
}

function QueueView() {
  const { snapshot, online, act, controls, currentTrack } = useNexus();
  const { queue, queue_length: total } = snapshot.music;
  const now = useTrackInfo(currentTrack);
  const hasTrack = !!(currentTrack?.id || currentTrack?.title);

  return (
    <Card padded={false}>
      <div className="toolbar">
        <span className="muted small toolbar-grow">{total ? `${total} song${total === 1 ? '' : 's'} up next` : 'Queue is empty'}</span>
        <Switch label="Autoplay similar songs" checked={controls.autoplay.value} disabled={!online} onChange={controls.autoplay.commit} />
        <Button icon={Shuffle} disabled={!online || total < 2} onClick={() => act('queue_shuffle')}>Shuffle</Button>
        <Button icon={Trash2} disabled={!online || total === 0} onClick={() => act('queue_clear')}>Clear</Button>
      </div>
      {hasTrack && (
        <div className="row row-now">
          <span className="row-index"><span className="eq"><i /><i /><i /></span></span>
          <TrackArt id={currentTrack.id} size="sm" />
          <div className="row-text">
            <span className="ellipsis">{now.title || currentTrack.title}</span>
            <span className="muted small ellipsis">{now.artist}</span>
          </div>
          <span className="pill pill-accent">Now playing</span>
        </div>
      )}
      {queue.length === 0 ? (
        <Empty icon={ListMusic} title="Nothing queued">
          Use "Play next" or "Add to queue" on a search result, or ask the assistant to queue a song.
        </Empty>
      ) : (
        <div className="rows">
          {queue.map((t, i) => (
            <QueueRow key={`${t.id}-${i}`} track={t} index={i} disabled={!online} onRemove={(idx) => act('queue_remove', { value: idx })} />
          ))}
          {total > queue.length && <p className="muted small more-row">+{total - queue.length} more not shown</p>}
        </div>
      )}
    </Card>
  );
}

export default function Music() {
  const [sub, setSub] = useState(subFromHash);
  const [libraryCount, setLibraryCount] = useState(0);
  const { snapshot } = useNexus();

  useEffect(() => {
    const onHash = () => setSub(subFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const change = (v) => {
    window.history.replaceState(null, '', `#/music/${v}`);
    setSub(v);
  };

  return (
    <>
      <PageHeader title="Music" subtitle="Stream from the web, play songs saved on the SD card, and manage the queue.">
        <Segmented
          value={sub}
          onChange={change}
          options={[
            { value: 'foryou', label: 'For you', icon: Sparkles },
            { value: 'search', label: 'Search', icon: Search },
            { value: 'library', label: 'Library', icon: HardDrive, badge: libraryCount || null },
            { value: 'queue', label: 'Queue', icon: ListMusic, badge: snapshot.music.queue_length || null },
          ]}
        />
      </PageHeader>
      {sub === 'foryou' && <ForYouView />}
      <div className={clsx('stack', sub !== 'search' && 'hidden')}><SearchView /></div>
      {sub === 'library' && <LibraryView onCount={setLibraryCount} />}
      {sub === 'queue' && <QueueView />}
    </>
  );
}
