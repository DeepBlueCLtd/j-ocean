import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

/**
 * The documentation site.
 *
 * Markdown under `docs/site/` becomes static HTML under `dist-site/`, published to GitHub
 * Pages. It is deliberately a small script rather than a static-site generator: the site
 * is a handful of reference pages and a blog, the whole build is readable in one sitting,
 * and NFR-01 asks that the system be reviewable as one TypeScript codebase.
 *
 * The site and the application share a typographic language on purpose. A figure that is
 * *declared* is dotted-underlined blue in the shell and in the glossary alike, because a
 * reader who learns the convention in one place should not have to learn it again in the
 * other (Principle V).
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE = join(ROOT, 'docs/site');
const OUT = join(ROOT, 'dist-site');

interface FrontMatter {
  readonly title: string;
  readonly summary: string;
  readonly date?: string;
  readonly order?: number;
}

interface Page {
  readonly slug: string;
  readonly href: string;
  readonly front: FrontMatter;
  readonly body: string;
}

/**
 * A deliberately small front-matter reader: `key: value` lines between `---` fences, no
 * nesting, no lists. Anything a page needs beyond that belongs in the page.
 */
function splitFrontMatter(text: string, source: string): { front: FrontMatter; markdown: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (match === null) throw new Error(`${source} has no front matter`);
  const fields: Record<string, string> = {};
  for (const line of (match[1] as string).split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (pair === null) continue;
    fields[pair[1] as string] = (pair[2] as string).replace(/^["']|["']$/g, '');
  }
  const title = fields['title'];
  const summary = fields['summary'];
  if (title === undefined) throw new Error(`${source} has no title`);
  if (summary === undefined) throw new Error(`${source} has no summary`);
  const order = fields['order'];
  const date = fields['date'];
  return {
    front: {
      title,
      summary,
      ...(date === undefined ? {} : { date }),
      ...(order === undefined ? {} : { order: Number(order) }),
    },
    markdown: text.slice(match[0].length),
  };
}

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface LayoutOptions {
  readonly title: string;
  readonly summary: string;
  readonly depth: number;
  readonly nav: readonly Page[];
  readonly current: string;
  readonly body: string;
}

function layout(options: LayoutOptions): string {
  const up = '../'.repeat(options.depth);
  const links = options.nav
    .map((page) => {
      const active = page.href === options.current ? ' class="active"' : '';
      return `<a href="${up}${page.href}"${active}>${escape(page.front.title)}</a>`;
    })
    .join('\n        ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(options.title)} &middot; j-ocean</title>
    <meta name="description" content="${escape(options.summary)}" />
    <link rel="stylesheet" href="${up}assets/style.css" />
  </head>
  <body>
    <header class="masthead">
      <a class="wordmark" href="${up}index.html">j-ocean</a>
      <p class="disclaimer">Not an operational forecast system.</p>
      <nav>
        ${links}
        <a class="external" href="https://github.com/DeepBlueCLtd/j-ocean">Repository</a>
      </nav>
    </header>
    <main>
${options.body}
    </main>
    <footer>
      <p>
        j-ocean is a teaching harness. Its numerics are real but reduced, its domain small,
        and its claims are about relative skill between references it computes itself. This
        site is a claim about the tree; where the two disagree, the tree wins.
      </p>
    </footer>
  </body>
</html>
`;
}

function readPages(directory: string, hrefPrefix: string): Page[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const slug = name.replace(/\.md$/, '');
      const source = relative(ROOT, join(directory, name));
      const { front, markdown } = splitFrontMatter(readFileSync(join(directory, name), 'utf8'), source);
      return { slug, href: `${hrefPrefix}${slug}.html`, front, body: marked.parse(markdown) as string };
    });
}

function build(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'blog'), { recursive: true });

  const pages = readPages(SOURCE, '').sort(
    (a, b) => (a.front.order ?? 99) - (b.front.order ?? 99) || a.slug.localeCompare(b.slug),
  );
  const posts = readPages(join(SOURCE, 'blog'), 'blog/').sort((a, b) =>
    (b.front.date ?? '').localeCompare(a.front.date ?? ''),
  );

  const blogIndexPage: Page = {
    slug: 'index',
    href: 'blog/index.html',
    front: { title: 'Notes', summary: 'Short engineering notes, one per beat.', order: 90 },
    body: '',
  };
  const nav = [...pages, blogIndexPage];

  for (const page of pages) {
    writeFileSync(
      join(OUT, `${page.slug}.html`),
      layout({
        title: page.front.title,
        summary: page.front.summary,
        depth: 0,
        nav,
        current: page.href,
        body: page.body,
      }),
    );
  }

  const postList = posts
    .map(
      (post) => `      <li>
        <a href="${post.slug}.html">${escape(post.front.title)}</a>
        <time datetime="${escape(post.front.date ?? '')}">${escape(post.front.date ?? '')}</time>
        <p>${escape(post.front.summary)}</p>
      </li>`,
    )
    .join('\n');

  writeFileSync(
    join(OUT, 'blog/index.html'),
    layout({
      title: 'Notes',
      summary: 'Short engineering notes, one per beat.',
      depth: 1,
      nav,
      current: 'blog/index.html',
      body: `      <h1>Notes</h1>
      <p class="lede">One short note per beat: what landed, what it cost, and what it
      refuses to claim.</p>
      <ul class="post-list">
${postList}
      </ul>`,
    }),
  );

  for (const post of posts) {
    writeFileSync(
      join(OUT, `blog/${post.slug}.html`),
      layout({
        title: post.front.title,
        summary: post.front.summary,
        depth: 1,
        nav,
        current: 'blog/index.html',
        body: `      <article>
      <p class="post-date"><time datetime="${escape(post.front.date ?? '')}">${escape(post.front.date ?? '')}</time></p>
${post.body}
      </article>`,
      }),
    );
  }

  cpSync(join(SOURCE, 'assets'), join(OUT, 'assets'), { recursive: true });
  if (existsSync(join(SOURCE, 'images'))) {
    cpSync(join(SOURCE, 'images'), join(OUT, 'images'), { recursive: true });
  }
  // Jekyll would otherwise swallow any path beginning with an underscore.
  writeFileSync(join(OUT, '.nojekyll'), '');

  process.stdout.write(
    `documentation site: ${String(pages.length)} pages, ${String(posts.length)} notes -> ${relative(ROOT, OUT)}\n`,
  );
}

build();
