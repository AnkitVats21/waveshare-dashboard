import React, { useEffect, useRef, useState } from 'react';
import { useNexus } from '../DeviceContext';
import { formatBytes, signalLabel } from '../lib/format';

// Device health for the sidebar: CPU and free RAM over the last ~2 minutes
// of the telemetry the device pushes every 2 s over /api/ws (no extra
// requests), Wi-Fi throughput from the byte counters, and the signal as bars.
const KEEP = 60;
const SRAM_LOW = 20 * 1024;   // below this the device is under memory pressure

function Sparkline({ series, min, max, className }) {
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const y = (v) => 24 - ((Math.min(Math.max(v, min), max) - min) / (max - min || 1)) * 22;
  return (
    <svg className={className || 'spark'} viewBox={`0 0 ${KEEP - 1} 26`} preserveAspectRatio="none" aria-hidden="true">
      {series.map((s) => (
        <polyline
          key={s.key}
          className={s.className}
          fill="none"
          vectorEffect="non-scaling-stroke"
          points={s.values.map((v, i) => `${KEEP - n + i},${y(v).toFixed(1)}`).join(' ')}
        />
      ))}
    </svg>
  );
}

// Wi-Fi as 0-4 bars.
function bars(rssi) {
  if (!rssi) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

function SignalBars({ rssi }) {
  const n = bars(rssi);
  return (
    <span className="signal-bars" aria-label={signalLabel(rssi)}>
      {[1, 2, 3, 4].map((i) => <span key={i} className={i <= n ? 'on' : ''} style={{ height: `${i * 25}%` }} />)}
    </span>
  );
}

function Metric({ label, value, children, tone }) {
  return (
    <div className="health-metric">
      <div className="health-head">
        <span className="health-label">{label}</span>
        <span className={`health-value mono ${tone || ''}`}>{value}</span>
      </div>
      {children}
    </div>
  );
}

export default function HealthPanel() {
  const { snapshot, online } = useNexus();
  const [hist, setHist] = useState({ c0: [], c1: [], sram: [], rx: [], tx: [] });
  const lastUp = useRef(-1);
  const lastNet = useRef(null);

  // One sample per telemetry push (the uptime second changes).
  useEffect(() => {
    if (!online || !snapshot.up || snapshot.up === lastUp.current) return;
    const dt = lastNet.current ? snapshot.up - lastNet.current.up : 0;
    // KB/s from the byte totals; unsigned 32-bit subtraction survives the wrap.
    const rate = (now, before) => (dt > 0 ? ((now - before) >>> 0) / 1024 / dt : 0);
    const rx = lastNet.current ? rate(snapshot.rx, lastNet.current.rx) : 0;
    const tx = lastNet.current ? rate(snapshot.tx, lastNet.current.tx) : 0;
    lastNet.current = { up: snapshot.up, rx: snapshot.rx, tx: snapshot.tx };
    lastUp.current = snapshot.up;
    setHist((h) => {
      const add = (arr, v) => [...arr.slice(-(KEEP - 1)), v];
      return {
        c0: add(h.c0, snapshot.c0),
        c1: add(h.c1, snapshot.c1),
        sram: add(h.sram, snapshot.sram / 1024),
        rx: add(h.rx, rx),
        tx: add(h.tx, tx),
      };
    });
  }, [online, snapshot.up, snapshot.c0, snapshot.c1, snapshot.sram, snapshot.rx, snapshot.tx]);

  if (!online || hist.c0.length === 0) {
    return (
      <div className="health">
        <div className="health-title">Device health</div>
        <div className="muted small">{online ? 'Waiting for data…' : 'Offline'}</div>
      </div>
    );
  }

  const sramMax = Math.max(64, ...hist.sram) * 1.1;
  const netMax = Math.max(64, ...hist.rx, ...hist.tx) * 1.1;
  const rxNow = hist.rx[hist.rx.length - 1] || 0;
  const txNow = hist.tx[hist.tx.length - 1] || 0;
  const kbs = (v) => (v >= 1024 ? `${(v / 1024).toFixed(1)} MB/s` : `${Math.round(v)} KB/s`);
  const low = snapshot.min_sram ? ` · low ${formatBytes(snapshot.min_sram)}` : '';
  return (
    <div className="health" title="Last 2 minutes">
      <div className="health-title">Device health</div>
      <Metric label="CPU" value={`${snapshot.c0}% · ${snapshot.c1}%`}>
        <Sparkline
          min={0}
          max={100}
          series={[
            { key: 'c0', className: 'spark-a', values: hist.c0 },
            { key: 'c1', className: 'spark-b', values: hist.c1 },
          ]}
        />
      </Metric>
      <Metric label="Free RAM" value={formatBytes(snapshot.sram)} tone={snapshot.sram < SRAM_LOW ? 'is-low' : ''}>
        <Sparkline min={0} max={sramMax} series={[{ key: 'sram', className: 'spark-a', values: hist.sram }]} />
        {low && <div className="health-note">{`internal${low}`}</div>}
      </Metric>
      <Metric label="Network" value={`↓ ${kbs(rxNow)} · ↑ ${kbs(txNow)}`}>
        <Sparkline
          min={0}
          max={netMax}
          series={[
            { key: 'rx', className: 'spark-a', values: hist.rx },
            { key: 'tx', className: 'spark-b', values: hist.tx },
          ]}
        />
        <div className="health-note">{`since boot ↓ ${formatBytes(snapshot.rx)} · ↑ ${formatBytes(snapshot.tx)}`}</div>
      </Metric>
      <div className="health-head" title={snapshot.rssi ? `${snapshot.rssi} dBm` : ''}>
        <span className="health-label">Wi-Fi</span>
        <span className="health-value">{signalLabel(snapshot.rssi)} <SignalBars rssi={snapshot.rssi} /></span>
      </div>
    </div>
  );
}
