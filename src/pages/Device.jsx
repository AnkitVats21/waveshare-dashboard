import React from 'react';
import clsx from 'clsx';
import { Volume2, Mic, Lightbulb } from 'lucide-react';
import { Card, PageHeader, Switch } from '../components/ui';
import CommitSlider from '../components/CommitSlider';
import { useNexus, LED_MODES } from '../DeviceContext';
import AlertSounds from '../components/AlertSounds';

const PRESETS = ['#ffffff', '#ffb45c', '#ff5c5c', '#ff5cc8', '#8b7bff', '#5c9dff', '#3ee0c8', '#6ae36a'];
const MODE_LABELS = { off: 'Off', solid: 'Solid', blink: 'Blink', breath: 'Breathe', rainbow: 'Rainbow' };

const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16) || 0,
  g: parseInt(hex.slice(3, 5), 16) || 0,
  b: parseInt(hex.slice(5, 7), 16) || 0,
});
const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

function SliderRow({ label, value, unit, ...props }) {
  return (
    <div className="slider-row">
      <div className="slider-head">
        <span>{label}</span>
        <span className="mono">{value}{unit}</span>
      </div>
      <CommitSlider value={typeof value === 'number' ? value : 0} {...props} />
    </div>
  );
}

export default function Device() {
  const { online, controls } = useNexus();
  const { volume, micGain, micMuted, led } = controls;
  const disabled = !online;
  const mode = LED_MODES[led.value.mode] || 'off';
  const colorHex = rgbToHex(led.value.color);
  const animated = mode === 'blink' || mode === 'breath' || mode === 'rainbow';

  const setColor = (hex) =>
    led.commit({ ...led.value, color: hexToRgb(hex), mode: mode === 'off' ? LED_MODES.indexOf('solid') : led.value.mode });

  return (
    <>
      <PageHeader title="Device" subtitle="Speaker, microphone, light and sounds." />
      <div className={clsx('device-grid', disabled && 'is-offline')}>
        <Card title="Speaker" icon={Volume2}>
          <SliderRow label="Volume" value={volume.value} unit="%" min={0} max={100} disabled={disabled} onCommit={volume.commit} />
          <div className="chips">
            {[10, 30, 50, 70, 100].map((v) => (
              <button key={v} className={clsx('chip', volume.value === v && 'is-active')} disabled={disabled} onClick={() => volume.commit(v)}>{v}%</button>
            ))}
          </div>
        </Card>

        <Card title="Microphone" icon={Mic}>
          <div className="inline-row">
            <div>
              <div>Listening</div>
              <div className="muted small">{micMuted.value ? 'Muted: the wake word is ignored.' : 'Listening for the wake word.'}</div>
            </div>
            <Switch checked={!micMuted.value} disabled={disabled} onChange={(on) => micMuted.commit(!on)} />
          </div>
          <div className="divider" />
          <SliderRow
            label="Input gain"
            value={Number(micGain.value.toFixed(1))}
            unit=" dB"
            min={0}
            max={60}
            step={0.5}
            disabled={disabled}
            onCommit={micGain.commit}
          />
          <p className="muted small">Raise it if the wake word is missed from across the room; lower it if it triggers by itself.</p>
        </Card>

        <Card title="Light" icon={Lightbulb} className="span-2">
          <div className="led-layout">
            <div className="led-preview" style={{ '--led': colorHex }} data-mode={mode === 'off' || colorHex === '#000000' ? 'off' : mode}>
              <div className="led-ring" />
            </div>
            <div className="stack grow">
              <div className="segmented segmented-wrap">
                {LED_MODES.map((m) => (
                  <button key={m} className={clsx(mode === m && 'is-active')} disabled={disabled} onClick={() => led.commit({ ...led.value, mode: LED_MODES.indexOf(m) })}>
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="swatches">
                {PRESETS.map((hex) => (
                  <button
                    key={hex}
                    className={clsx('swatch', colorHex.toLowerCase() === hex && 'is-active')}
                    style={{ background: hex }}
                    disabled={disabled}
                    onClick={() => setColor(hex)}
                    aria-label={`Color ${hex}`}
                  />
                ))}
                <label className="swatch swatch-custom" title="Custom color">
                  <input type="color" value={colorHex} disabled={disabled} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
              {animated && (
                <SliderRow
                  label="Animation speed"
                  value={led.value.speed_ms}
                  unit=" ms"
                  min={100}
                  max={2000}
                  step={50}
                  disabled={disabled}
                  onCommit={(ms) => led.commit({ ...led.value, speed_ms: ms })}
                />
              )}
            </div>
          </div>
        </Card>

        <AlertSounds disabled={disabled} />
      </div>
    </>
  );
}
