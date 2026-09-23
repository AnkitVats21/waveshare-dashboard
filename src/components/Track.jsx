import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Music2 } from 'lucide-react';
import { looksLikeVideoId, needsResolution, resolveTrackInfo } from '../lib/trackMetadata';

// Title/artist for a track, filled in from noembed when the device only
// knows the video id.
export function useTrackInfo(track) {
  const [resolved, setResolved] = useState(null);
  const id = track?.id;
  useEffect(() => {
    setResolved(null);
    if (!needsResolution(track)) return undefined;
    let cancelled = false;
    resolveTrackInfo(id).then((meta) => !cancelled && meta && setResolved(meta));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, track?.title, track?.artist]);
  return {
    title: resolved?.title || track?.title || '',
    artist: resolved?.artist || track?.artist || '',
  };
}

export function TrackArt({ id, size = 'md', className }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  const quality = size === 'lg' || size === 'xl' ? 'hqdefault' : 'mqdefault';
  return (
    <div className={clsx('art', `art-${size}`, className)}>
      {looksLikeVideoId(id) && !failed ? (
        <img src={`https://i.ytimg.com/vi/${id}/${quality}.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Music2 size={size === 'sm' ? 16 : 22} />
      )}
    </div>
  );
}
