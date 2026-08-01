'use client';

import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  createCredential,
  deleteCredential,
  listCredentials,
  updateCredential
} from '@/features/credentials/api/service';
import type { ManagedCredential } from '@/features/credentials/api/types';
import type { CredentialFormValues } from '@/features/credentials/schemas/credential';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { toast } from 'sonner';
import { CredentialEditorDialog } from './credential-editor-dialog';

const PAGE_SIZE = 15;
const ALL_PROJECTS = '__all__';
const UNASSIGNED_PROJECT = '__unassigned__';

type SortOrder = 'name' | 'recent';

const DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return DATE_FORMATTER.format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function projectLabel(project: string): string {
  return project || 'Unassigned';
}

function credentialSearchText(credential: ManagedCredential): string {
  return [credential.name, credential.project, credential.description, credential.fingerprint]
    .join(' ')
    .toLocaleLowerCase();
}

interface CredentialRowActionsProps {
  credential: ManagedCredential;
  onDelete: (credential: ManagedCredential) => void;
  onEdit: (credential: ManagedCredential) => void;
  onSelect: (credential: ManagedCredential) => void;
}

function CredentialRowActions({
  credential,
  onDelete,
  onEdit,
  onSelect
}: CredentialRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={`Actions for ${credential.name}`}
        >
          <Icons.ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onSelect(credential)}>
            <Icons.info />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(credential)}>
            <Icons.edit />
            Edit or rotate
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant='destructive' onSelect={() => onDelete(credential)}>
            <Icons.trash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CredentialsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Credential</TableHead>
          <TableHead className='hidden md:table-cell'>Project</TableHead>
          <TableHead className='hidden lg:table-cell'>Updated</TableHead>
          <TableHead className='hidden xl:table-cell'>Fingerprint</TableHead>
          <TableHead className='w-12'>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }, (_, index) => (
          <TableRow key={index}>
            <TableCell>
              <div className='flex flex-col gap-2'>
                <Skeleton className='h-4 w-48' />
                <Skeleton className='h-3 w-64 max-w-full' />
              </div>
            </TableCell>
            <TableCell className='hidden md:table-cell'>
              <Skeleton className='h-5 w-24' />
            </TableCell>
            <TableCell className='hidden lg:table-cell'>
              <Skeleton className='h-4 w-32' />
            </TableCell>
            <TableCell className='hidden xl:table-cell'>
              <Skeleton className='h-4 w-24' />
            </TableCell>
            <TableCell>
              <Skeleton className='size-8' />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface CredentialsEmptyStateProps {
  filtered: boolean;
  onAdd: () => void;
  onClearFilters: () => void;
}

function CredentialsEmptyState({ filtered, onAdd, onClearFilters }: CredentialsEmptyStateProps) {
  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{filtered ? <Icons.search /> : <Icons.lock />}</EmptyMedia>
        <EmptyTitle>
          {filtered ? 'No matching credentials' : 'No managed credentials yet'}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? 'Try another name, description, fingerprint, or project filter.'
            : 'Add the first server-side key without placing it in git, markdown, or the database.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          type='button'
          variant={filtered ? 'outline' : 'default'}
          onClick={filtered ? onClearFilters : onAdd}
        >
          {filtered ? (
            <Icons.close data-icon='inline-start' />
          ) : (
            <Icons.add data-icon='inline-start' />
          )}
          {filtered ? 'Clear filters' : 'Add credential'}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

interface CredentialsRightRailProps {
  canAdd: boolean;
  credential: ManagedCredential | null;
  inventoryKnown: boolean;
  projectCount: number;
  totalCount: number;
  unassignedCount: number;
  onAdd: () => void;
  onEdit: (credential: ManagedCredential) => void;
}

function CredentialsRightRail({
  canAdd,
  credential,
  inventoryKnown,
  projectCount,
  totalCount,
  unassignedCount,
  onAdd,
  onEdit
}: CredentialsRightRailProps) {
  async function copyFingerprint() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.fingerprint);
      toast.success('Fingerprint copied.');
    } catch {
      toast.error('Could not copy fingerprint.');
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vault overview</CardTitle>
          <CardDescription>Managed credential metadata only.</CardDescription>
          <CardAction>
            <Badge variant='secondary'>Local</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='grid grid-cols-3 gap-3 text-center'>
          <div className='flex flex-col gap-1'>
            <span className='text-2xl font-semibold tabular-nums'>
              {inventoryKnown ? totalCount : '—'}
            </span>
            <span className='text-muted-foreground text-xs'>Credentials</span>
          </div>
          <div className='flex flex-col gap-1'>
            <span className='text-2xl font-semibold tabular-nums'>
              {inventoryKnown ? projectCount : '—'}
            </span>
            <span className='text-muted-foreground text-xs'>Projects</span>
          </div>
          <div className='flex flex-col gap-1'>
            <span className='text-2xl font-semibold tabular-nums'>
              {inventoryKnown ? unassignedCount : '—'}
            </span>
            <span className='text-muted-foreground text-xs'>Unassigned</span>
          </div>
        </CardContent>
        <CardFooter>
          <Button type='button' className='w-full' disabled={!canAdd} onClick={onAdd}>
            <Icons.add data-icon='inline-start' />
            Add credential
          </Button>
        </CardFooter>
      </Card>

      {credential ? (
        <Card>
          <CardHeader>
            <CardTitle className='break-all font-mono text-sm'>{credential.name}</CardTitle>
            <CardDescription>
              {credential.description || 'No description provided.'}
            </CardDescription>
            <CardAction>
              <Badge variant='outline'>{projectLabel(credential.project)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className='flex flex-col gap-3 text-sm'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>Updated</span>
              <span className='text-right'>{formatDate(credential.updatedAt)}</span>
            </div>
            <Separator />
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>Size</span>
              <span>{formatBytes(credential.bytes)}</span>
            </div>
            <Separator />
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground'>Fingerprint</span>
              <div className='flex items-center justify-between gap-2'>
                <code className='font-mono text-xs'>{credential.fingerprint}</code>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label='Copy fingerprint'
                  onClick={() => void copyFingerprint()}
                >
                  <Icons.copy />
                </Button>
              </div>
            </div>
            <Separator />
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground'>Managed file</span>
              <code className='text-muted-foreground break-all font-mono text-xs'>
                {credential.path}
              </code>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={() => onEdit(credential)}
            >
              <Icons.edit data-icon='inline-start' />
              Edit or rotate
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Select a credential</CardTitle>
            <CardDescription>
              Choose a name in the inventory to inspect its safe metadata here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Security model</CardTitle>
          <CardDescription>The inventory is deliberately one-way.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3 text-sm'>
          <div className='flex items-start gap-3'>
            <Icons.eyeOff className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            <p>Stored values are never returned to this page. Edit can only replace a value.</p>
          </div>
          <div className='flex items-start gap-3'>
            <Icons.shieldCheck className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            <p>Files use restricted permissions and remain outside git and Postgres.</p>
          </div>
          <div className='flex items-start gap-3'>
            <Icons.warning className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            <p>
              A host environment value with the same name takes precedence over this managed file.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

interface DeleteCredentialDialogProps {
  credential: ManagedCredential | null;
  deleting: boolean;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

function DeleteCredentialDialog({
  credential,
  deleting,
  onConfirm,
  onOpenChange
}: DeleteCredentialDialogProps) {
  return (
    <AlertDialog
      open={credential !== null}
      onOpenChange={(open) => {
        if (!deleting) onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {credential?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the managed secret file and its metadata. Integrations using it
            may stop working immediately or after restart.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            type='button'
            variant='destructive'
            isLoading={deleting}
            onClick={() => void onConfirm()}
          >
            Delete credential
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CredentialsPage() {
  const [credentials, setCredentials] = React.useState<ManagedCredential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [projectFilter, setProjectFilter] = React.useState(ALL_PROJECTS);
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('name');
  const [page, setPage] = React.useState(0);
  const [selectedName, setSelectedName] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingCredential, setEditingCredential] = React.useState<ManagedCredential | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ManagedCredential | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextCredentials = await listCredentials(signal);
      setCredentials(nextCredentials);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : 'Could not load credentials.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const projects = React.useMemo(
    () =>
      Array.from(
        new Set(credentials.map((credential) => credential.project).filter(Boolean))
      ).toSorted((left, right) => left.localeCompare(right)),
    [credentials]
  );

  const unassignedCount = React.useMemo(
    () => credentials.filter((credential) => !credential.project).length,
    [credentials]
  );

  const filteredCredentials = React.useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
    const filtered = credentials.filter((credential) => {
      const matchesSearch =
        normalizedQuery.length === 0 || credentialSearchText(credential).includes(normalizedQuery);
      const matchesProject =
        projectFilter === ALL_PROJECTS ||
        (projectFilter === UNASSIGNED_PROJECT
          ? !credential.project
          : credential.project === projectFilter);
      return matchesSearch && matchesProject;
    });

    return filtered.toSorted((left, right) => {
      if (sortOrder === 'recent') {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
      return left.name.localeCompare(right.name);
    });
  }, [credentials, deferredQuery, projectFilter, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(filteredCredentials.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const visibleCredentials = filteredCredentials.slice(pageStart, pageStart + PAGE_SIZE);
  const selectedCredential =
    credentials.find((credential) => credential.name === selectedName) ?? null;
  const filtersActive = query.trim().length > 0 || projectFilter !== ALL_PROJECTS;
  const inventoryUnavailable = Boolean(loadError && credentials.length === 0);
  const inventoryKnown = !loading && !inventoryUnavailable;

  function openAddDialog() {
    if (!inventoryKnown) return;
    setEditingCredential(null);
    setEditorOpen(true);
  }

  function openEditDialog(credential: ManagedCredential) {
    setSelectedName(credential.name);
    setEditingCredential(credential);
    setEditorOpen(true);
  }

  function clearFilters() {
    setQuery('');
    setProjectFilter(ALL_PROJECTS);
    setPage(0);
  }

  async function saveCredential(values: CredentialFormValues): Promise<void> {
    if (editingCredential) {
      const replacement = values.value;
      const updated = await updateCredential(editingCredential.name, {
        project: values.project.trim(),
        description: values.description.trim(),
        ...(replacement.length > 0 ? { value: replacement } : {})
      });
      setCredentials((current) =>
        current.map((credential) => (credential.name === updated.name ? updated : credential))
      );
      setSelectedName(updated.name);
      toast.success(
        replacement.length > 0 ? 'Credential updated and rotated.' : 'Credential details updated.'
      );
      return;
    }

    const normalizedName = values.name.trim().toUpperCase();
    if (credentials.some((credential) => credential.name === normalizedName)) {
      throw new Error('That credential already exists. Open it and choose Edit or rotate.');
    }

    const created = await createCredential({
      name: normalizedName,
      project: values.project.trim(),
      description: values.description.trim(),
      value: values.value
    });
    setCredentials((current) => [...current, created]);
    setSelectedName(created.name);
    toast.success('Credential stored. Its value is now hidden.');
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCredential(pendingDelete.name);
      setCredentials((current) =>
        current.filter((credential) => credential.name !== pendingDelete.name)
      );
      if (selectedName === pendingDelete.name) setSelectedName(null);
      toast.success(`${pendingDelete.name} deleted.`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete credential.');
    } finally {
      setDeleting(false);
    }
  }

  const firstVisible = filteredCredentials.length === 0 ? 0 : pageStart + 1;
  const lastVisible = Math.min(pageStart + PAGE_SIZE, filteredCredentials.length);

  return (
    <PageContainer
      pageTitle='Credentials'
      pageDescription='A searchable, project-aware inventory for the server-side keys used across Agent OS.'
      pageHeaderAction={
        <Button type='button' disabled={!inventoryKnown} onClick={openAddDialog}>
          <Icons.add data-icon='inline-start' />
          Add credential
        </Button>
      }
      rightRailTitle='Credential context'
      rightRailDescription='Vault status, selected metadata, and safety rules.'
      rightRail={
        <CredentialsRightRail
          canAdd={inventoryKnown}
          credential={selectedCredential}
          inventoryKnown={inventoryKnown}
          projectCount={projects.length}
          totalCount={credentials.length}
          unassignedCount={unassignedCount}
          onAdd={openAddDialog}
          onEdit={openEditDialog}
        />
      }
    >
      <Card>
        <CardHeader className='border-b'>
          <CardTitle>Credential inventory</CardTitle>
          <CardDescription>
            Scan names quickly; inspect paths and fingerprints only when you need them.
          </CardDescription>
          <CardAction>
            <Badge variant='outline'>
              {loading
                ? 'Loading…'
                : inventoryUnavailable
                  ? 'Unavailable'
                  : `${credentials.length} stored`}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,1fr)_13rem_11rem]'>
            <InputGroup data-disabled={loading || inventoryUnavailable || undefined}>
              <InputGroupAddon align='inline-start'>
                <Icons.search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder='Search name, project, description, fingerprint…'
                aria-label='Search credentials'
                autoComplete='off'
                spellCheck={false}
                disabled={loading || inventoryUnavailable}
              />
              {query ? (
                <InputGroupAddon align='inline-end'>
                  <InputGroupButton
                    size='icon-xs'
                    aria-label='Clear credential search'
                    onClick={() => {
                      setQuery('');
                      setPage(0);
                    }}
                  >
                    <Icons.close />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>

            <Select
              value={projectFilter}
              disabled={loading || inventoryUnavailable}
              onValueChange={(value) => {
                setProjectFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger className='w-full' aria-label='Filter credentials by project'>
                <SelectValue placeholder='All projects' />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Project</SelectLabel>
                  <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
                  {unassignedCount > 0 ? (
                    <SelectItem value={UNASSIGNED_PROJECT}>Unassigned</SelectItem>
                  ) : null}
                  {projects.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={sortOrder}
              disabled={loading || inventoryUnavailable}
              onValueChange={(value: SortOrder) => {
                setSortOrder(value);
                setPage(0);
              }}
            >
              <SelectTrigger className='w-full' aria-label='Sort credentials'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Sort by</SelectLabel>
                  <SelectItem value='name'>Name A–Z</SelectItem>
                  <SelectItem value='recent'>Recently updated</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {loadError ? (
            <Alert variant='destructive'>
              <Icons.alertCircle />
              <AlertTitle>Credential inventory is unavailable</AlertTitle>
              <AlertDescription className='flex flex-col items-start gap-3'>
                <p>{loadError}</p>
                <Button type='button' variant='outline' size='sm' onClick={() => void load()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <CredentialsTableSkeleton />
          ) : inventoryUnavailable ? null : filteredCredentials.length === 0 ? (
            <CredentialsEmptyState
              filtered={filtersActive}
              onAdd={openAddDialog}
              onClearFilters={clearFilters}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credential</TableHead>
                  <TableHead className='hidden md:table-cell'>Project</TableHead>
                  <TableHead className='hidden lg:table-cell'>Updated</TableHead>
                  <TableHead className='hidden xl:table-cell'>Fingerprint</TableHead>
                  <TableHead className='w-12'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(query !== deferredQuery && 'opacity-70 transition-opacity')}>
                {visibleCredentials.map((credential) => (
                  <TableRow
                    key={credential.name}
                    data-state={credential.name === selectedName ? 'selected' : undefined}
                  >
                    <TableCell className='min-w-64 whitespace-normal'>
                      <div className='flex min-w-0 flex-col items-start gap-1'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-auto max-w-full justify-start px-0'
                          onClick={() => setSelectedName(credential.name)}
                        >
                          <span className='truncate font-mono font-semibold'>
                            {credential.name}
                          </span>
                        </Button>
                        <span className='text-muted-foreground line-clamp-2 text-xs'>
                          {credential.description || 'No description'}
                        </span>
                        <Badge variant='outline' className='md:hidden'>
                          {projectLabel(credential.project)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className='hidden md:table-cell'>
                      <Badge variant='outline'>{projectLabel(credential.project)}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground hidden lg:table-cell'>
                      {formatDate(credential.updatedAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground hidden font-mono text-xs xl:table-cell'>
                      {credential.fingerprint}
                    </TableCell>
                    <TableCell>
                      <CredentialRowActions
                        credential={credential}
                        onSelect={(selected) => setSelectedName(selected.name)}
                        onEdit={openEditDialog}
                        onDelete={setPendingDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className='flex flex-col gap-3 border-t sm:flex-row sm:justify-between'>
          <p className='text-muted-foreground text-sm' aria-live='polite'>
            {loading
              ? 'Loading credentials…'
              : inventoryUnavailable
                ? 'Inventory unavailable'
                : `Showing ${firstVisible}–${lastVisible} of ${filteredCredentials.length}`}
          </p>
          {!inventoryUnavailable ? (
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-sm tabular-nums'>
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={safePage === 0 || loading}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={safePage >= pageCount - 1 || loading}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardFooter>
      </Card>

      <CredentialEditorDialog
        key={
          editingCredential
            ? `${editingCredential.name}:${editingCredential.updatedAt}`
            : 'new-credential'
        }
        credential={editingCredential}
        existingProjects={projects}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={saveCredential}
      />
      <DeleteCredentialDialog
        credential={pendingDelete}
        deleting={deleting}
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </PageContainer>
  );
}
