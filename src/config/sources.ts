export type SourceId = 'youtube' | 'podcast' | 'casabona' | 'streamlined' | 'note' | 'photo';

export interface Source {
  id: SourceId;
  label: string;
  color: string;
  /** External feed URL. Native sources (notes, photos) have none. */
  feed?: string;
  kind?: 'atom' | 'rss';
}

export const YOUTUBE_CHANNEL_ID = 'UCCtkGL8t8FBb9FJl9TQcXRA'; // @streamlinedsolopreneur

export const sources: Record<SourceId, Source> = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000', // confirm against brand.youtube
    feed: `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
  },
  podcast: {
    id: 'podcast',
    label: 'Podcast',
    color: '#687C87',
    feed: 'https://streamlined.fm/feed/podcast',
  },
  casabona: {
    id: 'casabona',
    label: 'casabona.org',
    color: '#082C45',
    feed: 'https://casabona.org/feed.xml',
  },
  streamlined: {
    id: 'streamlined',
    label: 'Streamlined',
    color: '#F7D677',
    feed: 'https://streamlined.fm/category/articles/feed',
  },
  note: { id: 'note', label: 'Note', color: '#B5462E' },
  photo: { id: 'photo', label: 'Photo', color: '#5C8A3A' },
};

/** Black or white label text, whichever contrasts better (WCAG relative luminance). */
export function labelTextColor(hex: string): '#000' | '#fff' {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#000' : '#fff';
}

/** Podcast subscribe buttons, from https://streamlined.fm/podcast/ */
export const podcastLinks = [
  { name: 'Apple Podcasts', url: 'https://podcasts.apple.com/us/podcast/how-i-built-it-case-studies-coaching-for-creators-and/id1139480348' },
  { name: 'Spotify', url: 'https://open.spotify.com/show/2UqiXrltmIZSINbfTJwcLp' },
  { name: 'YouTube', url: 'https://www.youtube.com/playlist?list=PLBDzkPlPsdHlRhNlc1xTzM_l1c43aFT_9' },
  { name: 'RSS', url: 'https://streamlined.fm/feed/podcast' },
];

export const SITE_TITLE = 'The Feed by Joe Casabona';
export const PAGE_SIZE = 20;
export const TIMEZONE = 'America/New_York';
