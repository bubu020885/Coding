require('dotenv').config();

const express = require('express');
const path = require('path');
const ical = require('node-ical');

const PORT = process.env.PORT || 3000;
const FEED_URL = process.env.ICS_FEED_URL ||
  'http://mmc.api.koronaevent.de/api/feeds/62Rw4Z0JIao6bz9sae5ErIONwx0_MQ9EFuKcTxLVBEQ.ics';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 60_000);
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';

// Recognized "participant count" labels inside DESCRIPTION, e.g.
// "Teilnehmer: 12", "TN: 12", "Personen: 12", "Pax: 12".
const PARTICIPANTS_PATTERN =
  /(teilnehmerzahl|teilnehmer(?:anzahl)?|anzahl\s*tn|\btn\b|personen(?:anzahl)?|pax|anmeldungen)\s*[:=]?\s*(\d+)/i;

let cache = {
  fetchedAt: null,
  error: null,
  events: [],
};

function dateKey(date) {
  // Local calendar day key (YYYY-MM-DD) in the configured timezone.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function extractParticipantsAndNotes(description) {
  if (!description) return { participants: null, notes: '' };
  const text = String(description).replace(/\\n/g, '\n').trim();
  const match = text.match(PARTICIPANTS_PATTERN);
  if (!match) return { participants: null, notes: text };

  const participants = Number(match[2]);
  const notes = text
    .split(/\r?\n/)
    .filter((line) => !PARTICIPANTS_PATTERN.test(line))
    .join('\n')
    .trim();

  return { participants, notes };
}

function expandOccurrences(component, rangeStart, rangeEnd) {
  const duration = component.end && component.start
    ? component.end.getTime() - component.start.getTime()
    : 0;

  if (!component.rrule) {
    return component.start >= rangeStart && component.start < rangeEnd
      ? [{ start: component.start, end: component.end }]
      : [];
  }

  const occurrenceStarts = component.rrule.between(rangeStart, rangeEnd, true);
  const excluded = new Set(
    Object.keys(component.exdate || {}).map((k) => new Date(k).getTime())
  );

  return occurrenceStarts
    .filter((d) => !excluded.has(d.getTime()))
    .map((start) => ({ start, end: new Date(start.getTime() + duration) }));
}

async function fetchEvents() {
  const data = await ical.async.fromURL(FEED_URL, {
    headers: { 'User-Agent': 'event-dashboard/1.0' },
  });

  const now = new Date();
  const rangeStart = addDays(now, -1);
  const rangeEnd = addDays(now, 4);

  // Single overridden occurrences (RECURRENCE-ID) take precedence over the
  // generated occurrence with the same start time from their parent rrule.
  const overrides = new Map();
  for (const component of Object.values(data)) {
    if (component.type === 'VEVENT' && component.recurrenceid) {
      overrides.set(
        `${component.uid}:${component.recurrenceid.toISOString()}`,
        component
      );
    }
  }

  const events = [];

  for (const component of Object.values(data)) {
    if (component.type !== 'VEVENT' || component.recurrenceid) continue;

    const occurrences = expandOccurrences(component, rangeStart, rangeEnd);

    for (const occ of occurrences) {
      const override = overrides.get(`${component.uid}:${occ.start.toISOString()}`);
      const source = override || component;

      const { participants, notes } = extractParticipantsAndNotes(source.description);

      events.push({
        uid: source.uid,
        summary: source.summary || '(ohne Titel)',
        location: source.location || '',
        start: (override ? override.start : occ.start).toISOString(),
        end: (override ? override.end : occ.end).toISOString(),
        allDay: Boolean(component.datetype === 'date' || component.start?.dateOnly),
        participants,
        notes,
      });
    }
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return events;
}

async function refreshCache() {
  try {
    const events = await fetchEvents();
    cache = { fetchedAt: new Date().toISOString(), error: null, events };
    console.log(`[${new Date().toISOString()}] Feed aktualisiert: ${events.length} Termine`);
  } catch (err) {
    cache = { ...cache, error: err.message, fetchedAt: cache.fetchedAt };
    console.error(`[${new Date().toISOString()}] Fehler beim Laden des Feeds:`, err.message);
  }
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/events', (req, res) => {
  res.json({
    fetchedAt: cache.fetchedAt,
    error: cache.error,
    timezone: TIMEZONE,
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    events: cache.events,
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: !cache.error, fetchedAt: cache.fetchedAt });
});

refreshCache();
setInterval(refreshCache, REFRESH_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Event Dashboard läuft auf http://localhost:${PORT}`);
  console.log(`Feed-Quelle: ${FEED_URL}`);
});
