# feed.casabona.org

A mostly static timeline of Joe's YouTube videos, podcast episodes, blog posts, notes and photos. Astro + GitHub Pages + Pages CMS. See the build spec for the full design.

## One-time setup

1. Create a **public** GitHub repo and push this folder to `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**. Set the custom domain to `feed.casabona.org` and enforce HTTPS.
3. DNS: `CNAME feed → <user>.github.io`.
4. Sign in at [pagescms.org](https://pagescms.org) with GitHub and open the repo. `.pages.yml` defines the Notes and Photos collections.
5. Delete the sample note and photo in `src/content/` (and `public/media/sample.svg`).

## Local

```bash
npm install
npm run fetch   # refresh data/feed-cache.json
npm run dev
```

## Where things live

| What | Where |
|---|---|
| Source names, colors, feed URLs, subscribe links, page size, timezone | `src/config/sources.ts` |
| Feed fetch + normalize (`source, title, url, date, excerpt, media`) | `scripts/fetch-feeds.mjs` |
| Cached feed items | `data/feed-cache.json` |
| Build/deploy, hourly schedule, keepalive | `.github/workflows/deploy.yml` |

Dates typed in the CMS are treated as America/New_York wall-clock time.
