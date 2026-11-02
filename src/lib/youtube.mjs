// Finds a YouTube video link (watch, youtu.be, shorts or embed) in note text.
const YT = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s)<>]*?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})[^\s)<>]*/;

/** First YouTube link in `text`, as { url, id, short }, or null. */
export function findYouTube(text) {
  const m = text.match(YT);
  return m ? { url: m[0], id: m[1], short: m[0].includes('/shorts/') } : null;
}
