import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Speaker, Laptop, Bluetooth, Check, Loader2 } from 'lucide-react';
import { useNexus } from '../DeviceContext';
import { useAudioOutputs } from '../hooks/useAudioOutputs';

const ICON_MAP = {
  internal: Speaker,
  bluetooth: Bluetooth,
  satellite: Laptop,
};

export default function OutputPicker() {
  const { online } = useNexus();
  const { speakers, activeOutput, selectSpeaker, busy, busyMsg } = useAudioOutputs();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const ActiveIcon = ICON_MAP[activeOutput.type] || Speaker;

  return (
    <div className="output-picker" ref={ref}>
      <button
        type="button"
        className={clsx('output-pill-btn', activeOutput.type !== 'internal' && 'is-external')}
        disabled={!online || busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Audio playing on: ${activeOutput.name} (Click to switch speaker)`}
      >
        {busy ? <Loader2 size={14} className="spin" /> : <ActiveIcon size={14} />}
        <span className="output-pill-text">{activeOutput.name}</span>
      </button>

      {open && (
        <div className="output-menu" role="menu">
          <div className="output-menu-title">Choose Output Speaker</div>
          {busyMsg && <div className="output-menu-hint">{busyMsg}</div>}
          <div className="output-menu-list">
            {speakers.map((spk) => {
              const SpkIcon = ICON_MAP[spk.type] || Speaker;
              const isSelected = spk.active;
              return (
                <button
                  key={spk.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={clsx('output-option', isSelected && 'is-selected')}
                  disabled={busy}
                  onClick={async () => {
                    if (!isSelected) await selectSpeaker(spk);
                    setOpen(false);
                  }}
                >
                  <SpkIcon size={16} />
                  <div className="output-option-text">
                    <span className="output-name">{spk.name}</span>
                    <span className="output-desc">{spk.description}</span>
                  </div>
                  {isSelected && <Check size={14} className="output-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
