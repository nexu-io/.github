// Refresh the ⭐ star counts embedded in profile/README.md.
//
// Every `<!--stars:owner/repo-->…<!--/stars-->` marker in the README is rewritten
// with the repo's current stargazer count, formatted the way GitHub displays it
// (e.g. 64165 -> "64.2k", 194 -> "194"). Run on a schedule by
// .github/workflows/update-stars.yml so the org profile never goes stale.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const README = resolve(HERE, '../../profile/README.md');
const MARKER = /<!--stars:([^>]+?)-->.*?<!--\/stars-->/g;

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

// Match GitHub's own abbreviation: < 1000 exact, otherwise one decimal in
// thousands with a trailing ".0" trimmed (1000 -> "1k", 1500 -> "1.5k").
function formatStars(n) {
  if (n < 1000) return String(n);
  let s = (n / 1000).toFixed(1);
  if (s.endsWith('.0')) s = s.slice(0, -2);
  return `${s}k`;
}

async function stargazers(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'open-design-star-updater',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GET repos/${repo} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()).stargazers_count;
}

const before = await readFile(README, 'utf8');

const repos = [...new Set([...before.matchAll(MARKER)].map((m) => m[1].trim()))];
if (repos.length === 0) {
  console.log('No <!--stars:…--> markers found; nothing to do.');
  process.exit(0);
}

const counts = Object.fromEntries(
  await Promise.all(repos.map(async (repo) => [repo, formatStars(await stargazers(repo))])),
);

const after = before.replace(
  MARKER,
  (_, repo) => `<!--stars:${repo.trim()}-->${counts[repo.trim()]}<!--/stars-->`,
);

if (after === before) {
  console.log('Star counts unchanged:', counts);
} else {
  await writeFile(README, after);
  console.log('Star counts refreshed:', counts);
}
