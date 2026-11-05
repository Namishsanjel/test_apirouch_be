'use strict';

/**
 * tour controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::tour.tour', ({ strapi }) => ({
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
