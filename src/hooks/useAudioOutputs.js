import { useCallback, useEffect, useRef, useState } from 'react';
import { useNexus } from '../DeviceContext';
import { getBluetooth, getHubStatus } from '../lib/api';
import { usePendingValue } from './usePendingValue';

export function useAudioOutputs() {
  const { snapshot, online, send, controls } = useNexus();
  const [bluetooth, setBluetooth] = useState(null);
  const [hubStatus, setHubStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const soonRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [bt, hub] = await Promise.allSettled([getBluetooth(), getHubStatus()]);
      if (bt.status === 'fulfilled' && bt.value) setBluetooth(bt.value);
      if (hub.status === 'fulfilled' && hub.value) setHubStatus(hub.value);
    } catch {
      // Direct board connection without hub
    }
  }, []);

  // Speakers the music can move to: through a hub, the hub's speakers (the
  // Pi's Bluetooth speaker among them, named after it); else satellites
  // connected to the board.
  const satellites = snapshot.orbit?.satellites || [];
  const viaHub = snapshot.orbit?.source === 'hub';
  const onSatellite = snapshot.music?.output === 'satellite';
  const activeOrbit = onSatellite ? satellites.find((s) => s.active) : null;

  useEffect(() => {
    refresh();
    // Faster while a hub speaker plays: its own buttons change its volume.
    const interval = setInterval(refresh, busy ? 2000 : activeOrbit ? 3000 : 8000);
    return () => clearInterval(interval);
  }, [refresh, busy, !!activeOrbit]);
  useEffect(() => () => clearTimeout(soonRef.current), []);

  // Each hub speaker's own volume, from the hub (the board's list carries
  // names only, which are also the ids here).
  const hubVolume = {};
  for (const e of hubStatus?.edges || []) {
    if (typeof e.volume === 'number') hubVolume[e.name] = e.volume;
  }
  const boardVolume = snapshot.state?.speaker_volume ?? 0;

  // Only the speakers connected now: the board and the hub's players. A
  // Bluetooth speaker is connected in the Bluetooth card (System page);
  // once it is, the hub's Orbit joins as a player under its name.
  const activeOutput = activeOrbit
    ? { id: activeOrbit.id, name: activeOrbit.name, type: 'satellite', description: viaHub ? 'Hub speaker' : 'Orbit satellite' }
    : { id: 'local', name: 'Nexus speaker', type: 'internal', description: 'Internal board speaker' };

  const speakers = [
    {
      id: 'local',
      name: 'Nexus speaker',
      type: 'internal',
      description: 'ESP32-S3 board speaker',
      active: activeOutput.id === 'local',
      connected: true,
      volume: boardVolume,
    },
    ...satellites.map((s) => ({
      id: s.id,
      name: s.name,
      type: 'satellite',
      description: viaHub ? 'Hub speaker' : 'Orbit satellite',
      active: activeOrbit?.id === s.id,
      connected: true,
      volume: viaHub ? hubVolume[s.name] ?? null : null,
    })),
  ];

  // A speaker's volume: the board's on the board, a hub speaker's through
  // the hub (it answers with the new level, picked up by the next refresh).
  const setSpeakerVolume = useCallback((speaker, value) => {
    if (speaker.type === 'internal') {
      controls.volume.commit(value);
      return;
    }
    send('speaker_volume', { target: speaker.id, value });
    clearTimeout(soonRef.current);
    soonRef.current = setTimeout(refresh, 700);
  }, [controls.volume, send, refresh]);

  // The volume control follows where the music plays. A satellite whose
  // level isn't known (no hub) falls back to the board's control.
  const active = speakers.find((s) => s.active) || speakers[0];
  const activeKnown = active.type === 'internal' || active.volume !== null;
  const satVolume = usePendingValue(active.volume ?? 0, (v) => setSpeakerVolume(active, v));
  const activeVolume = active.type === 'internal' || !activeKnown ? controls.volume : satVolume;

  const selectSpeaker = async (speaker) => {
    if (busy || !online) return;
    setBusy(true);
    setBusyMsg(`Switching to ${speaker.name}...`);
    try {
      send('orbit_set_target', { target: speaker.id });
      await refresh();
    } catch (err) {
      console.warn('Failed to switch speaker:', err);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  };

  const hasMultipleSpeakers = speakers.length > 1;

  return {
    speakers,
    activeOutput,
    activeVolume,
    setSpeakerVolume,
    selectSpeaker,
    refresh,
    busy,
    busyMsg,
    hasMultipleSpeakers,
    bluetoothAvailable: !!bluetooth,
  };
}
