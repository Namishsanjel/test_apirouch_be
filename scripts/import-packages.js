'use strict';

/**
 * Idempotent importer for the travel packages in docs/source/*.md.
 *
 * For every markdown file it parses the shared structure and upserts a Tour
 * document keyed by slug (the filename without .md). Running it twice creates
 * no duplicates.
 *
 * Usage:
 *   node scripts/import-packages.js
 *   node scripts/import-packages.js --file=everest-base-camp-trek-15-days
 *   node scripts/import-packages.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const SOURCE_DIR = path.join(__dirname, '..', 'docs', 'source');
const TOUR_UID = 'api::tour.tour';

const CATEGORY_BY_SUFFIX = [
  { test: /-safari-|-safari$/, category: 'safari' },
  { test: /-trek-/, category: 'trek' },
  { test: /-tour-|-tour$/, category: 'tour' },
];

const CATEGORY_BY_CONTAINS = [
  { test: /safari/, category: 'safari' },
  { test: /trek/, category: 'trek' },
  { test: /tour/, category: 'tour' },
];

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

function listSourceFiles(filter) {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source directory not found: ${SOURCE_DIR}`);
  }

  let files = fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.md'));

  if (filter && filter.length) {
    const wanted = new Set(filter.map((name) => name.replace(/\.md$/, '')));
    files = files.filter((name) => wanted.has(name.replace(/\.md$/, '')));
  }

  return files.sort();
}

function stripTrailingPeriod(value) {
  return value.trim().replace(/[.,]\s*$/, '');
}

function splitKeywords(value) {
  return value
    .split(',')
    .map((item) => stripTrailingPeriod(item).trim())
    .filter(Boolean);
}

/**
 * Split the document into the H1, the bold metadata block and "## " sections.
 */
function tokenize(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let title = null;
  const meta = {};
  const sections = [];
  let current = null;

  const pushSection = () => {
    if (current) {
      sections.push({ ...current, lines: current.lines.join('\n').trim() });
    }
  };

  for (const line of lines) {
    if (title === null && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    const metaMatch = line.match(/^\*\*(SEO title|Meta description|Focus keywords):\*\*\s*(.*)$/i);
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
      continue;
    }

    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      pushSection();
      current = { heading: headingMatch[1].trim(), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  pushSection();

  return { title, meta, sections };
}

function findSection(sections, matcher) {
  return sections.find((section) => matcher(section.heading)) || null;
}

function bulletItems(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim());
}

/**
 * The itinerary day body is either a bullet list (the points format) or the
 * legacy plain paragraph. Bullet lists become an array of points; paragraphs
 * keep `points` empty so existing content keeps working unchanged.
 */
function parseDayBody(body) {
  const points = bulletItems(body);

  if (points.length) {
    return {
      points,
      body: points.join('. '),
    };
  }

  return { points: null, body };
}

function parseSnapshot(text) {
  const rows = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      continue;
    }

    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

    if (cells.length < 2) {
      continue;
    }

    const [label, ...rest] = cells;
    const value = rest.join('|').trim();

    if (!label || /^[-:]+$/.test(label) || /^detail$/i.test(label)) {
      continue;
    }

    rows.push({ label, value });
  }

  return rows;
}

/**
 * Parse "### Day N: ..." / "### Stop N: ..." entries preserving heading text.
 */
function parseItinerary(text) {
  const lines = text.split('\n');
  const items = [];
  let current = null;

  const flush = () => {
    if (!current) {
      return;
    }

    const heading = current.heading;
    const labelMatch = heading.match(/^(Day\s+\d+[a-z]?|Stop\s+\d+)\s*:\s*(.*)$/i);

    let dayLabel;
    let rest;

    if (labelMatch) {
      dayLabel = labelMatch[1];
      rest = labelMatch[2];
    } else {
      dayLabel = null;
      rest = heading;
    }

    let altitudeText = null;
    let durationText = null;

    const altitudeMatch = rest.match(/\(([^)]*\bm\b[^)]*)\)/);
    if (altitudeMatch) {
      altitudeText = altitudeMatch[1].trim();
    }

    const durationMatch = rest.match(/(\d+\s*(?:to\s*\d+\s*)?(?:hours?|minutes?)(?:,?\s*and\s*\d+\s*(?:to\s*\d+\s*)?(?:hours?|minutes?))?)/i);
    if (durationMatch) {
      durationText = durationMatch[1].trim();
    }

    let title = rest;
    if (altitudeMatch) {
      title = title.replace(altitudeMatch[0], ' ');
    }
    if (durationMatch) {
      title = title.replace(durationMatch[1], ' ');
    }
    title = title.replace(/\s*,\s*$/, '').replace(/\s{2,}/g, ' ').trim();

    const dayBody = parseDayBody(current.body.join('\n').trim());

    items.push({
      order: items.length + 1,
      day: dayLabel,
      dayLabel: heading,
      title: title || rest,
      altitudeText,
      durationText,
      body: dayBody.body,
      points: dayBody.points,
    });

    current = null;
  };

  for (const line of lines) {
    if (/^###\s+/.test(line)) {
      flush();
      current = { heading: line.replace(/^###\s+/, '').trim(), body: [] };
      continue;
    }

    if (current) {
      current.body.push(line);
    }
  }

  flush();

  return items;
}

function parseFaqs(text) {
  const faqs = [];
  let current = null;

  const flush = () => {
    if (current) {
      faqs.push({
        order: faqs.length + 1,
        question: current.question,
        answer: current.answer.join('\n').trim(),
      });
    }
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);

    if (match) {
      flush();
      current = { question: match[1].trim(), answer: [] };
      if (match[2]) {
        current.answer.push(match[2]);
      }
      continue;
    }

    if (current && line) {
      current.answer.push(line);
    }
  }

  flush();

  return faqs;
}

/**
 * Map the free-text "Grade" from the snapshot onto the `difficulty`
 * enumeration the site groups the navbar by (easy | moderate | tough).
 *
 * This is the field the nav filters on: a tour whose `difficulty` is null
 * drops out of every difficulty group in the packages menu. Package grades
 * ("Moderate to demanding", etc.) are richer than the enum, so they are
 * collapsed to the nearest level rather than left unset.
 */
function gradeToDifficulty(grade) {
  if (!grade) {
    return null;
  }

  const value = String(grade).toLowerCase();

  if (/\b(easy|gentle|leisurely)\b/.test(value) && !/moderate|demanding|tough/.test(value)) {
    return 'easy';
  }
  if (/\b(tough|hard|demanding|strenuous|challenging|difficult)\b/.test(value)) {
    return 'tough';
  }
  if (/moderate/.test(value)) {
    return 'moderate';
  }

  return null;
}

function inferCategory(slug) {
  for (const entry of CATEGORY_BY_SUFFIX) {
    if (entry.test.test(slug)) {
      return entry.category;
    }
  }
  for (const entry of CATEGORY_BY_CONTAINS) {
    if (entry.test.test(slug)) {
      return entry.category;
    }
  }
  return null;
}

function parseDurationDays(snapshotRows) {
  const row = snapshotRows.find((item) => /^duration$/i.test(item.label));
  if (!row) {
    return null;
  }

  const value = String(row.value);

  // "1 night, 2 days" -> take the day count when both are present.
  const dayMatch = value.match(/(\d+)\s*days?/i);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }

  // "One day, about 6 to 7 hours" -> a single-day tour.
  if (/\b(one|1)\s*day\b/i.test(value) || /\bone[- ]day\b/i.test(value)) {
    return 1;
  }

  return null;
}

function snapshotValue(snapshotRows, matcher) {
  const row = snapshotRows.find((item) => matcher.test(item.label));
  return row ? row.value : null;
}

const RECOGNIZED_SECTIONS = [
  /^trip overview$/i,
  /^trip snapshot$/i,
  /^trip highlights$/i,
  /^tour highlights$/i,
  /^day-by-day itinerary$/i,
  /^itinerary\b/i,
  /^what is included$/i,
  /^what is not included$/i,
  /^frequently asked questions$/i,
];

function parsePackage(markdown, slug) {
  const { title, meta, sections } = tokenize(markdown);

  const overviewSection = findSection(sections, (heading) => /^trip overview$/i.test(heading));
  const snapshotSection = findSection(sections, (heading) => /^trip snapshot$/i.test(heading));
  const highlightsSection = findSection(sections, (heading) =>
    /^(trip|tour) highlights$/i.test(heading)
  );
  const itinerarySection = findSection(sections, (heading) => /itinerary/i.test(heading));
  const includedSection = findSection(sections, (heading) => /^what is included$/i.test(heading));
  const notIncludedSection = findSection(sections, (heading) =>
    /^what is not included$/i.test(heading)
  );
  const faqSection = findSection(sections, (heading) =>
    /^frequently asked questions$/i.test(heading)
  );

  const snapshotRows = snapshotSection ? parseSnapshot(snapshotSection.lines) : [];
  const snapshot = {};
  for (const row of snapshotRows) {
    snapshot[row.label] = row.value;
  }

  const extraSections = sections
    .filter((section) => !RECOGNIZED_SECTIONS.some((matcher) => matcher.test(section.heading)))
    .filter((section) => !/itinerary/i.test(section.heading))
    .map((section) => ({ title: section.heading, body: section.lines }));

  const grade = snapshotValue(snapshotRows, /^grade$/i);

  return {
    slug,
    title,
    category: inferCategory(slug),
    seoTitle: meta['seo title'] || null,
    metaDescription: meta['meta description'] || null,
    focusKeywords: meta['focus keywords'] ? splitKeywords(meta['focus keywords']) : [],
    overview: overviewSection ? overviewSection.lines : null,
    snapshotRows,
    snapshot,
    durationDays: parseDurationDays(snapshotRows),
    grade,
    difficulty: gradeToDifficulty(grade),
    highestPoint: snapshotValue(snapshotRows, /^highest point$/i),
    bestSeason: snapshotValue(snapshotRows, /^best season$/i),
    groupSize: snapshotValue(snapshotRows, /^group size$/i),
    startLocation: snapshotValue(snapshotRows, /^start and end$/i),
    highlights: highlightsSection ? bulletItems(highlightsSection.lines) : [],
    itinerary: itinerarySection ? parseItinerary(itinerarySection.lines) : [],
    included: includedSection ? bulletItems(includedSection.lines) : [],
    notIncluded: notIncludedSection ? bulletItems(notIncludedSection.lines) : [],
    extraSections,
    faqs: faqSection ? parseFaqs(faqSection.lines) : [],
  };
}

function validate(pkg) {
  const errors = [];

  if (!pkg.title) {
    errors.push('missing title (H1)');
  }
  if (!pkg.slug) {
    errors.push('missing slug');
  }
  if (!pkg.category) {
    errors.push('could not infer category');
  }
  if (!pkg.overview) {
    errors.push('missing trip overview');
  }
  if (!pkg.itinerary.length) {
    errors.push('missing itinerary');
  }
  if (!pkg.difficulty) {
    errors.push(`could not map grade "${pkg.grade}" to difficulty (easy|moderate|tough)`);
  }

  return errors;
}

function toListItems(items) {
  return items.map((text) => ({ text }));
}

function toTourData(pkg, order) {
  return {
    title: pkg.title,
    slug: pkg.slug,
    category: pkg.category,
    overview: pkg.overview,
    seoTitle: pkg.seoTitle,
    metaDescription: pkg.metaDescription,
    focusKeywords: pkg.focusKeywords,
    snapshot: pkg.snapshot,
    durationDays: pkg.durationDays,
    grade: pkg.grade,
    difficulty: pkg.difficulty,
    highestPoint: pkg.highestPoint,
    bestSeason: pkg.bestSeason,
    groupSize: pkg.groupSize,
    startLocation: pkg.startLocation,
    priceAmount: null,
    order,
    highlights: toListItems(pkg.highlights),
    itinerary: pkg.itinerary,
    inclusions: toListItems(pkg.included),
    exclusions: toListItems(pkg.notIncluded),
    extraSections: pkg.extraSections,
    faqs: pkg.faqs,
  };
}

function countTableRow(pkg) {
  return {
    slug: pkg.slug,
    itinerary: pkg.itinerary.length,
    points: pkg.itinerary.reduce((total, day) => total + (day.points ? day.points.length : 0), 0),
    highlights: pkg.highlights.length,
    included: pkg.included.length,
    notIncluded: pkg.notIncluded.length,
    faqs: pkg.faqs.length,
    extraSections: pkg.extraSections.length,
    snapshot: pkg.snapshotRows.length,
  };
}

function pointsTableRows(pkg) {
  return pkg.itinerary.map((day) => ({
    slug: pkg.slug,
    day: day.dayLabel,
    points: day.points ? day.points.length : 0,
  }));
}

async function upsertTour(strapi, pkg, order) {
  const existing = await strapi.documents(TOUR_UID).findFirst({
    filters: { slug: pkg.slug },
    status: 'draft',
  });

  // `order` is deterministic (base + position) and excludes the imported tours
  // when computing its base, so setting it on every run is stable and repairs
  // any drift from an older version of this script.
  if (existing) {
    await strapi.documents(TOUR_UID).update({
      documentId: existing.documentId,
      data: toTourData(pkg, order),
      status: 'published',
    });
    return 'updated';
  }

  await strapi.documents(TOUR_UID).create({ data: toTourData(pkg, order), status: 'published' });
  return 'created';
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const files = listSourceFiles(flags.files);

  if (!files.length) {
    throw new Error('No markdown files matched.');
  }

  const parsed = [];
  let hasErrors = false;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const markdown = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    const pkg = parsePackage(markdown, slug);
    const errors = validate(pkg);

    if (errors.length) {
      hasErrors = true;
      console.error(`[import] ${slug}: ${errors.join('; ')}`);
    }

    parsed.push(pkg);
  }

  console.log('[import] Parsed packages:');
  console.table(parsed.map(countTableRow));

  if (hasErrors) {
    throw new Error('Validation failed; nothing was imported.');
  }

  if (flags.dryRun) {
    console.log('[import] Points per day:');
    console.table(parsed.flatMap(pointsTableRows));
    console.log('[import] Dry run: no database changes made.');
    return;
  }

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  try {
    const results = [];

    // Deterministic, sensible order: treks first, then tours, then safaris,
    // alphabetical within each category. Placed after the non-imported tours
    // so the imported packages list after the older ones rather than at the
    // top, and stable across re-runs (the base is read only from tours this
    // script does not own).
    const categoryRank = { trek: 0, tour: 1, safari: 2 };
    const ordered = [...parsed].sort((a, b) => {
      const rank = (categoryRank[a.category] ?? 9) - (categoryRank[b.category] ?? 9);
      return rank !== 0 ? rank : a.title.localeCompare(b.title);
    });

    const importedSlugs = new Set(parsed.map((pkg) => pkg.slug));
    const otherTours = await strapi.db.query(TOUR_UID).findMany({
      select: ['order', 'slug'],
    });
    const baseOrder = otherTours
      .filter((tour) => !importedSlugs.has(tour.slug))
      .reduce((max, tour) => Math.max(max, tour.order ?? 0), 0);

    for (let i = 0; i < ordered.length; i += 1) {
      const pkg = ordered[i];
      const order = baseOrder + i + 1;
      const action = await upsertTour(strapi, pkg, order);
      results.push({ slug: pkg.slug, action, order });
    }

    console.log('[import] Results:');
    console.table(results);
    console.log(`[import] Done. ${results.length} package(s) processed.`);
  } finally {
    await strapi.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[import] Failed: ${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  });
}

module.exports = { parsePackage, parseItinerary, parseFaqs, parseSnapshot, tokenize };
