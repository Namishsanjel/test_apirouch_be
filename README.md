# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

## Nav visibility (packages menu)

The frontend navbar builds its "Packages" dropdown from the published Tour
collection grouped by **difficulty**. A tour that is missing any of the fields
below silently drops out of every group, so treat them as required in practice:

| Field | What it controls |
| --- | --- |
| **Published** | Only published tours are fetched and shown. Drafts never appear. |
| **difficulty** (`easy` / `moderate` / `tough`) | The group the tour appears under. A `null` difficulty hides it from the menu entirely. |
| **order** (integer) | Position within the list (ascending). Null sorts last / unpredictably. |
| **title**, **slug** | Name shown and the detail-page link. |
| **durationDays** | The "N Days" chip beside the name (optional, but recommended). |

`src/api/tour/content-types/tour/lifecycles.js` applies safe defaults on
create/update so an admin/API-created tour is never excluded:

- `difficulty` is derived from `grade` when possible, otherwise `moderate`.
- `order` is set to the end of the list when missing.
- `category` defaults to `tour`.

### Importing the docs/source packages

```bash
npm run import-packages          # idempotent upsert by slug, publishes
npm run import-packages -- --dry-run
node scripts/import-packages.js --file=everest-base-camp-trek-15-days
```

### Checking nav visibility

```bash
npm run check:nav
```

Creates a tour with only the minimal required fields, asserts the lifecycle
filled `difficulty`/`order`/`category` and that the tour appears in the same
published-and-grouped data the navbar reads, then deletes it.

> Caching: this backend does not cache tour responses server-side. The frontend
> keeps a 60-second in-memory cache of the tours request (see
> `src/lib/strapi.js` in the frontend), so a just-created tour can take up to a
> minute to show in the menu; the menu's retry action clears it immediately.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
# test_apirouch_be
