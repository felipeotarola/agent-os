'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import * as React from 'react';

type ManagedSecret = {
  name: string;
  description: string;
  path: string;
  exists: boolean;
  bytes: number;
  fingerprint: string;
  updatedAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString('sv-SE');
}

export function SecretsSettingsCard() {
  const [secrets, setSecrets] = React.useState<ManagedSecret[]>([]);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/secrets', { cache: 'no-store' });
      const data = (await response.json()) as { secrets?: ManagedSecret[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not load secrets.');
      setSecrets(data.secrets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load secrets.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, value })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not save secret.');
      setName('');
      setDescription('');
      setValue('');
      setMessage('Secret saved. Value will not be shown again.');
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save secret.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSecret(secretName: string) {
    const confirmed = window.confirm(`Delete ${secretName}? This removes the local secret file.`);
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/secrets/${encodeURIComponent(secretName)}`, {
        method: 'DELETE'
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not delete secret.');
      setMessage(`${secretName} deleted.`);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete secret.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys & secrets</CardTitle>
        <CardDescription>
          Server-side vault for local API keys. Values are written to OpenClaw secrets storage and
          never rendered back in the UI.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <form className='space-y-3 rounded-xl border bg-background/40 p-4' onSubmit={onSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='secret-name'>Name</Label>
            <Input
              id='secret-name'
              value={name}
              onChange={(event) => setName(event.target.value.toUpperCase())}
              placeholder='ELEVENLABS_API_KEY'
              autoComplete='off'
              spellCheck={false}
            />
            <div className='text-muted-foreground text-xs'>
              Use ENV-style names only: uppercase letters, numbers and underscores.
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='secret-description'>Description</Label>
            <Textarea
              id='secret-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder='Used by TTS / ElevenLabs'
              maxLength={240}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='secret-value'>Secret value</Label>
            <Input
              id='secret-value'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder='Paste key once'
              type='password'
              autoComplete='new-password'
              spellCheck={false}
            />
            <div className='text-muted-foreground text-xs'>
              Saved to /root/.openclaw/secrets/agent-os with file mode 600. Not stored in git or DB.
            </div>
          </div>

          <Button type='submit' disabled={saving}>
            {saving ? 'Saving…' : 'Save secret'}
          </Button>
        </form>

        {(message || error) && (
          <div className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}>
            {error ?? message}
          </div>
        )}

        <div className='space-y-3'>
          <div className='text-sm font-medium'>Stored secrets</div>
          {loading ? (
            <div className='text-muted-foreground rounded-xl border bg-background/40 p-4 text-sm'>
              Loading…
            </div>
          ) : secrets.length === 0 ? (
            <div className='text-muted-foreground rounded-xl border bg-background/40 p-4 text-sm'>
              No managed secrets yet.
            </div>
          ) : (
            secrets.map((secret) => (
              <div key={secret.name} className='rounded-xl border bg-background/40 p-4'>
                <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                  <div className='min-w-0 space-y-1'>
                    <div className='font-mono text-sm font-medium'>{secret.name}</div>
                    {secret.description && (
                      <div className='text-muted-foreground text-sm'>{secret.description}</div>
                    )}
                    <div className='text-muted-foreground text-xs'>
                      fingerprint {secret.fingerprint} · {secret.bytes} bytes · updated{' '}
                      {formatDate(secret.updatedAt)}
                    </div>
                    <div className='text-muted-foreground truncate font-mono text-xs'>
                      {secret.path}
                    </div>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void deleteSecret(secret.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
