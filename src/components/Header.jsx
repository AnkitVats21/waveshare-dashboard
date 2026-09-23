import React, { useState } from 'react';
import { Zap, Link, Code2 } from 'lucide-react';

export default function Header({ espHost, onHostChange, online, deviceConnected, devMode, onToggleDevMode }) {
  const [localHost, setLocalHost] = useState(espHost);

  const handleSubmit = (e) => {
    e.preventDefault();
    onHostChange(localHost);
  };

  const statusLabel = !online ? 'Device offline' : deviceConnected ? 'Device online' : 'Connecting...';
  const statusClass = !online ? 'dot-offline' : deviceConnected ? 'dot-online' : 'dot-partial';

  return (
    <header className="app-header">
      <div className="app-header-left">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={18} />
          </div>
          <span className="brand-name">WAVESHARE<span className="brand-accent">.CORE</span></span>
        </div>

        <form className="host-form" onSubmit={handleSubmit}>
          <span className={`status-dot ${statusClass}`} title={statusLabel} />
          <input
            type="text"
            value={localHost}
            onChange={(e) => setLocalHost(e.target.value)}
            placeholder="Device host"
            title="Device IP or hostname (e.g. 192.168.1.14 or nexus.local)"
          />
          <button type="submit" title="Save & connect">
            <Link size={15} />
          </button>
        </form>
      </div>

      <button
        className={`dev-toggle ${devMode ? 'active' : ''}`}
        onClick={onToggleDevMode}
        title="Developer mode: shows live logs"
      >
        <Code2 size={16} />
      </button>
    </header>
  );
}
