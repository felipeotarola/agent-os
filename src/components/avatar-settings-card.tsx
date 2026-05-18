'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { avatarStorageKey } from '@/components/account-menu';
import * as React from 'react';

export function AvatarSettingsCard() {
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAvatar(window.localStorage.getItem(avatarStorageKey));
  }, []);

  function persistAvatar(value: string | null) {
    if (value) {
      window.localStorage.setItem(avatarStorageKey, value);
    } else {
      window.localStorage.removeItem(avatarStorageKey);
    }
    setAvatar(value);
    window.dispatchEvent(new Event('agent-os-avatar-updated'));
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Välj en bildfil.');
      return;
    }

    if (file.size > 750_000) {
      setError('Bilden är för stor. Välj helst en avatar under 750 KB.');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => persistAvatar(String(reader.result)));
    reader.addEventListener('error', () => setError('Kunde inte läsa bilden.'));
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile avatar</CardTitle>
        <CardDescription>
          Ladda upp en lokal avatar för Felipe-kontot. Sparas i webbläsaren, inte i repo eller DB.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='flex items-center gap-4'>
          <Avatar className='size-16 rounded-2xl border border-primary/30 bg-primary/10'>
            {avatar && <AvatarImage src={avatar} alt='Felipe avatar preview' />}
            <AvatarFallback className='rounded-2xl text-2xl'>⚛️</AvatarFallback>
          </Avatar>
          <div className='space-y-1 text-sm'>
            <div className='font-medium'>Felipe × Cai</div>
            <div className='text-muted-foreground'>Visas i sidebarens account-menu.</div>
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='avatar-upload'>Upload image</Label>
          <Input id='avatar-upload' type='file' accept='image/*' onChange={onAvatarChange} />
          {error && <div className='text-destructive text-sm'>{error}</div>}
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button type='button' variant='outline' onClick={() => persistAvatar(null)}>
            <Icons.trash className='mr-2 size-4' />
            Remove avatar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
