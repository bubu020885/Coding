#!/usr/bin/env node
// Builds a static snapshot of the dashboard for GitHub Pages: copies the
// public/ assets into dist/ and writes a freshly fetched dist/api/events.json.
// Exits non-zero if the feed can't be fetched, so the deploy workflow can
// skip publishing and leave the last known-good version live.

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { fetchEvents } = require('../lib/feed');

const FEED_URL = process.env.ICS_FEED_URL ||
  'http://mmc.api.koronaevent.de/api/feeds/62Rw4Z0JIao6bz9sae5ErIONwx0_MQ9EFuKcTxLVBEQ.ics';
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 60_000);
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIST_DIR = path.join(__dirname, '..', 'dist');

async function main() {
  const events = await fetchEvents(FEED_URL);

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });

  const apiDir = path.join(DIST_DIR, 'api');
  fs.mkdirSync(apiDir, { recursive: true });
  fs.writeFileSync(
    path.join(apiDir, 'events.json'),
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        error: null,
        timezone: TIMEZONE,
        refreshIntervalMs: REFRESH_INTERVAL_MS,
        events,
      },
      null,
      2
    )
  );

  console.log(`Static build erzeugt: ${events.length} Termine -> ${apiDir}/events.json`);
}

main().catch((err) => {
  console.error('Build fehlgeschlagen, Feed nicht erreichbar:', err.message);
  process.exit(1);
});
