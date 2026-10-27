import React, { useEffect, useState } from 'react';
import { Network, KeyRound, Save, AlertTriangle } from 'lucide-react';
import { Banner, Button, Card, Field, Pill, Row, Segmented } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { getHub, saveHub } from '../../lib/api';

const VOICE_MODES = [
  { value: 'direct', label: 'Standalone' },
  { value: 'hub', label: 'Hub' },
  { value: 'auto', label: 'Auto' },
];
const VOICE_HINTS = {
  direct: 'The board talks to Gemini itself; the hub is not used for voice.',
  hub: 'Voice always goes through the hub; without it the assistant does not answer.',
  auto: 'Through the hub when it is connected, otherwise straight to Gemini.',
};
const MUSIC_MODES = [
  { value: 'local', label: 'On board' },
  { value: 'auto', label: 'Hub' },
];
const MUSIC_HINTS = {
  local: 'The board keeps the queue and looks songs up itself.',
  auto: 'The hub runs the queue and song lookups while it is connected; the board on its own otherwise.',
};

// Field is a <label>: a click on its text would press the first option.
function Choice({ label, hint, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// The board's link to a nexus hub on the LAN (GET/POST /api/hub).
export default function HubCard() {
  const toast = useToast();
  const [hub, setHub] = useState(null);
  const [error, setError] = useState('');
  const [backend, setBackend] = useState('auto');
  const [music, setMusic] = useState('auto');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const h = await getHub();
      setHub(h);
      setBackend(h.backend);
      setMusic(h.music);
      setUrl(h.configured_url || '');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const dirty = hub && (backend !== hub.backend || music !== hub.music ||
    url.trim() !== (hub.configured_url || '') || token.trim() !== '');

  const save = async (e) => {
    e?.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !/^wss?:\/\//.test(trimmed)) {
      toast('The hub address starts with ws:// or wss://', 'error');
      return;
    }
    // Only what changed: a new music mode or address reconnects the link.
    const changes = {};
    if (backend !== hub.backend) changes.backend = backend;
    if (music !== hub.music) changes.music = music;
    if (trimmed !== (hub.configured_url || '')) changes.url = trimmed;
    if (token.trim()) changes.token = token.trim();
    setSaving(true);
    try {
      await saveHub(changes);
      setToken('');
      toast('Hub settings saved');
      // The link takes a moment to come up after an address change.
      setTimeout(load, 2500);
      await load();
    } catch (err) {
      toast(`Couldn't save hub settings: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const status = !hub ? null
    : !hub.compiled ? <Pill tone="neutral">Not in this firmware</Pill>
    : hub.up ? <Pill tone="success">Connected</Pill>
    : <Pill tone="danger">Not connected</Pill>;

  return (
    <Card title="Hub" icon={Network} action={status}>
      {error && <Banner tone="danger" icon={AlertTriangle}>{error}</Banner>}
      {!hub && !error && <div className="loading" />}
      {hub && !hub.compiled && (
        <Banner tone="warn">This firmware was built without hub support; the board runs standalone.</Banner>
      )}
      {hub && hub.compiled && (
        <form className="stack" onSubmit={save} style={{ gap: 12 }}>
          <div className="kv">
            <Row label="Hub">{hub.up ? (hub.hub_version || 'connected') : '—'}</Row>
            <Row label="Address">{hub.url ? `${hub.url}${hub.from_mdns ? ' (found automatically)' : ''}` : '—'}</Row>
            {hub.music_active && <Row label="Music">run by the hub</Row>}
          </div>
          {hub.last_error && !hub.up && <Banner tone="warn">{hub.last_error}</Banner>}

          <Choice label="Voice" hint={VOICE_HINTS[backend]}>
            <Segmented options={VOICE_MODES} value={backend} onChange={setBackend} />
          </Choice>
          <Choice label="Music" hint={MUSIC_HINTS[music]}>
            <Segmented options={MUSIC_MODES} value={music} onChange={setMusic} />
          </Choice>

          <Field label="Hub address" hint="e.g. ws://192.168.1.21:8380/hub/board. Leave empty to find the hub on the network automatically.">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Find automatically"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Hub token" hint={hub.has_token ? 'A token is saved on the board. Type to replace it.' : 'The token from the hub’s token file.'}>
            <div className="input-icon">
              <KeyRound size={16} />
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hub.has_token ? '•••••••• (saved)' : 'Hub token'}
                autoComplete="off"
              />
            </div>
          </Field>

          <div className="form-actions">
            <Button type="submit" variant="primary" icon={Save} busy={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
