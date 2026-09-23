import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Search, HardDrive, ListMusic, Play, ListPlus, ListStart, Loader2, RefreshCw, Trash2, X, Shuffle, Music2, HardDriveDownload,
} from 'lucide-react';
import { Button, Card, Empty, IconButton, PageHeader, Segmented, Switch } from '../components/ui';
import { TrackArt, useTrackInfo } from '../components/Track';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { deleteFromLibrary, getLibrary, playLocal, scanLibrary, searchYouTube } from '../lib/api';
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
  return ['search', 'library', 'queue'].includes(sub) ? sub : 'search';
};

// ── Search ────────────────────────────────────────────────────────────────

function SearchView() {
  const { online, playTrack, queueTrack, snapshot } = useNexus();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [searched, setSearched] = useState(false);
  const somethingPlaying = snapshot.music.state !== 'IDLE';

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

  const play = async (r) => {
    setStartingId(r.videoId);
    try {
      await playTrack(toTrack(r));
    } finally {
      setStartingId(null);
    }
  };

  const enqueue = (r, front) => {
    queueTrack(toTrack(r), front);
    toast(front ? `"${r.title}" plays next` : `Added "${r.title}" to the queue`);
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
            <article key={r.videoId} className="result">
              <div className="result-art">
                <TrackArt id={r.videoId} size="fill" />
                <span className="result-duration mono">{formatSeconds(r.lengthSeconds)}</span>
                <button className="result-play" onClick={() => play(r)} disabled={!online || startingId === r.videoId} aria-label={`Play ${r.title}`}>
                  {startingId === r.videoId ? <Loader2 size={22} className="spin" /> : <Play size={22} fill="currentColor" />}
                </button>
              </div>
              <div className="result-body">
                <h3 className="result-title" title={r.title}>{r.title}</h3>
                <p className="result-artist">{r.author}</p>
              </div>
              {somethingPlaying && (
                <div className="result-actions">
                  <IconButton icon={ListStart} label="Play next" size={16} disabled={!online} onClick={() => enqueue(r, true)} />
                  <IconButton icon={ListPlus} label="Add to queue" size={16} disabled={!online} onClick={() => enqueue(r, false)} />
                </div>
              )}
            </article>
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

function LibraryRow({ track, onPlay, onDelete, disabled }) {
  const info = useTrackInfo({ id: track.id, title: track.title, artist: track.artist });
  return (
    <div className="row">
      <TrackArt id={track.id} size="sm" />
      <div className="row-text">
        <span className="ellipsis">{info.title || track.title}</span>
        <span className="muted small ellipsis">{info.artist || 'Local file'}</span>
      </div>
      <span className="mono muted small hide-mobile">{formatBytes(track.sizeBytes)}</span>
      <span className="mono muted small">{formatSeconds(track.durationSeconds)}</span>
      <IconButton icon={Play} label="Play" disabled={disabled} onClick={() => onPlay(track)} />
      <IconButton icon={Trash2} label="Delete from SD card" danger onClick={() => onDelete(track)} />
    </div>
  );
}

function LibraryView({ onCount }) {
  const { online, setOptimisticTrack, controls } = useNexus();
  const toast = useToast();
  const [tracks, setTracks] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async (f = filter) => {
    try {
      const data = await getLibrary(f);
      const list = Array.isArray(data) ? data : data?.tracks || [];
      setTracks(list);
      if (!f) onCount(list.length);
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
      toast(`Scan complete: ${res?.scanned_count ?? 0} tracks indexed`);
      await load();
    } catch (err) {
      toast(`Scan failed: ${err.message}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const play = async (t) => {
    try {
      await playLocal(t.id || t.filePath);
      setOptimisticTrack({ id: t.id, title: t.title, artist: t.artist, duration: t.durationSeconds });
    } catch (err) {
      toast(`Playback failed: ${err.message}`, 'error');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}" from the SD card?`)) return;
    try {
      await deleteFromLibrary(t.id);
      toast(`Deleted "${t.title}"`);
      load();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    }
  };

  return (
    <Card padded={false}>
      <div className="toolbar">
        <div className="search search-sm">
          <Search size={16} className="search-icon" />
          <input value={filter} onChange={(e) => { setFilter(e.target.value); load(e.target.value); }} placeholder="Filter saved songs" aria-label="Filter" />
        </div>
        <Switch label="Save streams to SD" checked={controls.caching.value} disabled={!online} onChange={controls.caching.commit} />
        <Button icon={RefreshCw} busy={scanning} onClick={scan}>Rescan</Button>
      </div>
      {loading ? (
        <div className="loading"><Loader2 className="spin" /></div>
      ) : tracks.length === 0 ? (
        <Empty icon={HardDriveDownload} title={filter ? 'No matches' : 'No songs saved yet'}>
          {filter ? 'Try another filter.' : 'Turn on "Save streams to SD" and songs you play are kept for offline playback.'}
        </Empty>
      ) : (
        <div className="rows">
          {tracks.map((t) => (
            <LibraryRow key={t.id} track={t} disabled={!online} onPlay={play} onDelete={remove} />
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
            { value: 'search', label: 'Search', icon: Search },
            { value: 'library', label: 'Library', icon: HardDrive, badge: libraryCount || null },
            { value: 'queue', label: 'Queue', icon: ListMusic, badge: snapshot.music.queue_length || null },
          ]}
        />
      </PageHeader>
      <div className={clsx('stack', sub !== 'search' && 'hidden')}><SearchView /></div>
      {sub === 'library' && <LibraryView onCount={setLibraryCount} />}
      {sub === 'queue' && <QueueView />}
    </>
  );
}
