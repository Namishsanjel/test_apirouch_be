'use strict';

/**
 * tour lifecycle
 *
 * Keeps every tour nav-visible. The navbar's packages menu groups tours by
 * `difficulty` (easy | moderate | tough) and orders them by `order`, so a tour
 * saved without those fields silently disappears from the menu. These hooks
 * fill them with sensible defaults on create and backfill them on update so a
 * tour created straight from the admin panel or the REST API still shows up.
 *
 * Only fills gaps: a value an editor set is never overwritten.
 */

/** Collapse the free-text grade / travel type onto the difficulty enum. */
function difficultyFrom(input) {
  const raw = String(input || '').toLowerCase();
  if (!raw) return null;

  if (/\b(easy|gentle|leisurely)\b/.test(raw) && !/moderate|demanding|tough/.test(raw)) {
    return 'easy';
  }
  if (/\b(tough|hard|demanding|strenuous|challenging|difficult)\b/.test(raw)) {
    return 'tough';
  }
  if (/moderate/.test(raw)) {
    return 'moderate';
  }

  return null;
}

async function applyDefaults(event) {
  const data = event && event.params && event.params.data;
  if (!data || typeof data !== 'object') return;

  // Derive difficulty from the textual grade when it was left unset. When
  // there is no grade to read, fall back to "moderate" rather than leaving it
  // null — a null difficulty is what hides a tour from the navbar entirely.
  if (data.difficulty == null) {
    data.difficulty = difficultyFrom(data.grade) || 'moderate';
  }

  // Give a new tour an order at the end of the list when none was supplied.
  if (data.order == null) {
    const strapi = event.strapi || globalThis.strapi;
    if (strapi) {
      const rows = await strapi.db.query('api::tour.tour').findMany({
        select: ['order'],
        orderBy: { order: 'desc' },
        limit: 1,
      });
      data.order = (rows[0]?.order ?? 0) + 1;
    }
  }

  // A tour with no category is posted as a general tour rather than left null.
  if (data.category == null) {
    data.category = 'tour';
  }
}

module.exports = {
  async beforeCreate(event) {
    await applyDefaults(event);
  },
  async beforeUpdate(event) {
    await applyDefaults(event);
  },
};
