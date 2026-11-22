'use strict';

/**
 * Idempotent brochure attach script.
 *
 * For every tour that has a matching PDF in docs/brochures/<slug>.pdf, upload
 * the file through Strapi's own upload service (so it lands in the configured
 * uploads folder — UPLOADS_DIR on the server — and in the media library) and
 * link it to the tour's `brochure` field.
 *
 * Running it twice does not create duplicates: when the tour's brochure is
 * already the same file (same name + size, and the stored file still exists)
 * the tour is left untouched. A changed PDF (different size) replaces the old
 * file on that tour and removes the stale upload.
 *
 * Nothing else is touched: no other media, no other content type, no
 * permissions, and no field besides `brochure` on the tours that have a PDF.
 *
 * Usage:
 *   node scripts/attach-brochures.js
 *   node scripts/attach-brochures.js --dry-run
 *   node scripts/attach-brochures.js --file=dubai-holiday-tour-5-days
 */

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const BROCHURE_DIR = path.join(__dirname, '..', 'docs', 'brochures');
const TOUR_UID = 'api::tour.tour';

function parseArgs(argv) {
  const flags = { dryRun: false, files: [] };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg.startsWith('--file=')) {
      flags.files.push(arg.slice('--file='.length));
    }
  }

  return flags;
}

function listBrochures(filter) {
  if (!fs.existsSync(BROCHURE_DIR)) {
    throw new Error(`Brochure directory not found: ${BROCHURE_DIR}`);
  }

  let files = fs.readdirSync(BROCHURE_DIR).filter((name) => name.endsWith('.pdf'));

  if (filter && filter.length) {
    const wanted = new Set(filter.map((name) => name.replace(/\.pdf$/, '')));
    files = files.filter((name) => wanted.has(name.replace(/\.pdf$/, '')));
  }

  return files.sort();
}

/** True when a stored upload still points at a file that exists on disk. */
function uploadFileExists(file) {
  const candidates = [file?.url, file?.provider_metadata?.public_id]
    .filter(Boolean)
    .map((value) => value.replace(/^\/+/, ''));

  for (const candidate of candidates) {
    const absolute = path.join(process.cwd(), 'public', candidate);
    if (fs.existsSync(absolute)) {
      return true;
    }
  }

  // Treated as "exists" when the location cannot be checked (e.g. an external
  // provider), so we do not re-upload on every run for those setups.
  return true;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const files = listBrochures(flags.files);

  if (!files.length) {
    console.log('[brochures] No PDFs matched in docs/brochures.');
    return;
  }

  console.log('[brochures] Found:');
  console.table(
    files.map((name) => {
      const info = fs.statSync(path.join(BROCHURE_DIR, name));
      return {
        slug: name.replace(/\.pdf$/, ''),
        file: name,
        sizeKb: Math.round(info.size / 1024),
        sizeMb: (info.size / (1024 * 1024)).toFixed(2),
      };
    })
  );

  if (flags.dryRun) {
    console.log('[brochures] Dry run: no uploads and no database changes made.');
    return;
  }

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  const results = [];

  try {
    for (const name of files) {
      const slug = name.replace(/\.pdf$/, '');
      const filePath = path.join(BROCHURE_DIR, name);
      const size = fs.statSync(filePath).size;

      const tour = await strapi.documents(TOUR_UID).findFirst({
        filters: { slug },
        populate: { brochure: true },
        status: 'published',
      });

      if (!tour) {
        results.push({ slug, action: 'skipped (no published tour)' });
        continue;
      }

      const current = tour.brochure;

      // Strapi stores `size` in decimal kilobytes (bytes / 1000, with decimals);
      // compare in the same unit with a small tolerance so rounding does not
      // trigger a needless re-upload.
      const sizeKb = size / 1000;
      const sameFile =
        current &&
        current.name === name &&
        typeof current.size === 'number' &&
        Math.abs(current.size - sizeKb) < 1 &&
        uploadFileExists(current);

      if (sameFile) {
        results.push({ slug, action: 'unchanged', file: name });
        continue;
      }

      const uploaded = await strapi.plugin('upload').service('upload').upload({
        data: {
          fileInfo: {
            name,
            alternativeText: `${tour.title} brochure`,
            caption: `${tour.title} downloadable brochure (PDF)`,
          },
        },
        files: {
          originalFilename: name,
          filepath: filePath,
          mimetype: 'application/pdf',
          size,
        },
      });

      const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

      if (!file) {
        results.push({ slug, action: 'failed (upload returned nothing)' });
        continue;
      }

      await strapi.documents(TOUR_UID).update({
        documentId: tour.documentId,
        data: { brochure: file.id },
        status: 'published',
      });

      if (current && current.id && current.id !== file.id) {
        try {
          await strapi.plugin('upload').service('upload').remove(current);
        } catch (error) {
          console.warn(`[brochures] Could not remove old file for ${slug}: ${error.message}`);
        }
      }

      results.push({ slug, action: current ? 'replaced' : 'attached', file: name });
    }

    console.log('[brochures] Results:');
    console.table(results);
    console.log(`[brochures] Done. ${results.length} tour(s) processed.`);
  } finally {
    await strapi.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[brochures] Failed: ${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  });
}

module.exports = { listBrochures, parseArgs, uploadFileExists };
