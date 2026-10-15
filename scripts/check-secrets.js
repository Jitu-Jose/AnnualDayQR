import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Defense in depth only: this catches known credential formats, not every secret.
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /(?:api[_-]?key|password|sessionToken|pin)\s*[:=]\s*['"][^'"\n]{6,}['"]/i,
];
const skipped = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report']);
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) {
      if (entry.name.startsWith('.env')) throw new Error(`Environment file must not be committed: ${file}`);
      const content = await readFile(file, 'utf8');
      if (patterns.some((pattern) => pattern.test(content))) throw new Error(`Potential credential in ${file}; inspect locally. Value withheld.`);
    }
  }
}
await walk('.');
console.log('Credential-pattern check passed (not a comprehensive secret audit).');
