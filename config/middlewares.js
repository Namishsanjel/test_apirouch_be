module.exports = ({ env }) => {
  // CORS_ORIGINS is a comma-separated list, e.g.
  //   CORS_ORIGINS=https://app.example.com,https://www.example.com
  // When unset, only local development origins are allowed, so local dev keeps
  // working without any extra configuration.
  const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const configuredOrigins = (env.array('CORS_ORIGINS') || [])
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [
    'strapi::logger',
    'strapi::errors',
    'strapi::security',
    {
      name: 'strapi::cors',
      config: {
        origin: configuredOrigins.length ? configuredOrigins : localOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};