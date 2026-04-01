// @ts-check
import { defineConfig } from 'astro/config';

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const site =
  process.env.SITE_URL ||
  (isGitHubActions && repository && process.env.GITHUB_REPOSITORY_OWNER
    ? `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io/${repository}`
    : undefined);
const base = (() => {
  if (site) {
    const pathname = new URL(site).pathname.replace(/\/$/, '');
    return pathname || '/';
  }

  return isGitHubActions && repository ? `/${repository}` : '/';
})();

// https://astro.build/config
export default defineConfig({
  site,
  base,
});
