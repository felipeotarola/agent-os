import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getKnowledgeSnapshot } from '@/db/knowledge';

export default async function WikiPage() {
  const snapshot = await getKnowledgeSnapshot();
  const wikiFiles = snapshot.vault.files.filter(
    (file) => file.path.includes('/wiki/') || file.path.startsWith('knowledge/wiki/')
  );
  const rawFiles = snapshot.vault.files.filter(
    (file) => file.path.includes('/raw/') || file.path.startsWith('knowledge/raw/')
  );

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Obsidian-compatible vault
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Wiki</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Stabil kunskap, inte rålogg. Här visas wikifierade noder som kan exporteras till
              Obsidian eller läsas direkt av agenter.
            </p>
          </div>
          <Button asChild variant='outline'>
            <a href='/api/knowledge/vault/export'>Download vault.zip</a>
          </Button>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Wiki nodes</CardDescription>
              <CardTitle className='text-3xl'>{wikiFiles.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Stable synthesized pages
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Raw sources</CardDescription>
              <CardTitle className='text-3xl'>{rawFiles.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Original evidence kept separate
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>DB</CardDescription>
              <CardTitle className='text-3xl'>{snapshot.dbOnline ? 'online' : 'offline'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Bridge/Postgres-backed vault
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Wiki pages</CardTitle>
            <CardDescription>
              Wikifierade markdown-noder från Knowledge Inbox och Memory Search.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {wikiFiles.length === 0 ? (
              <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                Inga wiki-noder ännu. Lägg till rådata i Knowledge Inbox eller spara en
                Memory-träff.
              </div>
            ) : (
              wikiFiles.map((file) => (
                <details
                  key={file.path}
                  className='rounded-xl border bg-background/40 p-4'
                  open={wikiFiles.length === 1}
                >
                  <summary className='cursor-pointer font-mono text-sm font-medium'>
                    {file.path}
                  </summary>
                  <pre className='text-muted-foreground mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed'>
                    {file.content}
                  </pre>
                </details>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
