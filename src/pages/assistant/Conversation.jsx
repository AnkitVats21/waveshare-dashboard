import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MessagesSquare, Mic, Square, TriangleAlert } from 'lucide-react';
import { Banner, Button, Card, Empty } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useNexus } from '../../DeviceContext';
import { startConversation, stopConversation } from '../../lib/api';
import { pad2 } from '../../lib/format';

// t_ms is device uptime; the snapshot's `up` (seconds) turns it into a time of day.
function clockOf(tMs, upS) {
  const d = new Date(Date.now() - (upS * 1000 - tMs));
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function Transcript({ entries, upS }) {
  const ref = useRef(null);
  const pinned = useRef(true);   // follow new text unless the user scrolled up

  const onScroll = () => {
    const el = ref.current;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="transcript" ref={ref} onScroll={onScroll}>
      {entries.map((e, i) => {
        const prev = entries[i - 1];
        // A gap of over a minute starts a new conversation block.
        const gap = !prev || e.t_ms - prev.t_ms > 60000;
        return (
          <React.Fragment key={e.id}>
            {gap && <div className="transcript-time muted small">{clockOf(e.t_ms, upS)}</div>}
            <div className={clsx('bubble', e.role === 'user' ? 'bubble-user' : 'bubble-model', !e.done && 'is-live')}>
              {e.text.trim()}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Start and end a conversation, and the live transcript of every
// conversation, however it started.
export default function Conversation({ config }) {
  const toast = useToast();
  const { snapshot, transcript, online } = useNexus();
  const [busy, setBusy] = useState(false);
  const state = snapshot.assistant.state;
  const active = state !== 'idle';

  // Clear the busy flag once the device reports the change.
  useEffect(() => setBusy(false), [active]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  const silence = config?.manual_silence_s ?? 10;
  const transcriptsOff = config && config.transcripts === false;

  return (
    <Card title="Conversation" icon={MessagesSquare}>
      <div className="conversation-controls">
        {active ? (
          <Button key="end" variant="danger" icon={Square} busy={busy} onClick={() => run(stopConversation)} disabled={!online}>
            End conversation
          </Button>
        ) : (
          <Button key="start" variant="primary" icon={Mic} busy={busy} onClick={() => run(startConversation)} disabled={!online}>
            Start conversation
          </Button>
        )}
        <span className="muted small">
          {active
            ? 'Talk to the device. It ends by itself after the silence timeout.'
            : `Same as saying the wake word, but it waits ${silence} s for you to speak instead of 3 s.`}
        </span>
      </div>
      {transcriptsOff && (
        <Banner tone="warn" icon={TriangleAlert}>Transcripts are off, so nothing new appears here. Turn them on in Settings.</Banner>
      )}
      {transcript.length === 0 ? (
        <Empty icon={MessagesSquare} title="Nothing said yet">
          What you and the assistant say shows up here as it's spoken.
        </Empty>
      ) : (
        <Transcript entries={transcript} upS={snapshot.up} />
      )}
    </Card>
  );
}
