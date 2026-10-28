import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bluetooth, Search, AlertTriangle } from 'lucide-react';
import { Banner, Button, Card, Pill } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { getHubStatus, getBluetooth, bluetoothAction } from '../../lib/api';

const ACTION_LABELS = {
  scan: 'Searching',
  pair: 'Pairing',
  connect: 'Connecting',
  disconnect: 'Disconnecting',
  remove: 'Forgetting',
  power: 'Switching',
};

// The hub machine's Bluetooth speaker (Orbit on the Pi, through the hub's
// /hub/bluetooth). Shown only when the dashboard is served by a hub that has
// one; the speaker is offered for music while it is connected.
export default function BluetoothCard() {
  const toast = useToast();
  const [available, setAvailable] = useState(false);
  const [bt, setBt] = useState(null);
  const [error, setError] = useState('');
  const shownError = useRef('');

  const load = useCallback(async () => {
    try {
      const s = await getBluetooth();
      setBt(s);
      setError('');
      if (s.last_error && s.last_error !== shownError.current) {
        shownError.current = s.last_error;
        toast(s.last_error, 'error');
      }
    } catch (err) {
      setError(err.message);
    }
  }, [toast]);

  useEffect(() => {
    getHubStatus()
      .then((s) => {
        if (s?.bluetooth) {
          setAvailable(true);
          load();
        }
      })
      .catch(() => {}); // not served by a hub: no card
  }, [load]);

  // Poll quickly while an action runs, slowly otherwise.
  const busy = bt?.busy || '';
  useEffect(() => {
    if (!available) return undefined;
    const t = setInterval(load, busy ? 2000 : 8000);
    return () => clearInterval(t);
  }, [available, busy, load]);

  if (!available) return null;

  const run = async (action, body = {}) => {
    try {
      await bluetoothAction(action, body);
      shownError.current = '';
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const devices = bt?.devices || [];
  const paired = devices.filter((d) => d.paired);
  const found = devices.filter((d) => !d.paired && d.audio);
  const busyMac = busy.split(' ')[1];
  const busyVerb = ACTION_LABELS[busy.split(' ')[0]];

  const status = !bt ? null
    : bt.active ? <Pill tone="success">{bt.active.name}</Pill>
    : !bt.adapter?.powered ? <Pill tone="neutral">Off</Pill>
    : <Pill tone="neutral">No speaker</Pill>;

  return (
    <Card title="Bluetooth speaker" icon={Bluetooth} action={status}>
      {error && <Banner tone="danger" icon={AlertTriangle}>{error}</Banner>}
      {!bt && !error && <div className="loading" />}
      {bt && (
        <div className="stack" style={{ gap: 12 }}>
          <span className="field-hint">
            Music can play on the hub’s speaker while it is connected. Turn the speaker on and it
            reconnects by itself; to add one, put it in pairing mode and search.
          </span>
          {!bt.adapter?.powered && (
            <Banner tone="warn" action={<Button size="sm" onClick={() => run('power', { on: true })}>Turn on</Button>}>
              Bluetooth is off.
            </Banner>
          )}

          <div className="kv">
            {paired.length === 0 && <div className="kv-row"><span>No paired speaker yet</span><span /></div>}
            {paired.map((d) => (
              <DeviceRow key={d.mac} d={d} busy={busyMac === d.mac ? busyVerb : ''} disabled={!!busy}>
                {d.connected ? (
                  <Button size="sm" onClick={() => run('disconnect', { mac: d.mac })} disabled={!!busy}>Disconnect</Button>
                ) : (
                  <>
                    <Button size="sm" variant="primary" onClick={() => run('connect', { mac: d.mac })} disabled={!!busy}>Connect</Button>
                    <Button size="sm" variant="danger" onClick={() => run('remove', { mac: d.mac })} disabled={!!busy}>Forget</Button>
                  </>
                )}
              </DeviceRow>
            ))}
          </div>

          {found.length > 0 && (
            <>
              <span className="field-label">Found nearby</span>
              <div className="kv">
                {found.map((d) => (
                  <DeviceRow key={d.mac} d={d} busy={busyMac === d.mac ? busyVerb : ''}>
                    <Button size="sm" variant="primary" onClick={() => run('pair', { mac: d.mac })} disabled={!!busy}>Pair</Button>
                  </DeviceRow>
                ))}
              </div>
            </>
          )}

          <div className="form-actions">
            {busy && <span className="muted">{busyVerb || busy}…</span>}
            <Button
              icon={Search}
              busy={busy === 'scan'}
              disabled={!!busy || !bt.adapter?.powered}
              onClick={() => run('scan', { seconds: 20 })}
            >
              Search for speakers
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DeviceRow({ d, busy, children }) {
  return (
    <div className="kv-row" style={{ alignItems: 'center' }}>
      <span>
        {d.name || d.mac}
        {d.connected && <span className="muted"> · connected</span>}
        {busy && <span className="muted"> · {busy.toLowerCase()}…</span>}
      </span>
      <span style={{ display: 'inline-flex', gap: 6 }}>{children}</span>
    </div>
  );
}
