module.exports = ({ env }) => {
  // PUBLIC_URL is the public HTTPS origin of this API (e.g. https://api.example.com).
  // It is unset locally, and Strapi then falls back to its default behaviour.
  const publicUrl = env('PUBLIC_URL');

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    ...(publicUrl ? { url: publicUrl } : {}),
    app: {
      keys: env.array('APP_KEYS'),
    },
    webhooks: {
      populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
    },
  };
};
