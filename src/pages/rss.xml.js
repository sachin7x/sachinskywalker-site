import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog');
  return rss({
    title: 'Sachin Dohdiya',
    description: 'Notes on local-first AI tooling, autonomous coding agents, and the engineering behind open-source agent projects.',
    site: context.site,
    items: posts.map(p => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: new Date(p.data.date),
      link: `/blog/${p.slug}/`,
    })),
  });
}
