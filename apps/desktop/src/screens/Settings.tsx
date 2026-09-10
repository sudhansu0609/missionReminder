import React, { useRef, useState } from 'react';
import { canopyColor, THEMES } from '@mission/core';
import { validateState } from '@mission/data';
import { supabase, supabaseConfigured, useStore } from '../store';
import { Button, Card, Field } from '../components/ui';

/**
 * Sync is opt-in. With no Supabase keys the app is a perfectly good local one;
 * signing in is what makes the phone and the desktop the same forest.
 */
export function Settings() {
  const { mode, email, refreshAuth, state, theme, setSettings, importState } = useStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * An export nobody could restore was a backup in name only. The file is
   * structurally checked before it is allowed anywhere near the cache, and the
   * counts are shown first, because this replaces everything on the device.
   */
  const importBackup = async (file: File) => {
    setDataMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setDataMessage('That file is not JSON.');
      return;
    }
    const result = validateState(parsed);
    if (!result.ok) {
      setDataMessage(`Refused: ${result.reason}`);
      return;
    }
    const s = result.state;
    const ok = window.confirm(
      `${s.goals.length} goals, ${s.blocks.length} blocks, ${s.sessions.length} sessions.

` +
      'Replace what is on this device?',
    );
    if (!ok) return;
    await importState(s);
    setDataMessage(
      `Restored ${s.goals.length} goals, ${s.blocks.length} blocks, ${s.sessions.length} sessions.`,
    );
  };

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await fn();
      if (error) setMessage(error.message);
      else { setMessage(ok); await refreshAuth(); }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <span className="sub">Storage is {mode}</span>
      </div>

      <div className="stack">
        <Card>
          <h2>Look</h2>
          <p className="small muted" style={{ margin: '8px 0 14px' }}>
            The theme recolours the forest as well as the interface, and it follows your
            account, so both devices match. The fourth dot on each card is the canopy.
          </p>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id}
                      className={`theme-card ${t.id === theme.id ? 'active' : ''}`}
                      onClick={() => setSettings({ themeId: t.id })}>
                <div className="theme-swatches">
                  <span className="theme-dot" style={{ background: t.colors.bg }} />
                  <span className="theme-dot" style={{ background: t.colors.panel }} />
                  <span className="theme-dot" style={{ background: t.colors.accent }} />
                  <span className="theme-dot" style={{ background: canopyColor(120, 1, 0.5, t.tree) }} />
                </div>
                <div className="row-between">
                  <strong>{t.name}</strong>
                  <span className="pill">{t.mode}</span>
                </div>
                <p className="small muted">{t.blurb}</p>
              </button>
            ))}
          </div>

          <label className="row" style={{ marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                   checked={state.settings.showVisionOnStart}
                   onChange={(e) => setSettings({ showVisionOnStart: e.target.checked })} />
            <span>
              Show the mission and a reason for a few seconds before each session
              <span className="muted small"> — click to skip it</span>
            </span>
          </label>
        </Card>

        <Card>
          <h2>Sync</h2>
          {!supabaseConfigured ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              No Supabase keys found. Everything is stored on this machine only.
              Put <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
              <code>apps/desktop/.env</code>, run <code>packages/data/schema.sql</code> in the
              Supabase SQL editor, and restart to sync with your phone.
            </p>
          ) : email ? (
            <div className="stack" style={{ marginTop: 10 }}>
              <p className="small">
                Signed in as <strong>{email}</strong>. Changes here appear on your phone within
                a second or two.
              </p>
              <div className="row">
                <Button onClick={() => run(async () => {
                  const r = await supabase!.auth.signOut();
                  return { error: r.error };
                }, 'Signed out.')}>
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ marginTop: 10 }}>
              <p className="small muted">
                Use the same account on the phone app. One account, one forest.
              </p>
              <div className="grid grid-2">
                <Field label="Email">
                  <input type="email" value={form.email}
                         onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Password">
                  <input type="password" value={form.password}
                         onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
              </div>
              <div className="row">
                <Button variant="primary" disabled={busy}
                        onClick={() => run(
                          () => supabase!.auth.signInWithPassword(form),
                          'Signed in. Pulling your forest.',
                        )}>
                  Sign in
                </Button>
                <Button disabled={busy}
                        onClick={() => run(
                          () => supabase!.auth.signUp(form),
                          'Account created. Check your email if confirmation is on.',
                        )}>
                  Create account
                </Button>
              </div>
            </div>
          )}
          {message && <p className="small warn" style={{ marginTop: 10 }}>{message}</p>}
        </Card>

        <Card>
          <h2>Your data</h2>
          <p className="small muted" style={{ marginTop: 8 }}>
            {state.goals.length} goals · {state.blocks.length} blocks · {state.sessions.length} sessions
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <Button onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `mission-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}>
              Export a backup
            </Button>
            <Button onClick={() => fileInput.current?.click()}>Import a backup</Button>
            <input ref={fileInput} type="file" accept=".json,application/json"
                   style={{ display: 'none' }}
                   onChange={(e) => {
                     const file = e.target.files?.[0];
                     e.target.value = '';   // so the same file can be picked twice
                     if (file) void importBackup(file);
                   }} />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Importing replaces everything on this device
            {mode === 'synced' ? ' and pushes it to your account.' : '.'}
          </p>
          {dataMessage && <p className="small warn" style={{ marginTop: 6 }}>{dataMessage}</p>}
        </Card>
      </div>
    </>
  );
}
