import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

export async function run(): Promise<void> {
  const projectDir = core.getInput('path') || '.';
  const strictVersion = core.getInput('strict_version') === 'true';
  const npmAccess = core.getInput('npm_access') || 'restricted';
  const npmProvenance = core.getInput('npm_provenance') === 'true';
  const skipPublish = core.getInput('skip_publish') === 'true';
  const debugMode = core.getInput('debug_mode') === 'true';
  const regexStable = core.getInput('regex_stable_tag');
  const regexUnstable = core.getInput('regex_unstable_tag');

  if (skipPublish) {
    core.info('skip_publish is true, skipping.');
    return;
  }

  const commitTag = process.env['GITHUB_REF_NAME'] ?? '';
  if (!commitTag) {
    core.setFailed('No tag found. This action must run on a tag push event.');
    return;
  }
  const tagVersion = commitTag.replace(/^[a-zA-Z0-9_-]+\//, '');

  const absProjectDir = path.resolve(projectDir);
  const packageJsonPath = path.join(absProjectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string };
  const packageVersion = packageJson.version;

  if (strictVersion) {
    const normalizedTag = tagVersion.replace(/^v/, '');
    if (normalizedTag !== packageVersion) {
      core.setFailed(
        `Tag version (${tagVersion}) does not match package.json version (v${packageVersion}).`,
      );
      return;
    }
    core.info(`Tag version matches package.json: ${packageVersion}`);
  } else {
    core.info('Skipping version check (strict_version=false)');
  }

  await exec.exec('npm', ['install', '-g', 'npm@latest', 'pnpm']);

  await exec.exec('pnpm', ['install', '--frozen-lockfile'], { cwd: absProjectDir });

  const hasBuild = (packageJson as { scripts?: Record<string, string> }).scripts?.['build'];
  if (hasBuild) {
    await exec.exec('pnpm', ['build'], { cwd: absProjectDir });
  } else {
    core.info('No build script found, skipping build.');
  }

  const publishArgs = ['publish', '--access', npmAccess];
  if (npmProvenance) {
    publishArgs.push('--provenance');
  }

  const stableRegex = new RegExp(regexStable);
  const unstableRegex = new RegExp(regexUnstable);

  if (stableRegex.test(commitTag)) {
    core.info('Publishing STABLE release...');
    await exec.exec('npm', publishArgs, { cwd: absProjectDir });
  } else if (unstableRegex.test(commitTag)) {
    core.info('Publishing BETA release (rc/alpha)...');
    await exec.exec('npm', [...publishArgs, '--tag', 'beta'], { cwd: absProjectDir });
  } else {
    core.setFailed(
      `Tag '${commitTag}' does not match stable or unstable pattern.\n` +
        `Stable example: v1.0.0 or service/v1.0.0\n` +
        `Beta example: v1.0.0-rc.1 or v1.0.0-alpha.1`,
    );
    return;
  }

  if (debugMode) {
    core.info('=== Debug Info ===');
    core.info(`path: ${projectDir}`);
    core.info(`npm_access: ${npmAccess}`);
    core.info(`npm_provenance: ${npmProvenance}`);
    core.info(`commit_tag: ${commitTag}`);
  }
}

run().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
