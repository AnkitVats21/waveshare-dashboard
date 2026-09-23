import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Cpu, Wifi, HardDrive, Package, Globe, Power, Terminal, Upload, RotateCcw, Pause, Play, Trash2, Link2,
} from 'lucide-react';
import { Banner, Button, Card, Meter, PageHeader, Pill, Row, Stat } from '../components/ui';
import { useToast } from '../components/Toast';
import { useNexus } from '../DeviceContext';
import { usePoll } from '../hooks/usePoll';
import {
  getFirmwareStatus, getFrontendStatus, getLogs, getMetrics, getStorageInfo, isDeviceBuild, reboot, rollbackFrontend, uploadFirmware,
} from '../lib/api';
import { formatBytes, formatUptime, signalLabel } from '../lib/format';

function Health() {
  const { data: m } = usePoll(getMetrics, 5000);
  const heap = m?.heap;
  return (
    <Card title="Health" icon={Cpu}>
      {!m ? (
        <div className="loading" />
      ) : (
        <div className="stats-grid">
          <Stat label="CPU 0" value={`${m.cpu0}%`}><Meter value={m.cpu0} /></Stat>
          <Stat label="CPU 1" value={`${m.cpu1}%`}><Meter value={m.cpu1} /></Stat>
          <Stat label="Internal RAM free" value={formatBytes(heap.internal_free)} hint={`lowest ${formatBytes(heap.internal_min_free)} of ${formatBytes(heap.internal_total)}`}>
            <Meter value={heap.internal_total - heap.internal_free} max={heap.internal_total} tone="accent" />
          </Stat>
          <Stat label="PSRAM free" value={formatBytes(heap.psram_free)} hint={`of ${formatBytes(heap.psram_total)}`}>
            <Meter value={heap.psram_total - heap.psram_free} max={heap.psram_total} tone="accent" />
          </Stat>
          <Stat label="Uptime" value={formatUptime(m.uptime_sec)} hint={`last reset: ${m.reset_reason}`} />
          <Stat label="Tasks" value={m.num_tasks} />
        </div>
      )}
    </Card>
  );
}

function Network() {
  const { data: m } = usePoll(getMetrics, 10000);
  const { data: storage } = usePoll(getStorageInfo, 60000);
  const used = storage ? storage.total_bytes - storage.free_bytes : 0;
  return (
    <>
      <Card title="Wi-Fi" icon={Wifi}>
        {m?.wifi ? (
          <div className="kv">
            <Row label="Network">{m.wifi.ssid || '—'}</Row>
            <Row label="IP address">{m.wifi.ip || '—'}</Row>
            <Row label="Signal">{signalLabel(m.wifi.rssi)} ({m.wifi.rssi} dBm)</Row>
            <Row label="Channel">{m.wifi.channel}</Row>
          </div>
        ) : <div className="loading" />}
      </Card>
      <Card title="SD card" icon={HardDrive}>
        {!storage ? (
          <div className="loading" />
        ) : !storage.mounted ? (
          <Banner tone="warn">No SD card detected.</Banner>
        ) : (
          <>
            <Meter value={used} max={storage.total_bytes} />
            <div className="kv">
              <Row label="Used">{formatBytes(used)}</Row>
              <Row label="Free">{formatBytes(storage.free_bytes)}</Row>
              <Row label="Size">{formatBytes(storage.total_bytes)}</Row>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function waitForDevice(timeoutMs = 90000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        await getFirmwareStatus();
        resolve(true);
      } catch {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tick, 2000);
      }
    };
    setTimeout(tick, 5000);
  });
}

function Firmware() {
  const toast = useToast();
  const { data: fw, refresh } = usePoll(getFirmwareStatus, 0);
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState('');
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    if (!window.confirm(`Install ${file.name} (${formatBytes(file.size)})? The device restarts afterwards.`)) return;
    setPhase('Uploading');
    setProgress(0);
    try {
      await uploadFirmware(file, setProgress);
      setPhase('Restarting');
      const back = await waitForDevice();
      toast(back ? 'Firmware updated' : 'The device has not come back yet', back ? 'ok' : 'error');
      refresh();
    } catch (err) {
      toast(`Update failed: ${err.message}`, 'error');
    } finally {
      setPhase('');
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card title="Firmware" icon={Package}>
      {fw && (
        <div className="kv">
          <Row label="Version">{fw.version}</Row>
          <Row label="Built">{fw.compile_date} {fw.compile_time}</Row>
          <Row label="Running from">{fw.running_partition}</Row>
        </div>
      )}
      {phase ? (
        <div className="progress-block">
          <div className="slider-head"><span>{phase}…</span>{progress !== null && phase === 'Uploading' && <span className="mono">{Math.round(progress * 100)}%</span>}</div>
          <Meter value={phase === 'Uploading' ? progress * 100 : 100} tone="accent" />
        </div>
      ) : (
        <div className="form-actions">
          <span className="muted small">Install a <span className="mono">waveshare.bin</span> build.</span>
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>Install update</Button>
          <input ref={fileRef} type="file" accept=".bin" hidden onChange={(e) => upload(e.target.files[0])} />
        </div>
      )}
    </Card>
  );
}

function WebApp() {
  const toast = useToast();
  const { data, refresh } = usePoll(getFrontendStatus, 0);
  const [busy, setBusy] = useState(false);
  const other = data?.slots?.find((s) => s.slot !== data.active_slot);

  const rollback = async () => {
    if (!window.confirm(`Switch the web app back to version ${other?.version}? This page reloads.`)) return;
    setBusy(true);
    try {
      await rollbackFrontend();
      toast('Switched version; reloading');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast(`Rollback failed: ${err.message}`, 'error');
      setBusy(false);
      refresh();
    }
  };

  return (
    <Card title="Web app" icon={Globe}>
      {!data ? (
        <div className="loading" />
      ) : (
        <>
          <div className="slots">
            {data.slots.map((s) => (
              <div key={s.slot} className={clsx('slot', s.slot === data.active_slot && 'is-active')}>
                <div className="slot-head">
                  <span className="mono">{s.valid ? s.version : 'empty'}</span>
                  {s.slot === data.active_slot && <Pill tone="accent">Live</Pill>}
                </div>
                <span className="muted small">
                  {s.valid ? `${new Date(s.build_time * 1000).toLocaleString()} · ${formatBytes(s.size)}` : 'No bundle installed'}
                </span>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <span className="muted small">Publish with <span className="mono">npm run deploy</span>.</span>
            <Button icon={RotateCcw} busy={busy} disabled={!other?.valid} onClick={rollback}>Roll back</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Controls() {
  const toast = useToast();
  const { host, setHost } = useNexus();
  const [hostInput, setHostInput] = useState(host);
  const [rebooting, setRebooting] = useState(false);

  const restart = async () => {
    if (!window.confirm('Restart the device? Playback stops for about 15 seconds.')) return;
    setRebooting(true);
    try {
      await reboot();
    } catch {
      // The connection often drops before the reply arrives.
    }
    const back = await waitForDevice();
    toast(back ? 'Device restarted' : 'The device has not come back yet', back ? 'ok' : 'error');
    setRebooting(false);
  };

  return (
    <Card title="Device" icon={Power}>
      {!isDeviceBuild && (
        <form className="inline-row" onSubmit={(e) => { e.preventDefault(); setHost(hostInput); toast(`Connecting to ${hostInput}`, 'info'); }}>
          <div className="input-icon grow">
            <Link2 size={16} />
            <input value={hostInput} onChange={(e) => setHostInput(e.target.value)} placeholder="192.168.1.14" aria-label="Device address" />
          </div>
          <Button type="submit">Connect</Button>
        </form>
      )}
      <div className="inline-row">
        <div>
          <div>Restart</div>
          <div className="muted small">Reboots the speaker.</div>
        </div>
        <Button variant="danger" icon={Power} busy={rebooting} onClick={restart}>Restart</Button>
      </div>
      <p className="muted small">
        Built-in fallback page: <a href={`http://${host}/recovery`} target="_blank" rel="noreferrer">/recovery</a>
      </p>
    </Card>
  );
}

const MAX_LOG_LINES = 1000;
const levelOf = (line) => (/^E \(/.test(line) ? 'error' : /^W \(/.test(line) ? 'warn' : /^D \(/.test(line) ? 'debug' : 'info');

function Logs() {
  const [lines, setLines] = useState([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const seqRef = useRef(0);
  const boxRef = useRef(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (paused) return undefined;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const d = await getLogs(seqRef.current);
        if (cancelled || !d) return;
        // A lower sequence number means the device restarted.
        if (d.latest_seq < seqRef.current) seqRef.current = 0;
        seqRef.current = d.latest_seq;
        if (d.logs?.length) setLines((prev) => [...prev, ...d.logs].slice(-MAX_LOG_LINES));
      } catch {
        // Device unreachable; try again next tick.
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [paused]);

  useEffect(() => {
    const box = boxRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  return (
    <Card
      title="Logs"
      icon={Terminal}
      className="span-2"
      padded={false}
      action={
        <div className="log-tools">
          <input className="log-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter logs" />
          <Button size="sm" icon={paused ? Play : Pause} onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</Button>
          <Button size="sm" icon={Trash2} onClick={() => setLines([])}>Clear</Button>
        </div>
      }
    >
      <div
        className="logs"
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {shown.length === 0 ? (
          <span className="muted">Waiting for log lines…</span>
        ) : (
          shown.map((l, i) => <div key={i} className={`log log-${levelOf(l)}`}>{l}</div>)
        )}
      </div>
    </Card>
  );
}

export default function System() {
  return (
    <>
      <PageHeader title="System" subtitle="Health, updates and diagnostics." />
      <div className="system-grid">
        <div className="stack">
          <Health />
          <Firmware />
          <Controls />
        </div>
        <div className="stack">
          <Network />
          <WebApp />
        </div>
        <Logs />
      </div>
    </>
  );
}
