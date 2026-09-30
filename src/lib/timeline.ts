import { getCollection, type CollectionEntry } from 'astro:content';
import cache from '../../data/feed-cache.json';
import { dateSlug } from './time';

export interface FeedItem {
  source: 'youtube' | 'podcast' | 'casabona' | 'streamlined';
  title: string;
  url: string;
  date: string;
  excerpt: string;
  media: null | { type: 'youtube'; videoId: string } | { type: 'audio'; url: string; mime: string };
}

export type TimelineEntry =
  | { kind: 'external'; date: Date; item: FeedItem }
  | { kind: 'note'; date: Date; slug: string; entry: CollectionEntry<'notes'> }
  | { kind: 'photo'; date: Date; slug: string; entry: CollectionEntry<'photos'> };

export async function getNotes(): Promise<Extract<TimelineEntry, { kind: 'note' }>[]> {
  return (await getCollection('notes')).map((entry) => ({
    kind: 'note', date: entry.data.date, slug: dateSlug(entry.data.date), entry,
  }));
}

export async function getPhotos(): Promise<Extract<TimelineEntry, { kind: 'photo' }>[]> {
  return (await getCollection('photos')).map((entry) => ({
    kind: 'photo', date: entry.data.date, slug: dateSlug(entry.data.date), entry,
  }));
}

/** Everything, newest first. Notes/photos dated in the future stay hidden until then. */
export async function getTimeline(): Promise<TimelineEntry[]> {
  const now = Date.now();
  const external = (cache.items as FeedItem[]).map(
    (item): TimelineEntry => ({ kind: 'external', date: new Date(item.date), item }),
  );
  return [...external, ...(await getNotes()), ...(await getPhotos())]
    .filter((e) => e.date.getTime() <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
