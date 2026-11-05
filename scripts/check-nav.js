'use strict';

/**
 * Nav visibility check.
 *
 * There is no test framework in this project, so this is a small standalone
 * check with the one guarantee the navbar needs: a tour created with only the
 * minimal required fields still shows up in the data the packages menu reads.
 *
 * It mirrors the frontend's request (strapiData.jsx TOURS_PATH):
 *   GET tours?populate[...]&sort=order:asc&pagination[pageSize]=100
 * and the navbar rule: every published tour, grouped by `difficulty`, where a
 * tour with a null difficulty is dropped from every group.
 *
 * The probe tour is created through the document service (so the tour
 * lifecycles run, exactly as an admin/API create would), asserted on, then
 * deleted, so running it leaves no residue. Exit code 0 = pass, 1 = fail.
 *
 * Usage: npm run check:nav
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const TOUR_UID = 'api::tour.tour';
const PROBE_SLUG = '__nav-visibility-check__';
const DIFFICULTIES = ['Easy', 'Moderate', 'Tough'];
const DIFFICULTY_LABEL = { easy: 'Easy', moderate: 'Moderate', tough: 'Tough' };

function fail(message) {
  console.error(`[check:nav] FAIL: ${message}`);
  process.exitCode = 1;
}

/** The shape catalog.js builds: chips[0] is the difficulty label. */
function chips(entry) {
  return [DIFFICULTY_LABEL[entry.difficulty] ?? null, entry.durationDays ? `${entry.durationDays} Days` : null].filter(
    Boolean
  );
}

/** Every published tour, as the navbar groups it. */
function navGroups(tours) {
  return DIFFICULTIES.map((level) => ({
    level,
    items: tours.filter((t) => chips(t)[0] === level),
  })).filter((g) => g.items.length);
}

async function main() {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  let documentId = null;

  try {
    // Minimal create: only the fields a content-type marks required.
    const created = await strapi.documents(TOUR_UID).create({
      data: {
        title: 'Nav Visibility Check Tour',
        slug: PROBE_SLUG,
        overview: 'Probe tour created by scripts/check-nav.js.',
      },
      status: 'published',
    });

    documentId = created.documentId;

    const saved = await strapi.documents(TOUR_UID).findOne({ documentId });

    if (!saved) {
      fail('probe tour was not saved');
      return;
    }

    if (!saved.difficulty) {
      fail('lifecycle did not set a difficulty on a minimal tour');
    }
    if (saved.order == null) {
      fail('lifecycle did not set an order on a minimal tour');
    }
    if (!saved.category) {
      fail('lifecycle did not set a category on a minimal tour');
    }

    // Read the collection exactly as the frontend nav does.
    const tours = await strapi.documents(TOUR_UID).findMany({
      status: 'published',
      sort: { order: 'asc' },
      limit: 100,
      populate: { coverImage: true },
    });

    const groups = navGroups(tours);
    const appears = groups.some((g) => g.items.some((t) => t.slug === PROBE_SLUG));

    console.log('[check:nav] nav groups:');
    for (const g of groups) {
      console.log(`  ${g.level}: ${g.items.length}`);
    }

    if (!appears) {
      fail(`probe tour "${PROBE_SLUG}" is missing from the nav groups`);
      return;
    }

    console.log(`[check:nav] probe tour appears under "${DIFFICULTY_LABEL[saved.difficulty]}" (order ${saved.order})`);
    console.log('[check:nav] PASS');
  } finally {
    if (documentId) {
      await strapi.documents(TOUR_UID).delete({ documentId });
      console.log('[check:nav] probe tour removed');
    }
    await strapi.destroy();
  }
}

main().catch((error) => {
  console.error(`[check:nav] Failed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
