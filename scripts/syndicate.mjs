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

function* entries() {
  for (const kind of ['notes', 'photos']) {
    for (const f of readdirSync(`src/content/${kind}`).filter((f) => f.endsWith('.md'))) {
      const raw = readFileSync(`src/content/${kind}/${f}`, 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const date = m?.[1].match(/^date:\s*['"]?(\S+?)['"]?\s*$/m)?.[1];
      if (!date || date > now) continue;
      const slug = f.replace(/\.md$/, '');
      yield { slug, text: plain(m[2]), url: `${SITE}/${kind}/${slug}/` };
    }
  }
  const { items } = JSON.parse(readFileSync('data/feed-cache.json', 'utf8'));
  for (const i of items) {
    if (new Date(i.date) > new Date()) continue;
    yield { slug: i.url, text: i.title, url: i.url };
  }
}

async function bluesky({ text, url }) {
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
      facets: [{
        index: { byteStart, byteEnd: byteStart + enc.encode(url).length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      }],
    },
  }, accessJwt);
}

async function threads({ text, url }) {
  const api = `https://graph.threads.net/v1.0/${THREADS_USER_ID}`;
  const call = async (path, params) => {
    const r = await fetch(`${api}/${path}`, {
      method: 'POST',
      body: new URLSearchParams({ ...params, access_token: THREADS_TOKEN }),
    });
    if (!r.ok) throw new Error(`threads ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const { id } = await call('threads', {
    media_type: 'TEXT', text: trim(text, 500), link_attachment: url,
  });
  await call('threads_publish', { creation_id: id });
}

const senders = { bluesky, threads };
let dirty = false;
for (const e of entries()) {
  for (const [name, send] of Object.entries(senders)) {
    if (!targets[name] || state[e.slug]?.[name]) continue;
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
