'use strict';

/**
 * Import the tours described in data/tours-import.json.
 *
 * The JSON was extracted from the PDFs in docs/Tours and holds only what those
 * PDFs state. This script turns each entry into a Strapi tour through the
 * Document Service, the same way the admin does, so it works against the
 * database the app is configured for — including the production one where the
 * live data actually lives.
 *
 * The rules it keeps:
 *   - New tours are created as DRAFTS. Publishing is left to the editor.
 *   - Idempotent by slug. A tour whose slug already exists is skipped and
 *     reported, never overwritten or deleted — so re-running is safe and an
 *     existing (even hand-edited) tour is never touched.
 *   - Dry run unless `--apply` is passed. A dry run reads the data, resolves
 *     relations and prints exactly what it would create, but writes nothing.
 *   - Relations (destination) are resolved against existing entries. A
 *     destination that cannot be found is reported and the relation is left
 *     empty rather than invented.
 *   - Price, group size, SEO fields and images are not set: the source has no
 *     value for them.
 *
 * Usage:
 *   npm run import-tours                  # dry run (default)
 *   npm run import-tours -- --apply       # create the drafts for real
 */

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const REPO_ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(REPO_ROOT, 'data', 'tours-import.json');

const UID_TOUR = 'api::tour.tour';
const UID_DESTINATION = 'api::destination.destination';

function parseArgs(argv) {
  const flags = { apply: false, help: false };

  for (const arg of argv) {
    switch (arg) {
      case '--apply':
        flags.apply = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

function printHelp() {
  console.log(`
Usage: npm run import-tours -- [options]

Options:
  --apply   Create the draft tours. Without it this is a dry run that only
            prints what would be created.
  --help    Show this message.
`);
}

/** The import file as { tours: [...] }. Throws with a clear message if malformed. */
function readImportFile() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Import file not found: ${DATA_FILE}`);
  }

  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!parsed || !Array.isArray(parsed.tours)) {
    throw new Error(`${path.relative(REPO_ROOT, DATA_FILE)} must contain a "tours" array`);
  }

  return parsed.tours;
}

/**
 * One JSON entry as the data Strapi expects. Optional keys are only set when the
 * source has a value, so an absent field stays absent rather than being written
 * as null or an empty component.
 */
function toTourData(tour, destinationId) {
  const data = {
    title: tour.title,
    slug: tour.slug,
    overview: tour.overview,
  };

  for (const key of ['difficulty', 'category', 'durationDays', 'startLocation', 'endLocation']) {
    if (tour[key] != null && tour[key] !== '') data[key] = tour[key];
  }

  if (Array.isArray(tour.snapshot) && tour.snapshot.length) {
    data.snapshot = tour.snapshot.map((row) => ({ label: row.label, value: row.value }));
  }

  if (Array.isArray(tour.highlights) && tour.highlights.length) {
    data.highlights = tour.highlights.map((text) => ({ text }));
  }

  if (Array.isArray(tour.inclusions) && tour.inclusions.length) {
    data.inclusions = tour.inclusions.map((text) => ({ text }));
  }

  if (Array.isArray(tour.exclusions) && tour.exclusions.length) {
    data.exclusions = tour.exclusions.map((text) => ({ text }));
  }

  if (Array.isArray(tour.itinerary) && tour.itinerary.length) {
    data.itinerary = tour.itinerary.map((day, index) => {
      const row = {
        day: day.day,
        title: day.title,
        body: day.body,
        order: Number.isInteger(day.order) ? day.order : index + 1,
      };
      if (Array.isArray(day.points) && day.points.length) row.points = day.points;
      return row;
    });
  }

  if (destinationId) data.destination = destinationId;

  return data;
}

/**
 * An existing destination document matching `name`, or null.
 *
 * Stored names read "City, Country" ("Lisbon, Portugal"), so an exact match on
 * the whole name is tried first, then on the city part before the comma. A
 * bare substring match is deliberately avoided: it would tie "Japan" to
 * "Kyoto, Japan", which is a city destination, not the country tour.
 */
function findDestinationByName(destinations, name) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  const cityOf = (value) => String(value || '').split(',')[0].trim().toLowerCase();

  return (
    destinations.find((d) => String(d.name || '').toLowerCase() === needle) ||
    destinations.find((d) => cityOf(d.name) === needle) ||
    destinations.find((d) => String(d.slug || '').toLowerCase() === needle) ||
    null
  );
}

/** The tours already in the database, keyed by slug, so an existing one is never re-created. */
async function existingTourSlugs(strapi) {
  const existing = await strapi.documents(UID_TOUR).findMany({
    fields: ['slug'],
    limit: 1000,
    status: 'draft',
  });

  return new Set(existing.map((t) => t.slug).filter(Boolean));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  const tours = readImportFile();
  console.log(`[import-tours] Mode: ${flags.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[import-tours] ${tours.length} tour(s) in ${path.relative(REPO_ROOT, DATA_FILE)}`);

  // Fail fast on a duplicate slug in the file itself before touching Strapi.
  const seenSlugs = new Map();
  for (const tour of tours) {
    if (!tour.slug) throw new Error(`Tour "${tour.title || '(untitled)'}" is missing a slug`);
    if (seenSlugs.has(tour.slug)) {
      throw new Error(`Duplicate slug "${tour.slug}" in import file (also ${seenSlugs.get(tour.slug)})`);
    }
    seenSlugs.set(tour.slug, tour.title);
  }

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  const report = { created: [], skipped: [], destinationMissing: [], errors: [] };

  try {
    const existingSlugs = await existingTourSlugs(strapi);
    const destinations = await strapi.documents(UID_DESTINATION).findMany({
      fields: ['name', 'slug'],
      limit: 1000,
      status: 'draft',
    });

    for (const tour of tours) {
      if (existingSlugs.has(tour.slug)) {
        report.skipped.push(`${tour.slug}: already exists, skipped`);
        console.log(`[import-tours] SKIP ${tour.slug} (already exists)`);
        continue;
      }

      const destination = findDestinationByName(destinations, tour.destinationName);
      if (tour.destinationName && !destination) {
        report.destinationMissing.push(
          `${tour.slug}: destination "${tour.destinationName}" not found, left empty`
        );
      }

      const data = toTourData(tour, destination?.documentId);
      const dayCount = data.itinerary?.length ?? 0;

      console.log(
        `[import-tours] ${flags.apply ? 'CREATE' : 'WOULD CREATE'} ${tour.slug} — ` +
          `"${tour.title}", ${dayCount} day(s), ` +
          `highlights ${data.highlights?.length ?? 0}, ` +
          `inclusions ${data.inclusions?.length ?? 0}, ` +
          `exclusions ${data.exclusions?.length ?? 0}` +
          `${destination ? `, destination ${destination.name}` : tour.destinationName ? ', destination (not found)' : ''}`
      );

      if (!flags.apply) {
        report.created.push(`${tour.slug}: would create (draft)`);
        continue;
      }

      try {
        await strapi.documents(UID_TOUR).create({ data, status: 'draft' });
        report.created.push(`${tour.slug}: created (draft)`);
      } catch (error) {
        report.errors.push(`${tour.slug}: ${error.message}`);
        console.error(`[import-tours] FAILED ${tour.slug}: ${error.message}`);
      }
    }
  } finally {
    await strapi.destroy();
  }

  printReport(report, flags);
}

function printReport(report, flags) {
  const section = (title, rows) => {
    console.log(`\n${title} (${rows.length})`);
    if (!rows.length) console.log('  -');
    else rows.forEach((r) => console.log(`  • ${r}`));
  };

  console.log(`\n===== ${flags.apply ? 'APPLIED' : 'DRY RUN'} SUMMARY =====`);
  section(flags.apply ? 'Created (draft)' : 'Would create (draft)', report.created);
  section('Skipped (slug already exists)', report.skipped);
  section('Destination not found (relation left empty)', report.destinationMissing);
  section('Errors', report.errors);

  if (!flags.apply) {
    console.log('\nNothing was written. Re-run with --apply to create these drafts.');
  } else {
    console.log('\nDrafts created. Review and publish them in the Strapi admin.');
  }
}

main().catch((error) => {
  console.error(`[import-tours] Failed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
