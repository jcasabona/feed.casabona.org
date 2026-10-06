// Cross-post new notes/photos and feed items to Bluesky and Threads. Run after deploy.
// State lives in data/syndicated.json: { "<slug or url>": { bluesky?: true, threads?: true } }
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://feed.casabona.org';
const STATE = 'data/syndicated.json';
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};

const { BSKY_HANDLE, BSKY_APP_PASSWORD, THREADS_USER_ID, THREADS_TOKEN } = process.env;
const targets = {
  bluesky: !!(BSKY_HANDLE && BSKY_APP_PASSWORD),
  threads: !!(THREADS_USER_ID && THREADS_TOKEN),
};

// Wall-clock "now" in New York, same shape as the CMS dates (YYYY-MM-DDTHH:MM).
const p = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]),
);
const now = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;

const plain = (md) =>
  md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]|^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();

const trim = (s, n) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('').trimEnd() + '…');

// Same slug the site builds from the date (src/lib/time.ts dateSlug), not the CMS filename.
function pageSlug(date) {
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(date)) {
    const [y, mo, da, h, mi] = date.match(/(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/).slice(1);
    return `${y}-${mo}-${da}-${h}${mi}`;
  }
  const t = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(date)).map((x) => [x.type, x.value]),
  );
  return `${t.year}-${t.month}-${t.day}-${t.hour}${t.minute}`;
}

function* entries() {
  for (const kind of ['notes', 'photos']) {
    for (const f of readdirSync(`src/content/${kind}`).filter((f) => f.endsWith('.md'))) {
      const raw = readFileSync(`src/content/${kind}/${f}`, 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const date = m?.[1].match(/^date:\s*['"]?(\S+?)['"]?\s*$/m)?.[1];
      if (!date || date > now) continue;
      const slug = f.replace(/\.md$/, '');
      const images = [...(m[1].matchAll(/- image:\s*(.+)\n\s+alt:\s*(.+)/g))].map((x) => ({
        path: x[1].trim().replace(/^['"]|['"]$/g, ''),
        alt: x[2].trim().replace(/^['"]|['"]$/g, ''),
      }));
      yield { slug, text: plain(m[2]), url: `${SITE}/${kind}/${pageSlug(date)}/`, images };
    }
  }
  const { items } = JSON.parse(readFileSync('data/feed-cache.json', 'utf8'));
  for (const i of items) {
    if (new Date(i.date) > new Date()) continue;
    yield { slug: i.url, text: i.title, url: i.url, images: [], source: i.source, title: i.title, excerpt: i.excerpt };
  }
}

// Resize/re-encode so each image fits Bluesky's 2 MB blob limit (also applies EXIF rotation).
async function prep(input, limit = 1_900_000, max = 2000) {
  const { default: sharp } = await import('sharp');
  let quality = 85, size = max;
  for (;;) {
    const { data, info } = await sharp(input).rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality }).toBuffer({ resolveWithObject: true });
    if (data.length <= limit || quality <= 40) return { data, info };
    quality -= 10; size = Math.round(size * 0.9);
  }
}

const meta = (html, prop) => {
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    if (new RegExp(`(?:property|name)=["']${prop}["']`, 'i').test(tag)) {
      return tag.match(/content=(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean);
    }
  }
};

// Link-card thumbnail: the page's og:image, else a screenshot of the top of the page.
async function cardThumb(url) {
  try {
    const html = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (feed.casabona.org)' } })).text();
    const og = meta(html, 'og:image');
    if (og) {
      const r = await fetch(new URL(og, url));
      if (r.ok) return (await prep(Buffer.from(await r.arrayBuffer()), 950_000, 1200)).data;
    }
  } catch (err) {
    console.error(`og:image for ${url}: ${err}`);
  }
  try {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME_PATH });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      return (await prep(await page.screenshot({ type: 'jpeg', quality: 80 }), 950_000, 1200)).data;
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(`screenshot of ${url}: ${err}`);
  }
}

async function bluesky({ text, url, images, title, excerpt }) {
  const base = 'https://bsky.social/xrpc';
  const post = async (path, body, token) => {
    const r = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`bluesky ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const { accessJwt, did } = await post('com.atproto.server.createSession', {
    identifier: BSKY_HANDLE, password: BSKY_APP_PASSWORD,
  });
  let embed;
  if (images.length) {
    const uploaded = [];
    for (const img of images.slice(0, 4)) {
      const { data, info } = await prep(`public${img.path}`);
      const r = await fetch(`${base}/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${accessJwt}` },
        body: data,
      });
      if (!r.ok) throw new Error(`bluesky uploadBlob: ${r.status} ${await r.text()}`);
      uploaded.push({
        alt: img.alt,
        image: (await r.json()).blob,
        aspectRatio: { width: info.width, height: info.height },
      });
    }
    embed = { $type: 'app.bsky.embed.images', images: uploaded };
  }
  if (title) {
    const thumb = await cardThumb(url);
    let blob;
    if (thumb) {
      const r = await fetch(`${base}/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${accessJwt}` },
        body: thumb,
      });
      if (r.ok) blob = (await r.json()).blob;
      else console.error(`bluesky card thumb: ${r.status} ${await r.text()}`);
    }
    embed = {
      $type: 'app.bsky.embed.external',
      external: { uri: url, title, description: excerpt ?? '', ...(blob && { thumb: blob }) },
    };
  }
  const body = text ? `${trim(text, 300 - url.length - 2)}\n\n${url}` : url;
  const enc = new TextEncoder();
  const byteStart = enc.encode(body.slice(0, body.lastIndexOf(url))).length;
  await post('com.atproto.repo.createRecord', {
    repo: did,
    collection: 'app.bsky.feed.post',
    record: {
      $type: 'app.bsky.feed.post',
      text: body,
      createdAt: new Date().toISOString(),
      ...(embed && { embed }),
      facets: [{
        index: { byteStart, byteEnd: byteStart + enc.encode(url).length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      }],
    },
  }, accessJwt);
}

async function threads({ text, url, images }) {
  const api = `https://graph.threads.net/v1.0`;
  const call = async (path, params) => {
    const r = await fetch(`${api}/${path}`, {
      method: 'POST',
      body: new URLSearchParams({ ...params, access_token: THREADS_TOKEN }),
    });
    if (!r.ok) throw new Error(`threads ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  // Media containers are processed asynchronously; wait until one is ready to publish.
  const ready = async (id) => {
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`${api}/${id}?fields=status&access_token=${THREADS_TOKEN}`);
      const { status } = await r.json();
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`threads container ${id}: ${status}`);
      await new Promise((res) => setTimeout(res, 3000));
    }
    throw new Error(`threads container ${id}: timed out`);
  };
  const user = `${THREADS_USER_ID}/threads`;
  let id;
  if (images.length) {
    const body = text ? `${trim(text, 500 - url.length - 2)}\n\n${url}` : url;
    const items = images.slice(0, 20);
    const multi = items.length > 1;
    const ids = [];
    for (const img of items) {
      const { id: itemId } = await call(user, {
        media_type: 'IMAGE',
        image_url: SITE + encodeURI(img.path),
        alt_text: img.alt,
        ...(multi ? { is_carousel_item: 'true' } : { text: body }),
      });
      ids.push(itemId);
    }
    id = multi ? (await call(user, { media_type: 'CAROUSEL', children: ids.join(','), text: body })).id : ids[0];
    await ready(id);
  } else {
    ({ id } = await call(user, { media_type: 'TEXT', text: trim(text, 500), link_attachment: url }));
  }
  await call(`${THREADS_USER_ID}/threads_publish`, { creation_id: id });
}

// Feed sources a platform already posts natively (Transistor handles the podcast on Bluesky).
const skip = { bluesky: ['podcast'], threads: [] };

const senders = { bluesky, threads };
let dirty = false;
for (const e of entries()) {
  for (const [name, send] of Object.entries(senders)) {
    if (!targets[name] || state[e.slug]?.[name] || skip[name].includes(e.source)) continue;
    try {
      await send(e);
      (state[e.slug] ??= {})[name] = true;
      dirty = true;
      console.log(`${name}: posted ${e.slug}`);
    } catch (err) {
      console.error(String(err));
      process.exitCode = 1;
    }
  }
}
if (dirty) writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
