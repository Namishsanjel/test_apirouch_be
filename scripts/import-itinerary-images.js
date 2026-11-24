'use strict';

/**
 * Bulk-import itinerary day photos for a fixed set of tours.
 *
 * For each source folder below, every `day<N>.<ext>` photo is uploaded to the
 * Media Library through Strapi's own upload service (the same path the admin
 * uses) and then attached to the matching day of the matching tour through the
 * Document Service. The tour's other itinerary data — ids, titles, bodies,
 * order, every other day — is read back and written verbatim, so only `image`
 * and `imageAlt` change on the matched days.
 *
 * Safe by default:
 *   - Dry run unless `--apply` is passed. A dry run reads, measures and prints
 *     the plan; it uploads nothing and writes nothing.
 *   - Idempotent. A day that already has an image is skipped, and a photo whose
 *     file the Media Library already holds is reused rather than re-uploaded.
 *     `--force` overwrites a day's existing image and re-uploads.
 *   - Large photos are resized to a temporary copy (max 1600px wide, JPEG q82)
 *     with sharp before upload. The originals in img/ are never modified. If
 *     sharp is unavailable the original is uploaded untouched and that is
 *     reported.
 *   - Draft & Publish: the draft is updated, then republished only when the tour
 *     was published to begin with.
 *
 * Usage:
 *   npm run import-itinerary-images                 # dry run (default)
 *   npm run import-itinerary-images -- --apply      # write for real
 *   npm run import-itinerary-images -- --apply --force
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const REPO_ROOT = path.join(__dirname, '..');
const IMG_ROOT = path.join(REPO_ROOT, 'img');

/** Resize threshold and target, in bytes / pixels. */
const RESIZE_ABOVE_BYTES = Math.round(1.5 * 1024 * 1024);
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 82;

const UID_TOUR = 'api::tour.tour';

/**
 * The folders to import, each tied to a tour by its documentId and slug. Both
 * were read from the database; the slug is a second guard so the script fails
 * loudly rather than touching the wrong tour if an id ever moved.
 *
 * `dayCount` is informational only, used to report days a source folder has no
 * photo for.
 */
const IMPORTS = [
  {
    label: 'Dubai',
    folder: path.join(IMG_ROOT, 'dubai tour'),
    slug: 'dubai-holiday-tour-5-days',
    dayCount: 5,
  },
  {
    label: 'Europe',
    folder: path.join(IMG_ROOT, 'europe tour'),
    slug: 'europe-tour-10-days',
    dayCount: 10,
  },
];

/** `day1.jpg`, `Day-02.JPG`, `day 3.webp` -> 1, 2, 3. null when it is not a day file. */
function dayNumberFromFilename(filename) {
  const match = path.basename(filename).match(/^day[\s_-]*0*(\d+)\.(jpe?g|png|webp)$/i);
  return match ? Number(match[1]) : null;
}

/** The day number on an itinerary row: its `day` label ("Day 3"), else its order. */
function dayNumberOfRow(row) {
  const fromLabel = String(row.day || '').match(/(\d+)/);
  if (fromLabel) return Number(fromLabel[1]);
  if (Number.isInteger(row.order)) return row.order;
  return null;
}

/** Human label for a row, for the report. */
function describeRow(row) {
  return `${row.day || `order ${row.order}`} — ${row.title || '(untitled)'}`;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function parseArgs(argv) {
  const flags = { apply: false, force: false, help: false };

  for (const arg of argv) {
    switch (arg) {
      case '--apply':
        flags.apply = true;
        break;
      case '--force':
        flags.force = true;
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
Usage: npm run import-itinerary-images -- [options]

Options:
  --apply   Upload photos and attach them to itinerary days. Without it this is
            a dry run that only prints the plan.
  --force   Overwrite a day that already has an image (and re-upload its photo).
  --help    Show this message.
`);
}

/** Source photos as { day, filename, filepath, size }, sorted by day. */
function readSourceFolder(folder) {
  if (!fs.existsSync(folder)) {
    throw new Error(`Source folder not found: ${folder}`);
  }

  const photos = [];
  const skipped = [];

  for (const filename of fs.readdirSync(folder).sort()) {
    const filepath = path.join(folder, filename);
    if (!fs.statSync(filepath).isFile()) continue;

    const day = dayNumberFromFilename(filename);
    if (day == null) {
      skipped.push({ filename, reason: 'not a day<N> image' });
      continue;
    }

    photos.push({ day, filename, filepath, size: fs.statSync(filepath).size });
  }

  photos.sort((a, b) => a.day - b.day);

  // Two files claiming the same day would be ambiguous; report and drop both.
  const byDay = new Map();
  for (const photo of photos) {
    if (byDay.has(photo.day)) {
      const other = byDay.get(photo.day);
      skipped.push({ filename: photo.filename, reason: `duplicate day ${photo.day} (also ${other.filename})` });
      skipped.push({ filename: other.filename, reason: `duplicate day ${photo.day} (also ${photo.filename})` });
      byDay.delete(photo.day);
      photo.ambiguous = true;
      other.ambiguous = true;
    } else {
      byDay.set(photo.day, photo);
    }
  }

  const clean = photos.filter((p) => !p.ambiguous);
  return { photos: clean, skipped };
}

/** Load sharp lazily; null when it is not installed. */
function loadSharp() {
  try {
    // eslint-disable-next-line global-require
    return require('sharp');
  } catch {
    return null;
  }
}

/**
 * The path to upload for a photo: the original when it is small enough, else a
 * resized temporary copy. Returns { filepath, mimetype, size, resized, cleanup }
 * with `cleanup` removing the temp file. The original is never touched.
 */
async function prepareUploadFile(photo, sharp, tmpDir) {
  const original = {
    filepath: photo.filepath,
    mimetype: mimetypeFor(photo.filename),
    size: photo.size,
    resized: false,
    cleanup: async () => {},
  };

  if (photo.size <= RESIZE_ABOVE_BYTES || !sharp) {
    return original;
  }

  const outPath = path.join(tmpDir, `${path.parse(photo.filename).name}-1600.jpg`);

  try {
    const info = await sharp(photo.filepath)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outPath);

    const size = fs.statSync(outPath).size;
    // A recompressed copy never worth more than the original: keep whichever is smaller.
    if (size >= photo.size) {
      fs.rmSync(outPath, { force: true });
      return original;
    }

    return {
      filepath: outPath,
      mimetype: 'image/jpeg',
      size,
      resized: true,
      width: info.width,
      height: info.height,
      cleanup: async () => {
        fs.rmSync(outPath, { force: true });
      },
    };
  } catch (error) {
    console.warn(`  ! resize failed for ${photo.filename}, using original: ${error.message}`);
    return original;
  }
}

function mimetypeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * The name the Media Library stores the file under. Stable for a given day so a
 * re-run recognises a photo it already uploaded and reuses it.
 */
function mediaNameFor(importDef, photo) {
  return `itinerary-${importDef.label.toLowerCase()}-day-${photo.day}`;
}

/**
 * An existing Media Library file uploaded for this day before, if any. Matches on
 * the stored name, which is what makes re-runs idempotent.
 */
async function findExistingMedia(strapi, name) {
  return strapi.db.query('plugin::upload.file').findOne({ where: { name } });
}

/** Read the tour (draft or published), with each itinerary day's image. */
async function loadTour(strapi, documentId, status) {
  return strapi.documents(UID_TOUR).findFirst({
    filters: { documentId },
    status,
    populate: { itinerary: { populate: { image: true } } },
  });
}

/** A stable, shallow copy of a day for re-writing: keeps every scalar field. */
function toUpdatableDay(row) {
  return {
    day: row.day,
    title: row.title,
    body: row.body,
    order: row.order,
    dayLabel: row.dayLabel,
    altitudeText: row.altitudeText,
    durationText: row.durationText,
    points: row.points,
    image: row.image?.id ?? null,
    imageAlt: row.imageAlt ?? null,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  const mode = flags.apply ? 'APPLY' : 'DRY RUN';
  console.log(`[import] Mode: ${mode}${flags.force ? ' (force)' : ''}`);

  // 1. Read the sources and work the mapping out before loading Strapi, so a
  //    missing folder or a bad filename fails fast with a clear message.
  const plans = [];
  for (const importDef of IMPORTS) {
    const { photos, skipped } = readSourceFolder(importDef.folder);
    plans.push({ importDef, photos, skipped });
    console.log(
      `[import] ${importDef.label}: ${photos.length} photo(s) in ${path.relative(REPO_ROOT, importDef.folder)}`
    );
    for (const s of skipped) console.warn(`  ! skipped ${s.filename}: ${s.reason}`);
  }

  const sharp = loadSharp();
  if (!sharp) {
    console.warn('[import] sharp is not available; large photos will be uploaded unresized.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itinerary-import-'));

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  const report = { attached: [], skippedExisting: [], missing: [], errors: [] };

  try {
    for (const { importDef, photos } of plans) {
      // Resolve the tour by slug (the draft is returned for a D&P type), then
      // read the draft to edit and check whether it is published.
      const tour = await strapi.documents(UID_TOUR).findFirst({
        filters: { slug: importDef.slug },
        locale: 'en',
        populate: { itinerary: { populate: { image: true } } },
      });

      if (!tour) {
        report.errors.push(`${importDef.label}: no tour found for slug ${importDef.slug}`);
        continue;
      }

      const editing =
        (await loadTour(strapi, tour.documentId, 'draft')) || tour;

      const wasPublished = Boolean(
        await strapi.documents(UID_TOUR).findOne({ documentId: tour.documentId, status: 'published' })
      );

      const days = Array.isArray(editing.itinerary) ? [...editing.itinerary] : [];
      days.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const byDay = new Map();
      for (const row of days) {
        const n = dayNumberOfRow(row);
        if (n != null && !byDay.has(n)) byDay.set(n, row);
      }

      const touched = [];

      for (const photo of photos) {
        const row = byDay.get(photo.day);
        if (!row) {
          report.missing.push(`${importDef.label} Day ${photo.day}: no matching itinerary day (photo ${photo.filename})`);
          continue;
        }

        if (row.image?.id && !flags.force) {
          report.skippedExisting.push(`${importDef.label} Day ${photo.day}: already has image, skipped (${photo.filename})`);
          continue;
        }

        const dayTitle = String(row.title || row.day || `Day ${photo.day}`);
        const imageAlt = row.imageAlt || dayTitle;
        const existingMedia = await findExistingMedia(strapi, mediaNameFor(importDef, photo));

        console.log(
          `[import] ${importDef.label} Day ${photo.day} (${describeRow(row)}): ${photo.filename} ` +
            `(${formatBytes(photo.size)})${row.image?.id ? ' [overwrite]' : ''}` +
            `${existingMedia ? ' [reuse media]' : ''}`
        );

        if (!flags.apply) {
          report.attached.push(`${importDef.label} Day ${photo.day}: would set ${photo.filename} (alt: "${imageAlt}")`);
          continue;
        }

        let media = existingMedia;
        if (!media) {
          const prepared = await prepareUploadFile(photo, sharp, tmpDir);
          try {
            const uploaded = await strapi.plugin('upload').service('upload').upload({
              data: {
                fileInfo: {
                  name: mediaNameFor(importDef, photo),
                  alternativeText: imageAlt,
                  caption: `${importDef.label} Day ${photo.day}`,
                },
              },
              files: {
                originalFilename: `${mediaNameFor(importDef, photo)}${path.extname(prepared.filepath)}`,
                filepath: prepared.filepath,
                mimetype: prepared.mimetype,
                size: prepared.size,
              },
            });
            media = uploaded[0];
            console.log(
              `  uploaded as ${media.url}${prepared.resized ? ' (resized)' : ''}`
            );
          } finally {
            await prepared.cleanup();
          }
        }

        row.__imageId = media.id;
        row.__imageAlt = imageAlt;
        touched.push({ row, media, photo, imageAlt });
      }

      if (!touched.length) continue;

      // 2. Re-write the full itinerary with only the matched days' image changed.
      const itinerary = days.map((row) => {
        const next = toUpdatableDay(row);
        if (row.__imageId) {
          next.image = row.__imageId;
          next.imageAlt = row.__imageAlt;
        }
        return next;
      });

      await strapi.documents(UID_TOUR).update({
        documentId: tour.documentId,
        data: { itinerary },
      });

      // 3. Republish only if it was published before, so the live tour matches.
      if (wasPublished) {
        await strapi.documents(UID_TOUR).publish({ documentId: tour.documentId });
      }

      for (const t of touched) {
        report.attached.push(
          `${importDef.label} Day ${t.photo.day}: set ${t.photo.filename} (alt: "${t.imageAlt}")`
        );
      }
      console.log(
        `[import] ${importDef.label}: updated ${touched.length} day(s)${wasPublished ? ', republished' : ' (draft only)'}`
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await strapi.destroy();
  }

  printReport(report, flags);
}

function printReport(report, flags) {
  const section = (title, rows, out = console.log) => {
    console.log(`\n${title} (${rows.length})`);
    if (!rows.length) out('  -');
    else rows.forEach((r) => out(`  • ${r}`));
  };

  console.log(`\n===== ${flags.apply ? 'APPLIED' : 'DRY RUN'} SUMMARY =====`);
  section(flags.apply ? 'Attached' : 'Would attach', report.attached);
  section('Skipped (already had an image; use --force to overwrite)', report.skippedExisting);
  section('Unmatched / missing', [...report.missing, ...report.errors]);
  if (!flags.apply) {
    console.log('\nNothing was written. Re-run with --apply to perform these changes.');
  }
}

main().catch((error) => {
  console.error(`[import] Failed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
