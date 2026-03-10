"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function run() {
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
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const packageVersion = packageJson.version;
    if (strictVersion) {
        const normalizedTag = tagVersion.replace(/^v/, '');
        if (normalizedTag !== packageVersion) {
            core.setFailed(`Tag version (${tagVersion}) does not match package.json version (v${packageVersion}).`);
            return;
        }
        core.info(`Tag version matches package.json: ${packageVersion}`);
    }
    else {
        core.info('Skipping version check (strict_version=false)');
    }
    await exec.exec('npm', ['install', '-g', 'pnpm']);
    await exec.exec('pnpm', ['install', '--frozen-lockfile'], { cwd: absProjectDir });
    const hasBuild = packageJson.scripts?.['build'];
    if (hasBuild) {
        await exec.exec('pnpm', ['build'], { cwd: absProjectDir });
    }
    else {
        core.info('No build script found, skipping build.');
    }
    // Use npm publish for trusted publishing OIDC support
    const publishArgs = ['publish', '--access', npmAccess];
    if (npmProvenance) {
        publishArgs.push('--provenance');
    }
    const stableRegex = new RegExp(regexStable);
    const unstableRegex = new RegExp(regexUnstable);
    if (stableRegex.test(commitTag)) {
        core.info('Publishing STABLE release...');
        await exec.exec('npm', publishArgs, { cwd: absProjectDir });
    }
    else if (unstableRegex.test(commitTag)) {
        core.info('Publishing BETA release (rc/alpha)...');
        await exec.exec('npm', [...publishArgs, '--tag', 'beta'], { cwd: absProjectDir });
    }
    else {
        core.setFailed(`Tag '${commitTag}' does not match stable or unstable pattern.\n` +
            `Stable example: v1.0.0 or service/v1.0.0\n` +
            `Beta example: v1.0.0-rc.1 or v1.0.0-alpha.1`);
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
run().catch((err) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
});
//# sourceMappingURL=index.js.map