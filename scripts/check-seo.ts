import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const SITE_URL = 'https://indian-missile-tracker.pages.dev';
const OLD_SITE_URL = 'https://indianmissiletracker.harshcasper.dev';

function readDist(path: string): string {
  const absolutePath = join(DIST, path);
  if (!existsSync(absolutePath)) throw new Error(`Missing built SEO asset: dist/${path}`);
  return readFileSync(absolutePath, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SEO check failed: ${message}`);
}

function metaContent(html: string, attribute: 'name' | 'property', value: string): string | undefined {
  const pattern = new RegExp(`<meta\\s+${attribute}="${value}"\\s+content="([^"]+)"`, 'i');
  return html.match(pattern)?.[1];
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function nodeHasType(node: Record<string, unknown>, type: string): boolean {
  const nodeType = node['@type'];
  return nodeType === type || (Array.isArray(nodeType) && nodeType.includes(type));
}

const index = readDist('index.html');
const robots = readDist('robots.txt');
const sitemap = readDist('sitemap.xml');
const llms = readDist('llms.txt');
const rss = readDist('rss.xml');
const manifest = JSON.parse(readDist('site.webmanifest')) as Record<string, unknown>;

for (const [name, contents] of Object.entries({ index, robots, sitemap, llms, rss })) {
  assert(!contents.includes(OLD_SITE_URL), `${name} still references the retired canonical domain`);
}

const title = decodeEntities(index.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '');
assert(title.length >= 30 && title.length <= 65, `title length must be 30–65 characters (found ${title.length})`);

const description = decodeEntities(metaContent(index, 'name', 'description') ?? '');
assert(
  description.length >= 120 && description.length <= 165,
  `meta description length must be 120–165 characters (found ${description.length})`,
);

const canonicalMatches = [...index.matchAll(/<link rel="canonical" href="([^"]+)"/gi)];
assert(canonicalMatches.length === 1, `expected one canonical link (found ${canonicalMatches.length})`);
assert(canonicalMatches[0][1] === `${SITE_URL}/`, 'canonical link does not match the production URL');
assert(metaContent(index, 'property', 'og:url') === `${SITE_URL}/`, 'og:url does not match the canonical URL');
assert(metaContent(index, 'property', 'og:image') === `${SITE_URL}/og-v2.png`, 'og:image must be absolute');
assert(metaContent(index, 'name', 'twitter:card') === 'summary_large_image', 'Twitter card is missing');
assert(index.includes('<h1>Indian Missiles:'), 'crawlable fallback content must include the primary heading');

const structuredData = [...index.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]) as Record<string, unknown>);
assert(structuredData.length > 0, 'JSON-LD structured data is missing');

const graph = structuredData.flatMap((item) => {
  const nodes = item['@graph'];
  return Array.isArray(nodes) ? nodes as Record<string, unknown>[] : [item];
});
const website = graph.find((node) => nodeHasType(node, 'WebSite'));
const dataset = graph.find((node) => nodeHasType(node, 'Dataset'));
const application = graph.find((node) => nodeHasType(node, 'WebApplication'));
assert(website?.url === `${SITE_URL}/`, 'WebSite structured data is missing or has the wrong URL');
assert(dataset?.url === `${SITE_URL}/`, 'Dataset structured data is missing or has the wrong URL');
assert(Array.isArray(dataset?.distribution) && dataset.distribution.length > 0, 'Dataset distribution is missing');
assert(typeof dataset?.dateModified === 'string', 'Dataset dateModified is missing');
assert(application?.url === `${SITE_URL}/`, 'WebApplication structured data is missing or has the wrong URL');

assert(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), 'robots.txt has the wrong sitemap URL');
assert(sitemap.includes(`<loc>${SITE_URL}/</loc>`), 'sitemap.xml has the wrong canonical URL');
assert(sitemap.includes('<lastmod>'), 'sitemap.xml is missing lastmod');
assert(llms.includes(`Canonical site: ${SITE_URL}/`), 'llms.txt has the wrong canonical URL');
assert(rss.includes(`<link>${SITE_URL}/</link>`), 'RSS channel has the wrong canonical URL');
assert(manifest.start_url === '/', 'web manifest start_url must be root-relative');
assert(manifest.name === 'Indian Missile Tracker', 'web manifest name is incorrect');

const image = readFileSync(join(DIST, 'og-v2.png'));
assert(image.subarray(1, 4).toString('ascii') === 'PNG', 'Open Graph image is not a PNG');
assert(image.readUInt32BE(16) === 1200 && image.readUInt32BE(20) === 630, 'Open Graph image must be 1200×630');

console.log(`✓ SEO validated: ${title.length}-character title, ${description.length}-character description, canonical crawl files, JSON-LD, social image and web manifest`);
