// Hashtags in notes and photo captions. Shared by the site build, the remark plugin and scripts/syndicate.mjs.

/** `#Name` at a word start; must begin with a letter (so `#1` and URL fragments don't count). */
export const TAG_PATTERN = '(^|[^\\w&/#])#([A-Za-z]\\w*)';

export const tagSlug = (name) => name.toLowerCase();

/** Unique lowercase tag slugs found in a markdown/plain string. */
export function extractTags(text) {
  return [...new Set([...text.matchAll(new RegExp(TAG_PATTERN, 'gm'))].map((m) => tagSlug(m[2])))];
}

function linkify(value) {
  const out = [];
  let last = 0;
  for (const m of value.matchAll(new RegExp(TAG_PATTERN, 'gm'))) {
    const start = m.index + m[1].length;
    if (start > last) out.push({ type: 'text', value: value.slice(last, start) });
    out.push({
      type: 'link',
      url: `/tags/${tagSlug(m[2])}/`,
      children: [{ type: 'text', value: `#${m[2]}` }],
    });
    last = start + m[2].length + 1;
  }
  if (!out.length) return null;
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function walk(node) {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== 'text') {
      walk(child);
      return [child];
    }
    return linkify(child.value) ?? [child];
  });
}

/** Remark plugin: turns #hashtags in text into links to /tags/<tag>/. */
export function remarkTags() {
  return (tree) => walk(tree);
}
