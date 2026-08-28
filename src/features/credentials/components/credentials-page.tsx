'use client';

import {
  createCredential,
  deleteCredential,
  listCredentials,
  updateCredential
} from '@/features/credentials/api/service';
import type { ManagedCredential } from '@/features/credentials/api/types';
import * as React from 'react';

const CREDENTIAL_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;

interface CredentialDraft {
  name: string;
  project: string;
  description: string;
  value: string;
}

interface Notice {
  tone: 'error' | 'success';
  text: string;
}

interface CredentialDialogProps {
  credential: ManagedCredential | null;
  projects: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: CredentialDraft) => Promise<void>;
}

interface DeleteDialogProps {
  credential: ManagedCredential;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Okänd tid'
    : DATE_FORMATTER.format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} kB`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function validateDraft(
  draft: CredentialDraft,
  editing: boolean
): string | null {
  if (!CREDENTIAL_NAME_PATTERN.test(draft.name.trim().toUpperCase())) {
    return 'Namnet måste vara 2–80 versaler, siffror eller understreck.';
  }
  if (draft.project.trim().length > 80)
    return 'Projekt får vara högst 80 tecken.';
  if (draft.description.trim().length > 240)
    return 'Beskrivningen får vara högst 240 tecken.';
  if (!editing && !draft.value.trim()) return 'Ett hemligt värde krävs.';
  if (editing && !draft.value.trim())
    return 'Klistra in det nya värdet som ska ersätta det gamla.';
  if (draft.value.length > 16_384) return 'Värdet är för stort.';
  return null;
}

function CredentialDialog({
  credential,
  projects,
  saving,
  onClose,
  onSave
}: CredentialDialogProps) {
  const editing = credential !== null;
  const [draft, setDraft] = React.useState<CredentialDraft>({
    name: credential?.name ?? '',
    project: credential?.project ?? '',
    description: credential?.description ?? '',
    value: ''
  });
  const [visible, setVisible] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const nameFieldRef = React.useRef<HTMLInputElement>(null);
  const valueFieldRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (editing ? valueFieldRef : nameFieldRef).current?.focus();
  }, [editing]);

  React.useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateDraft(draft, editing);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim().toUpperCase(),
        project: draft.project.trim(),
        description: draft.description.trim()
      });
    } catch (error) {
      setFormError(errorMessage(error, 'Credential kunde inte sparas.'));
    }
  }

  return (
    <div
      className='vault-overlay'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className='vault-modal'
        role='dialog'
        aria-modal='true'
        aria-labelledby='credential-dialog-title'
        aria-describedby='credential-dialog-description'
      >
        <h2 id='credential-dialog-title'>
          {editing ? `Rotera ${credential.name}` : 'Lägg till credential'}
        </h2>
        <p id='credential-dialog-description' className='vault-modal-copy'>
          {editing
            ? 'Det nya värdet ersätter det gamla. Det lagrade värdet läses aldrig tillbaka till webbläsaren.'
            : 'Värdet lagras på serversidan och visas inte igen efter att du sparat.'}
        </p>

        {formError ? (
          <p className='vault-form-error' role='alert'>
            {formError}
          </p>
        ) : null}

        <form className='vault-form' onSubmit={(event) => void submit(event)}>
          <label className='vault-field'>
            <span>Nyckelnamn</span>
            <input
              ref={nameFieldRef}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value.toUpperCase()
                }))
              }
              placeholder='OPENAI_API_KEY'
              autoComplete='off'
              spellCheck={false}
              maxLength={80}
              disabled={editing || saving}
              required
            />
          </label>

          <label className='vault-field'>
            <span>Agent, projekt eller scope</span>
            <input
              value={draft.project}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  project: event.target.value
                }))
              }
              placeholder='Charles, G26, gemensamt…'
              list='vault-projects'
              autoComplete='off'
              maxLength={80}
              disabled={saving}
            />
          </label>
          <datalist id='vault-projects'>
            {projects.map((project) => (
              <option key={project} value={project} />
            ))}
          </datalist>

          <label className='vault-field'>
            <span>Beskrivning</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
              placeholder='Vem använder nyckeln och till vad? Skriv aldrig hemligheter här.'
              maxLength={240}
              disabled={saving}
            />
          </label>

          <div className='vault-secret-row'>
            <label className='vault-field'>
              <span>{editing ? 'Nytt hemligt värde' : 'Hemligt värde'}</span>
              <input
                ref={valueFieldRef}
                value={draft.value}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    value: event.target.value
                  }))
                }
                type={visible ? 'text' : 'password'}
                placeholder={
                  editing ? 'Klistra in ersättningsvärdet' : 'Klistra in värdet'
                }
                autoComplete='new-password'
                spellCheck={false}
                disabled={saving}
                required
              />
            </label>
            <button
              className='vault-button vault-button-small'
              type='button'
              aria-pressed={visible}
              onClick={() => setVisible((current) => !current)}
              disabled={saving}
            >
              {visible ? 'Dölj' : 'Visa'}
            </button>
          </div>

          <div className='vault-modal-actions'>
            <button
              className='vault-button'
              type='button'
              onClick={onClose}
              disabled={saving}
            >
              Avbryt
            </button>
            <button
              className='vault-button vault-button-primary'
              type='submit'
              disabled={saving}
            >
              {saving
                ? 'Sparar…'
                : editing
                  ? 'Rotera nyckel'
                  : 'Spara credential'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DeleteDialog({
  credential,
  deleting,
  onClose,
  onDelete
}: DeleteDialogProps) {
  const [confirmation, setConfirmation] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const fieldRef = React.useRef<HTMLInputElement>(null);
  const confirmed = confirmation === credential.name;

  React.useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  React.useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleting) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [deleting, onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    setFormError(null);
    try {
      await onDelete();
    } catch (error) {
      setFormError(errorMessage(error, 'Credential kunde inte tas bort.'));
    }
  }

  return (
    <div
      className='vault-overlay'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onClose();
      }}
    >
      <section
        className='vault-modal'
        role='alertdialog'
        aria-modal='true'
        aria-labelledby='delete-dialog-title'
        aria-describedby='delete-dialog-description'
      >
        <h2 id='delete-dialog-title'>Flytta credential till papperskorgen?</h2>
        <p id='delete-dialog-description' className='vault-danger-copy'>
          Nyckeln <strong>{credential.name}</strong> och dess metadata flyttas
          till serverns skyddade papperskorg. Den kan återställas
          administrativt, men anslutna agenter kan sluta fungera direkt.
        </p>

        {formError ? (
          <p className='vault-form-error' role='alert'>
            {formError}
          </p>
        ) : null}

        <form className='vault-form' onSubmit={(event) => void submit(event)}>
          <label className='vault-field'>
            <span>Skriv {credential.name} för att bekräfta</span>
            <input
              ref={fieldRef}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete='off'
              spellCheck={false}
              disabled={deleting}
            />
          </label>
          <div className='vault-modal-actions'>
            <button
              className='vault-button'
              type='button'
              onClick={onClose}
              disabled={deleting}
            >
              Avbryt
            </button>
            <button
              className='vault-button vault-button-danger'
              type='submit'
              disabled={!confirmed || deleting}
            >
              {deleting ? 'Flyttar…' : 'Flytta till papperskorgen'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CredentialsPage() {
  const [credentials, setCredentials] = React.useState<ManagedCredential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
  const [query, setQuery] = React.useState('');
  const [project, setProject] = React.useState('all');
  const [selectedName, setSelectedName] = React.useState<string | null>(null);
  const [editorCredential, setEditorCredential] = React.useState<
    ManagedCredential | null | undefined
  >(undefined);
  const [pendingDelete, setPendingDelete] =
    React.useState<ManagedCredential | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextCredentials = await listCredentials(signal);
      setCredentials(nextCredentials);
      setSelectedName((current) =>
        current && nextCredentials.some((item) => item.name === current)
          ? current
          : (nextCredentials[0]?.name ?? null)
      );
      setLastChecked(new Date());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(errorMessage(error, 'Credential-valvet kunde inte nås.'));
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
        new Set(
          credentials.map((credential) => credential.project).filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right, 'sv')),
    [credentials]
  );

  const filteredCredentials = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('sv');
    return credentials.filter((credential) => {
      const matchesProject =
        project === 'all' || credential.project === project;
      const searchable = [
        credential.name,
        credential.project,
        credential.description,
        credential.fingerprint
      ]
        .join(' ')
        .toLocaleLowerCase('sv');
      return (
        matchesProject &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [credentials, project, query]);

  const selectedCredential =
    credentials.find((credential) => credential.name === selectedName) ?? null;
  const online = !loading && !loadError;
  const statusState = loading ? 'loading' : loadError ? 'error' : 'online';

  function openAdd() {
    setNotice(null);
    setEditorCredential(null);
  }

  function openRotate(credential: ManagedCredential) {
    setNotice(null);
    setSelectedName(credential.name);
    setEditorCredential(credential);
  }

  async function saveCredential(draft: CredentialDraft): Promise<void> {
    setSaving(true);
    try {
      if (editorCredential) {
        const updated = await updateCredential(editorCredential.name, {
          project: draft.project,
          description: draft.description,
          value: draft.value
        });
        setCredentials((current) =>
          current.map((credential) =>
            credential.name === updated.name ? updated : credential
          )
        );
        setSelectedName(updated.name);
        setNotice({ tone: 'success', text: `${updated.name} har roterats.` });
      } else {
        if (credentials.some((credential) => credential.name === draft.name)) {
          throw new Error('Nyckeln finns redan. Välj den och använd Rotera.');
        }
        const created = await createCredential(draft);
        setCredentials((current) => [...current, created]);
        setSelectedName(created.name);
        setNotice({
          tone: 'success',
          text: `${created.name} har lagrats. Värdet är nu dolt.`
        });
      }
      setLastChecked(new Date());
      setEditorCredential(undefined);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCredential(pendingDelete.name);
      const remaining = credentials.filter(
        (credential) => credential.name !== pendingDelete.name
      );
      setCredentials(remaining);
      if (selectedName === pendingDelete.name)
        setSelectedName(remaining[0]?.name ?? null);
      setNotice({
        tone: 'success',
        text: `${pendingDelete.name} har flyttats till serverns papperskorg.`
      });
      setPendingDelete(null);
      setLastChecked(new Date());
    } finally {
      setDeleting(false);
    }
  }

  async function copyFingerprint(credential: ManagedCredential) {
    try {
      await navigator.clipboard.writeText(credential.fingerprint);
      setNotice({ tone: 'success', text: 'Fingerprint kopierat.' });
    } catch {
      setNotice({ tone: 'error', text: 'Fingerprint kunde inte kopieras.' });
    }
  }

  return (
    <main className='vault-page'>
      <header className='vault-page-heading'>
        <div>
          <p className='vault-eyebrow'>AgentOS Light</p>
          <h1>Credential Vault</h1>
          <p className='vault-page-copy'>
            Ett enda ställe för agenternas nycklar. Värden visas aldrig efter
            att de sparats.
          </p>
        </div>
        <button
          className='vault-button vault-button-primary'
          type='button'
          onClick={openAdd}
          disabled={!online}
        >
          + Lägg till credential
        </button>
      </header>

      <div
        className='vault-status'
        data-state={statusState}
        role='status'
        aria-live='polite'
      >
        <div className='vault-status-copy'>
          <span className='vault-status-dot' aria-hidden='true' />
          <span>
            <strong>
              {loading
                ? 'Kontrollerar valvet'
                : loadError
                  ? 'Valvet svarar inte'
                  : 'Valvet är anslutet'}
            </strong>
            {!loading && !loadError
              ? ` · ${credentials.length} credentials`
              : ''}
          </span>
        </div>
        <span>
          {lastChecked
            ? `Senast kontrollerat ${lastChecked.toLocaleTimeString('sv-SE', {
                hour: '2-digit',
                minute: '2-digit'
              })}`
            : 'Metadata only · inga värden returneras'}
        </span>
      </div>

      {notice ? (
        <p
          className='vault-notice'
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}

      {loadError ? (
        <div className='vault-notice' data-tone='error' role='alert'>
          <strong>Credential-inventory är inte tillgängligt.</strong>{' '}
          {loadError}{' '}
          <button
            className='vault-button vault-button-small'
            type='button'
            onClick={() => void load()}
          >
            Försök igen
          </button>
        </div>
      ) : null}

      <section
        className='vault-panel vault-toolbar'
        aria-label='Filtrera credential-inventory'
      >
        <label className='vault-field'>
          <span>Sök</span>
          <input
            className='vault-search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Namn, agent, beskrivning eller fingerprint…'
            type='search'
            disabled={!online}
          />
        </label>
        <label className='vault-field'>
          <span>Scope</span>
          <select
            className='vault-select'
            value={project}
            onChange={(event) => setProject(event.target.value)}
            disabled={!online}
          >
            <option value='all'>Alla scopes</option>
            {projects.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <span className='vault-result-count' aria-live='polite'>
          {filteredCredentials.length} av {credentials.length}
        </span>
      </section>

      <div className='vault-content-grid'>
        <section className='vault-panel' aria-labelledby='inventory-title'>
          <header className='vault-panel-header'>
            <div>
              <h2 id='inventory-title'>Inventory</h2>
              <p className='vault-panel-copy'>
                Säker metadata, aldrig lagrade värden.
              </p>
            </div>
          </header>

          {loading ? (
            <div className='vault-loading'>Läser credential-inventory…</div>
          ) : loadError && credentials.length === 0 ? (
            <div className='vault-empty'>
              <div>
                <h2>Ingen anslutning</h2>
                <p>Kontrollera vault-tjänsten och försök igen.</p>
              </div>
            </div>
          ) : filteredCredentials.length === 0 ? (
            <div className='vault-empty'>
              <div>
                <h2>
                  {credentials.length === 0 ? 'Valvet är tomt' : 'Inga träffar'}
                </h2>
                <p>
                  {credentials.length === 0
                    ? 'Lägg till den första credentialen när backend är ansluten.'
                    : 'Ändra sökningen eller välj ett annat scope.'}
                </p>
                {credentials.length === 0 ? (
                  <button
                    className='vault-button'
                    type='button'
                    onClick={openAdd}
                  >
                    Lägg till credential
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className='vault-table-wrap'>
              <table className='vault-table'>
                <thead>
                  <tr>
                    <th scope='col'>Credential</th>
                    <th scope='col'>Scope</th>
                    <th scope='col'>Uppdaterad</th>
                    <th scope='col'>Åtgärd</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCredentials.map((credential) => (
                    <tr
                      key={credential.name}
                      data-selected={credential.name === selectedName}
                    >
                      <td>
                        <button
                          className='vault-key-button'
                          type='button'
                          aria-pressed={credential.name === selectedName}
                          onClick={() => setSelectedName(credential.name)}
                        >
                          {credential.name}
                        </button>
                        <span className='vault-cell-description'>
                          {credential.description || 'Ingen beskrivning'}
                        </span>
                      </td>
                      <td>
                        <span className='vault-badge'>
                          {credential.project || 'Ej tilldelad'}
                        </span>
                      </td>
                      <td className='vault-cell-muted'>
                        {formatDate(credential.updatedAt)}
                      </td>
                      <td>
                        <button
                          className='vault-button vault-button-small'
                          type='button'
                          onClick={() => openRotate(credential)}
                        >
                          Rotera
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside
          className='vault-panel vault-detail'
          aria-labelledby='detail-title'
        >
          <header className='vault-panel-header'>
            <div>
              <h2 id='detail-title'>Detaljer</h2>
              <p className='vault-panel-copy'>Vald credential</p>
            </div>
          </header>
          {selectedCredential ? (
            <>
              <div className='vault-detail-body'>
                <h2 className='vault-detail-name'>{selectedCredential.name}</h2>
                <p className='vault-panel-copy'>
                  {selectedCredential.description || 'Ingen beskrivning.'}
                </p>
                <dl className='vault-detail-list'>
                  <div>
                    <dt>Scope</dt>
                    <dd>{selectedCredential.project || 'Ej tilldelad'}</dd>
                  </div>
                  <div>
                    <dt>Uppdaterad</dt>
                    <dd>{formatDate(selectedCredential.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Storlek</dt>
                    <dd>{formatBytes(selectedCredential.bytes)}</dd>
                  </div>
                  <div>
                    <dt>Fingerprint</dt>
                    <dd>
                      <code>{selectedCredential.fingerprint}</code>
                    </dd>
                  </div>
                </dl>
                <div className='vault-actions'>
                  <button
                    className='vault-button vault-button-primary vault-button-small'
                    type='button'
                    onClick={() => openRotate(selectedCredential)}
                  >
                    Rotera
                  </button>
                  <button
                    className='vault-button vault-button-small'
                    type='button'
                    onClick={() => void copyFingerprint(selectedCredential)}
                  >
                    Kopiera fingerprint
                  </button>
                  <button
                    className='vault-button vault-button-danger vault-button-small'
                    type='button'
                    onClick={() => setPendingDelete(selectedCredential)}
                  >
                    Papperskorg
                  </button>
                </div>
              </div>
              <p className='vault-safety'>
                <strong>Env-värden har företräde.</strong> En variabel med samma
                namn i hostmiljön kan därför överskugga den här filen.
              </p>
            </>
          ) : (
            <div className='vault-detail-body'>
              <p className='vault-detail-empty'>
                Välj en credential i listan för säker metadata.
              </p>
            </div>
          )}
        </aside>
      </div>

      {editorCredential !== undefined ? (
        <CredentialDialog
          key={editorCredential?.name ?? 'new'}
          credential={editorCredential}
          projects={projects}
          saving={saving}
          onClose={() => setEditorCredential(undefined)}
          onSave={saveCredential}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteDialog
          credential={pendingDelete}
          deleting={deleting}
          onClose={() => setPendingDelete(null)}
          onDelete={confirmDelete}
        />
      ) : null}
    </main>
  );
}
