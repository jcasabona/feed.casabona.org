// Fetches the four external feeds, normalizes them to one item shape and
// writes data/feed-cache.json. A failing feed keeps its previously cached
// items; the script never exits non-zero because of a feed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const YOUTUBE_CHANNEL_ID = 'UCCtkGL8t8FBb9FJl9TQcXRA';
const FEEDS = {
  youtube: `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
  podcast: 'https://streamlined.fm/feed/podcast',
  casabona: 'https://casabona.org/feed.xml',
  streamlined: 'https://streamlined.fm/category/articles/feed',
};
const LATEST = 30; // fetch each feed's latest items only; older ones stay in the cache
const CACHE = new URL('../data/feed-cache.json', import.meta.url);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  processEntities: false, // decode() handles entities; avoids the expansion limit on large feeds
});

const arr = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (x && typeof x === 'object' ? (x['#text'] ?? '') : (x ?? '')).toString();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function excerpt(html, words = 40) {
  // Feeds may hand us escaped HTML (&lt;p&gt;), so decode, strip tags, decode again.
  const plain = decode(
    decode(String(html ?? ''))
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  const parts = plain.split(' ').filter(Boolean);
  if (parts.length <= words) return plain;
  return parts.slice(0, words).join(' ').replace(/[,.;:!?—–-]+$/, '') + '…';
}

const iso = (d) => {
  const t = new Date(d);
  return isNaN(t) ? null : t.toISOString();
};

function normalizeAtom(feed, source) {
  return arr(feed.entry).map((e) => {
    const links = arr(e.link);
    const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
    const url = alt?.['@_href'];
    const item = {
      source,
      title: decode(text(e.title)),
      url,
      date: iso(e.published ?? e.updated),
      excerpt: excerpt(text(e.summary) || text(e.content) || text(e['media:group']?.['media:description'])),
      media: null,
    };
    if (source === 'youtube') {
      const id = text(e['yt:videoId']);
      item.media = { type: 'youtube', videoId: id };
      item.excerpt = '';
    }
    return item;
  });
}

function normalizeRss(channel, source) {
  return arr(channel.item).map((e) => {
    const enclosure = arr(e.enclosure)[0];
    const item = {
      source,
      title: decode(text(e.title)),
      url: text(e.link) || text(e.guid),
      date: iso(e.pubDate),
      excerpt: excerpt(text(e.description) || text(e['content:encoded'])),
      media: null,
    };
    if (source === 'podcast' && enclosure?.['@_url']) {
      item.media = { type: 'audio', url: enclosure['@_url'], mime: enclosure['@_type'] ?? 'audio/mpeg' };
    }
    return item;
  });
}

async function fetchSource(source, url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'feed.casabona.org build (+https://feed.casabona.org)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const items = doc.feed ? normalizeAtom(doc.feed, source) : normalizeRss(doc.rss.channel, source);
  return items
    .filter((i) => i.url && i.date && i.title)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, LATEST);
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    return { updated: null, items: [] };
  }
}

const cache = await readCache();
const bySource = Object.fromEntries(Object.keys(FEEDS).map((s) => [s, []]));
for (const item of cache.items) bySource[item.source]?.push(item);

const results = await Promise.allSettled(
  Object.entries(FEEDS).map(async ([source, url]) => [source, await fetchSource(source, url)]),
);

results.forEach((r, i) => {
  const source = Object.keys(FEEDS)[i];
  if (r.status === 'rejected') {
    console.warn(`[feeds] ${source}: FAILED (${r.reason?.message ?? r.reason}); keeping ${bySource[source].length} cached items`);
    return;
  }
  // Merge fresh items over the cache, keyed by URL. Older items stay cached.
  const merged = new Map(bySource[source].map((it) => [it.url, it]));
  for (const it of r.value[1]) merged.set(it.url, it);
  bySource[source] = [...merged.values()];
  console.log(`[feeds] ${source}: ${r.value[1].length} fetched, ${bySource[source].length} cached`);
});

const items = Object.values(bySource)
  .flat()
  .sort((a, b) => new Date(b.date) - new Date(a.date));

// Only bump `updated` when content changed, so an unchanged run leaves no diff.
const changed = JSON.stringify(items) !== JSON.stringify(cache.items);
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  CACHE,
  JSON.stringify({ updated: changed ? new Date().toISOString() : cache.updated, items }, null, 2) + '\n',
);
console.log(changed ? '[feeds] cache updated' : '[feeds] no changes');
