import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Speaker, Laptop, Check } from 'lucide-react';
import { IconButton } from './ui';
import { useNexus } from '../DeviceContext';

// Where the music plays: the board's speaker, or a satellite (nexus-orbit on a
// PC or Pi, connected to /api/orbit/ws). Picking one moves the current song
// there at its position. Hidden while no satellite is connected.
export default function OutputPicker() {
  const { snapshot, online, send } = useNexus();
  const orbit = snapshot.orbit;
  const satellites = orbit?.satellites || [];
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

  if (!satellites.length) return null;

  const onSatellite = snapshot.music.output === 'satellite';
  const active = onSatellite ? satellites.find((s) => s.active) : null;
  const choose = (target) => {
    send('orbit_set_target', { target });
    setOpen(false);
  };
  const options = [
    { id: 'local', name: 'Nexus speaker', icon: Speaker, selected: !onSatellite },
    ...satellites.map((s) => ({ id: s.id, name: s.name, icon: Laptop, selected: !!active && s.id === active.id })),
  ];

  return (
    <div className="output-picker" ref={ref}>
      <IconButton
        icon={active ? Laptop : Speaker}
        label={active ? `Playing on ${active.name}` : 'Playing on the Nexus speaker'}
        active={!!active}
        size={16}
        disabled={!online}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      {open && (
        <div className="output-menu" role="menu">
          <div className="output-menu-title">Play music on</div>
          {options.map(({ id, name, icon: Icon, selected }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={selected}
              className={clsx('output-option', selected && 'is-selected')}
              onClick={() => choose(id)}
            >
              <Icon size={16} />
              <span className="output-name">{name}</span>
              {selected && <Check size={14} />}
            </button>
          ))}
          {active && <div className="output-menu-hint">The volume slider sets the Nexus speaker, not {active.name}.</div>}
        </div>
      )}
    </div>
  );
}
