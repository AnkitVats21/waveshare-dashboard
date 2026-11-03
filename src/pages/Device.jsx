import React from 'react';
import clsx from 'clsx';
import { Volume2, Mic, Lightbulb, Speaker as SpeakerIcon, Bluetooth, Laptop } from 'lucide-react';
import { Button, Card, PageHeader, Switch } from '../components/ui';
import CommitSlider from '../components/CommitSlider';
import { useNexus, LED_MODES } from '../DeviceContext';
import { useAudioOutputs } from '../hooks/useAudioOutputs';
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
  const { bass, treble, micGain, micMuted, led } = controls;
  // Volume follows the active speaker; each speaker keeps its own level.
  const { speakers, activeOutput, activeVolume: volume, selectSpeaker, busy } = useAudioOutputs();
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
        <Card title="Speaker & Output" icon={Volume2}>
          <div className="speaker-output-block">
            <div className="speaker-output-head">
              <span className="field-label">Active Speaker</span>
              <span className="pill pill-ok">{activeOutput.name}</span>
            </div>
            <div className="speaker-tiles">
              {speakers.map((spk) => {
                const Icon = spk.type === 'bluetooth' ? Bluetooth : spk.type === 'satellite' ? Laptop : SpeakerIcon;
                const isCurrent = spk.active;
                return (
                  <div
                    key={spk.id}
                    className={clsx('speaker-tile', isCurrent && 'is-active')}
                    onClick={() => !isCurrent && selectSpeaker(spk)}
                  >
                    <div className="speaker-tile-left">
                      <div className="speaker-tile-icon">
                        <Icon size={16} />
                      </div>
                      <div className="speaker-tile-body">
                        <span className="speaker-tile-name">{spk.name}</span>
                        <span className="muted small">
                          {spk.description}
                          {typeof spk.volume === 'number' && ` · ${spk.volume}%`}
                        </span>
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="pill pill-ok">Active</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        busy={busy}
                        disabled={disabled || busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectSpeaker(spk);
                        }}
                      >
                        Select
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="divider" />

          <SliderRow label={`Volume · ${activeOutput.name}`} value={volume.value} unit="%" min={0} max={100} disabled={disabled} onCommit={volume.commit} />
          <div className="chips">
            {[10, 30, 50, 70, 100].map((v) => (
              <button key={v} className={clsx('chip', volume.value === v && 'is-active')} disabled={disabled} onClick={() => volume.commit(v)}>{v}%</button>
            ))}
          </div>
          <SliderRow label="Bass" value={bass.value} unit=" dB" min={-12} max={6} disabled={disabled} onCommit={bass.commit} />
          <SliderRow label="Treble" value={treble.value} unit=" dB" min={-12} max={6} disabled={disabled} onCommit={treble.commit} />
          <div className="muted small">
            0 dB is flat. Lower the treble if the speaker sounds harsh. A boost makes everything a little
            quieter so the loud parts don't distort; raise the volume to make up.
            {(bass.value !== 0 || treble.value !== 0) && (
              <> <button className="link" disabled={disabled} onClick={() => { bass.commit(0); treble.commit(0); }}>Reset to flat</button></>
            )}
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
