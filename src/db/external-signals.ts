import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type GmailCandidate = {
  id: string;
  threadId: string;
  title: string;
  from: string;
  date: string | null;
  labels: string[];
  snippet: string;
  score: number;
  reasons: string[];
  gmailUrl: string;
  saved: boolean;
};

export type GmailSignalSnapshot = {
  generatedAt: string;
  account: string;
  query: string;
  source: string;
  counts: { total: number; highSignal: number; saved: number };
  candidates: GmailCandidate[];
};

export type CalendarSignalSnapshot = {
  contract: 'agent-os.calendar-signals.v1';
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  account: string;
  days: number;
  counts: { total: number; next24h: number };
  events: Array<{
    id: string;
    calendarId: string;
    title: string;
    start: string;
    end: string;
    status: string;
    attendees: number;
    hangoutLink: string | null;
    htmlLink: string | null;
  }>;
  alerts: Array<{ severity: 'info' | 'warning' | 'error'; title: string; detail: string }>;
  nextSteps: string[];
};

export type GitHubSignalSnapshot = {
  contract: 'agent-os.github-signals.v1';
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  account: { login: string } | null;
  notifications: Array<{
    id: string;
    reason: string;
    unread: boolean;
    updatedAt: string | null;
    repository: string;
    title: string;
    type: string;
    url: string | null;
  }>;
  pullRequests: Array<{
    id: string;
    number: number;
    title: string;
    state: string;
    draft: boolean;
    author: string;
    updatedAt: string | null;
    htmlUrl: string | null;
  }>;
  checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
  alerts: Array<{ severity: 'info' | 'warning' | 'error'; title: string; detail: string }>;
  nextSteps: string[];
};

const emptyGmail: GmailSignalSnapshot = {
  generatedAt: new Date().toISOString(),
  account: 'unknown',
  query: '',
  source: 'fallback',
  counts: { total: 0, highSignal: 0, saved: 0 },
  candidates: []
};

const emptyCalendar: CalendarSignalSnapshot = {
  contract: 'agent-os.calendar-signals.v1',
  source: 'fallback',
  generatedAt: new Date().toISOString(),
  configured: false,
  connected: false,
  account: 'unknown',
  days: 7,
  counts: { total: 0, next24h: 0 },
  events: [],
  alerts: [],
  nextSteps: ['Configure the Agent OS bridge before enabling Calendar signals.']
};

const emptyGithub: GitHubSignalSnapshot = {
  contract: 'agent-os.github-signals.v1',
  source: 'fallback',
  generatedAt: new Date().toISOString(),
  configured: false,
  connected: false,
  account: null,
  notifications: [],
  pullRequests: [],
  checks: [],
  alerts: [],
  nextSteps: ['Configure the Agent OS bridge before enabling GitHub signals.']
};

export async function getGmailSignals(): Promise<GmailSignalSnapshot> {
  if (!hasBridge()) return emptyGmail;
  try {
    return await bridgeRequest<GmailSignalSnapshot>('/mail/radar?max=10');
  } catch (error) {
    console.error('Gmail signals request failed', error);
    return emptyGmail;
  }
}

export async function getCalendarSignals(): Promise<CalendarSignalSnapshot> {
  if (!hasBridge()) return emptyCalendar;
  try {
    return await bridgeRequest<CalendarSignalSnapshot>('/calendar/snapshot?days=7&max=12');
  } catch (error) {
    console.error('Calendar signals request failed', error);
    return {
      ...emptyCalendar,
      source: 'bridge:error',
      configured: true,
      alerts: [
        {
          severity: 'warning',
          title: 'Calendar snapshot unavailable',
          detail: error instanceof Error ? error.message : 'unknown bridge error'
        }
      ]
    };
  }
}

export async function getGitHubSignals(): Promise<GitHubSignalSnapshot> {
  if (!hasBridge()) return emptyGithub;
  try {
    return await bridgeRequest<GitHubSignalSnapshot>('/github/snapshot');
  } catch (error) {
    console.error('GitHub signals request failed', error);
    return {
      ...emptyGithub,
      source: 'bridge:error',
      configured: true,
      alerts: [
        {
          severity: 'warning',
          title: 'GitHub snapshot unavailable',
          detail: error instanceof Error ? error.message : 'unknown bridge error'
        }
      ]
    };
  }
}
