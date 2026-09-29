import React, { useEffect, useState } from 'react';
import { Server, KeyRound, Save, RefreshCw } from 'lucide-react';
import { Card, Field, Button, Pill, Banner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { getMcpStatus, saveMcpConfig, refreshMcpTools } from '../../lib/api';

export default function McpCard() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [maxTools, setMaxTools] = useState(32);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await getMcpStatus();
      setStatus(data);
      if (data) {
        setUrl(data.url || '');
        setMaxTools(data.max_tools ?? 32);
      }
    } catch {
      // Keep state if load fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await saveMcpConfig({
        url: url.trim(),
        max_tools: Math.max(1, Math.min(32, Number(maxTools) || 32)),
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      setToken('');
      toast('MCP configuration updated');
      await load();
    } catch (err) {
      toast(`Couldn't update MCP config: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshMcpTools();
      toast('Tool refresh requested');
      setTimeout(async () => {
        await load();
        setRefreshing(false);
      }, 1500);
    } catch (err) {
      toast(`Refresh failed: ${err.message}`, 'error');
      setRefreshing(false);
    }
  };

  const isConnected = !!status?.connected;
  const isConfigured = !!status?.configured;

  return (
    <Card
      title="Remote Skills (MCP)"
      icon={Server}
      action={
        loading ? null : isConnected ? (
          <Pill tone="success">
            {status?.tools_count || 0} tools active
          </Pill>
        ) : isConfigured ? (
          <Pill tone="danger">Disconnected</Pill>
        ) : (
          <Pill tone="neutral">Disabled</Pill>
        )
      }
    >
      <p className="muted small" style={{ marginBottom: 12 }}>
        Skills from a Model Context Protocol (MCP) server (e.g. news, web search, weather): new ones need no firmware flash.
      </p>

      {status?.last_error && (
        <Banner tone="danger" style={{ marginBottom: 12 }}>
          {status.last_error}
        </Banner>
      )}

      {loading ? (
        <div className="loading" />
      ) : (
        <form className="stack" onSubmit={handleSave} style={{ gap: 12 }}>
          <Field
            label="Server endpoint"
            hint="MCP server endpoint URL (e.g. https://example.com/mcp), or leave empty to disable"
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              spellCheck={false}
              autoComplete="off"
            />
          </Field>

          <div className="two-fields">
            <Field
              label="Auth token"
              hint={status?.has_token ? 'A token is saved on device. Type to replace.' : 'Optional bearer token if required'}
            >
              <div className="input-icon">
                <KeyRound size={16} />
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={status?.has_token ? '•••••••• (saved)' : 'Bearer token (optional)'}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field label="Max tools" hint="Limit imported tools (1-32)">
              <input
                type="number"
                min={1}
                max={32}
                value={maxTools}
                onChange={(e) => setMaxTools(e.target.value)}
                className="narrow-input"
              />
            </Field>
          </div>

          {status?.tools && status.tools.length > 0 && (
            <div className="settings-group" style={{ marginTop: 4 }}>
              <div className="settings-group-title small">
                Loaded Remote Tools ({status.tools.length})
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {status.tools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="mono small bold" style={{ color: 'var(--accent)' }}>
                      {t.name}
                    </div>
                    {t.description && (
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 4 }}>
            <Button
              type="button"
              icon={RefreshCw}
              busy={refreshing}
              disabled={!isConfigured || saving}
              onClick={handleRefresh}
            >
              Refresh tools
            </Button>
            <Button type="submit" variant="primary" icon={Save} busy={saving}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
