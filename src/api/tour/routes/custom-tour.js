'use strict';

/**
 * Custom public routes for tours that are not part of the core router.
 */

module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/tours/slug/:slug',
      handler: 'tour.findBySlug',
      config: {
        auth: false,
      },
    },
  ],
};
