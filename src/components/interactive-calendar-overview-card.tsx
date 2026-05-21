'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { CalendarSignalSnapshot } from '@/db/external-signals';

function eventTimeLabel(value?: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function stockholmDayKey(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

function selectedDayLabel(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(value);
}

function calendarMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function buildCalendarMonth(value: Date) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const leadingDays = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingDays + 1;
    if (day < 1 || day > daysInMonth) return null;
    return new Date(year, month, day, 12);
  });
}

export function InteractiveCalendarOverviewCard({
  calendar
}: {
  calendar: CalendarSignalSnapshot;
}) {
  const now = React.useMemo(() => new Date(), []);
  const todayKey = stockholmDayKey(now);
  const [selectedKey, setSelectedKey] = React.useState(todayKey);
  const monthDays = React.useMemo(() => buildCalendarMonth(now), [now]);

  const eventsByDay = React.useMemo(
    () =>
      calendar.events.reduce<Record<string, typeof calendar.events>>((days, event) => {
        const date = new Date(event.start);
        if (!Number.isFinite(date.getTime())) return days;
        const key = stockholmDayKey(date);
        days[key] = [...(days[key] ?? []), event];
        return days;
      }, {}),
    [calendar.events]
  );

  const selectedDate =
    monthDays.find((date) => date && stockholmDayKey(date) === selectedKey) ?? now;
  const selectedEvents = (eventsByDay[selectedKey] ?? []).toSorted((a, b) => {
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  return (
    <section className='mobile-feed-card overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm'>
      <div className='space-y-5 p-4 md:p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='text-xs uppercase tracking-[0.22em] text-muted-foreground'>
              Calendar
            </div>
            <h2 className='mt-1 text-2xl font-semibold leading-tight tracking-tight'>
              {calendarMonthLabel(now)}
            </h2>
            <div className='mt-1 text-sm text-muted-foreground'>
              {calendar.connected ? 'Click a day · Stockholm time' : 'Calendar needs attention'}
            </div>
          </div>
          <Badge variant={calendar.connected ? 'default' : 'outline'} className='shrink-0'>
            {calendar.connected ? `${calendar.counts.next24h} next 24h` : 'degraded'}
          </Badge>
        </div>

        <div className='rounded-3xl border bg-background/55 p-3 shadow-inner'>
          <div className='mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((day) => (
              <div key={day} className='py-1'>
                {day}
              </div>
            ))}
          </div>

          <div className='grid grid-cols-7 gap-1.5'>
            {monthDays.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className='min-h-11 rounded-2xl' />;

              const key = stockholmDayKey(date);
              const eventCount = eventsByDay[key]?.length ?? 0;
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;

              return (
                <button
                  type='button'
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`relative flex min-h-11 flex-col items-center justify-center rounded-2xl border text-sm transition hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : isToday
                        ? 'border-primary/50 bg-primary/15 text-foreground'
                        : eventCount > 0
                          ? 'border-primary/25 bg-primary/10 text-foreground'
                          : 'border-border/70 bg-muted/20 text-muted-foreground'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`${selectedDayLabel(date)}${eventCount ? `, ${eventCount} events` : ', no events'}`}
                >
                  <span className='font-semibold'>{date.getDate()}</span>
                  <span className='mt-1 flex h-1.5 items-center justify-center gap-0.5'>
                    {eventCount > 0
                      ? Array.from({ length: Math.min(eventCount, 3) }, (_, dot) => (
                          <span
                            key={dot}
                            className={`size-1.5 rounded-full ${
                              isSelected ? 'bg-primary-foreground' : 'bg-primary'
                            }`}
                          />
                        ))
                      : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className='rounded-2xl border bg-background/45 p-4'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <div>
              <div className='text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
                Selected day
              </div>
              <div className='mt-1 font-semibold capitalize'>{selectedDayLabel(selectedDate)}</div>
            </div>
            <Badge variant='outline' className='border-border bg-muted/30 text-[10px]'>
              {selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'}
            </Badge>
          </div>

          {selectedEvents.length === 0 ? (
            <div className='text-sm text-muted-foreground'>
              {calendar.connected
                ? 'No events on this day.'
                : (calendar.alerts[0]?.detail ?? 'Calendar connector is degraded.')}
            </div>
          ) : (
            <div className='max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]'>
              {selectedEvents.map((event) => (
                <a
                  key={event.id}
                  href={event.htmlLink ?? 'https://calendar.google.com/calendar/u/0/r'}
                  target='_blank'
                  rel='noreferrer'
                  className='group flex gap-3 rounded-2xl border bg-muted/20 p-3 transition hover:border-primary/40 hover:bg-primary/10'
                >
                  <div className='flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border bg-background/60 px-2 py-2 text-center'>
                    <span className='text-lg font-semibold'>{eventTimeLabel(event.start)}</span>
                    <span className='text-[10px] text-muted-foreground'>STHLM</span>
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='line-clamp-1 font-medium group-hover:text-primary'>
                      {event.title}
                    </div>
                    <div className='mt-1 text-xs leading-5 text-muted-foreground'>
                      {event.status} · {event.attendees} attendees
                      {event.hangoutLink ? ' · Meet ready' : ''}
                    </div>
                  </div>
                  <span className='text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary'>
                    →
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
