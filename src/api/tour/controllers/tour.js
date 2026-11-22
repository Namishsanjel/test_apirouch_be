'use strict';

/**
 * tour controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::tour.tour', ({ strapi }) => ({
  /**
   * Default populate so a plain GET /api/tours returns `points`, `brochure` and
   * the rest without the caller having to know the schema shape. A client that
   * does pass its own `populate` is left untouched — the core controller then
   * applies it as usual.
   */
  async find(ctx) {
    const query = ctx.query || {};

    if (!query.populate) {
      ctx.query = {
        ...query,
        populate: {
          coverImage: true,
          gallery: true,
          brochure: true,
          destination: true,
          itinerary: true,
          inclusions: true,
          exclusions: true,
          highlights: true,
          extraSections: true,
          faqs: true,
        },
      };
    }

    return super.find(ctx);
  },

  async findBySlug(ctx) {
    const { slug } = ctx.params;

    if (!slug) {
      return ctx.badRequest('A slug is required');
    }

    const entity = await strapi.documents('api::tour.tour').findFirst({
      filters: { slug },
      populate: {
        coverImage: true,
        gallery: true,
        brochure: true,
        destination: true,
        itinerary: true,
        inclusions: true,
        exclusions: true,
        highlights: true,
        extraSections: true,
        faqs: true,
      },
      status: 'published',
    });

    if (!entity) {
      return ctx.notFound('Tour not found');
    }

    if (Array.isArray(entity.itinerary)) {
      entity.itinerary.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    if (Array.isArray(entity.faqs)) {
      entity.faqs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    const sanitized = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitized);
  },
}));
