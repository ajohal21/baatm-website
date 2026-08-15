import Parser from 'rss-parser';

export interface Episode {
  title: string;
  slug: string;
  pubDate: string;
  description: string;
  audioUrl: string;
  duration?: string;
  coverArt?: string;
}

const parser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'duration'],
      ['itunes:image', 'coverArt'],
    ],
  },
});

export async function getEpisodes(rssUrl: string): Promise<Episode[]> {
  const feed = await parser.parseURL(rssUrl);
  
  return (feed.items || []).map((item) => {
    const slug = item.title
      ? item.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      : 'episode';

    return {
      title: item.title || 'Untitled Episode',
      slug,
      pubDate: item.pubDate
        ? new Date(item.pubDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '',
      description: item.contentSnippet || item.content || '',
      audioUrl: item.enclosure?.url || '',
      duration: item.duration || '',
      coverArt: item.coverArt?.['$']?.href || feed.image?.url || '',
    };
  });
}