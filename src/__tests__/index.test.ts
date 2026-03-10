import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import { run } from '../index';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;
const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

function setupInputs(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    path: 'test-npm',
    strict_version: 'true',
    npm_access: 'public',
    npm_provenance: 'false',
    skip_publish: 'false',
    debug_mode: 'false',
    regex_stable_tag: '^([a-zA-Z0-9_-]+/)?v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$',
    regex_unstable_tag:
      '^([a-zA-Z0-9_-]+/)?v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)-(rc|alpha)\\.(0|[1-9][0-9]*)$',
    ...overrides,
  };
  mockGetInput.mockImplementation((name) => defaults[name] ?? '');
}

function setupPackageJson(version: string, hasBuild = false) {
  const pkg = {
    version,
    ...(hasBuild ? { scripts: { build: 'tsc' } } : {}),
  };
  mockReadFileSync.mockReturnValue(JSON.stringify(pkg));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExec.mockResolvedValue(0);
  process.env['GITHUB_REF_NAME'] = 'v1.0.0';
});

afterEach(() => {
  delete process.env['GITHUB_REF_NAME'];
});

describe('skip_publish', () => {
  it('exits early when skip_publish is true', async () => {
    setupInputs({ skip_publish: 'true' });
    await run();
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });
});

describe('tag validation', () => {
  it('fails when no tag is set', async () => {
    setupInputs();
    setupPackageJson('1.0.0');
    delete process.env['GITHUB_REF_NAME'];
    await run();
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('No tag found'));
  });

  it('fails when tag does not match stable or unstable regex', async () => {
    setupInputs();
    setupPackageJson('1.0.0-beta');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0-beta';
    await run();
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('does not match'));
  });
});

describe('version check', () => {
  it('fails when tag version does not match package.json with strict_version=true', async () => {
    setupInputs({ strict_version: 'true' });
    setupPackageJson('1.0.1');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0';
    await run();
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('does not match'));
  });

  it('skips version check when strict_version=false', async () => {
    setupInputs({ strict_version: 'false' });
    setupPackageJson('9.9.9');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0';
    await run();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('strips monorepo prefix before comparing versions', async () => {
    setupInputs();
    setupPackageJson('1.0.0');
    process.env['GITHUB_REF_NAME'] = 'my-service/v1.0.0';
    await run();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });
});

describe('build step', () => {
  it('skips build when no build script exists', async () => {
    setupInputs();
    setupPackageJson('1.0.0', false);
    await run();
    const buildCalls = mockExec.mock.calls.filter(
      ([cmd, args]) => cmd === 'pnpm' && args?.[0] === 'build',
    );
    expect(buildCalls).toHaveLength(0);
  });

  it('runs build when build script exists', async () => {
    setupInputs();
    setupPackageJson('1.0.0', true);
    await run();
    expect(mockExec).toHaveBeenCalledWith('pnpm', ['build'], expect.any(Object));
  });
});

describe('publishing', () => {
  it('publishes stable release for a stable tag', async () => {
    setupInputs({ npm_provenance: 'false' });
    setupPackageJson('1.0.0');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0';
    await run();
    expect(mockExec).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public'],
      expect.any(Object),
    );
  });

  it('publishes beta release with --tag beta for unstable tag', async () => {
    setupInputs({ npm_provenance: 'false' });
    setupPackageJson('1.0.0-rc.1');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0-rc.1';
    await run();
    expect(mockExec).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--tag', 'beta'],
      expect.any(Object),
    );
  });

  it('adds --provenance flag when npm_provenance=true', async () => {
    setupInputs({ npm_provenance: 'true' });
    setupPackageJson('1.0.0');
    process.env['GITHUB_REF_NAME'] = 'v1.0.0';
    await run();
    expect(mockExec).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['--provenance']),
      expect.any(Object),
    );
  });
});
