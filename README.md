# Publish npm with Provenance

This action automates publishing a Node.js package to the npm registry using pnpm. It supports stable and beta releases based on git tags, strict version enforcement, and npm provenance generation.

## Usage

This action uses [trusted publishing](https://docs.npmjs.com/trusted-publishers) via OIDC. Before using this action, [set up a trusted publisher](https://docs.npmjs.com/trusted-publishers#configuring-trusted-publishing) for your package on npmjs.com.

Add the following to your workflow file:

```yaml
on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # required for trusted publishing
    steps:
      - uses: actions/checkout@v4
      - uses: lovc21/publish-npm-provenance@main
        with:
          # Optional: set if package.json is not in the root (e.g. app/)
          # path: app
```

## Provenance generation

npm provenance lets you verifiably link a published package back to its source repository and the exact build instructions used to create it. When publishing from GitHub Actions, a signed attestation is generated and uploaded to the npm registry, so consumers can confirm the package wasn't tampered with between source and publish.

See the [official npm provenance docs](https://docs.npmjs.com/generating-provenance-statements) for setup instructions.

### Verifying signature

Run this in any project that has your package as a dependency:

```bash
npm audit signatures
```

Or to verify a specific package:

```bash
mkdir /tmp/verify-test && cd /tmp/verify-test
npm init -y
npm install <your-package>
npm audit signatures
```

### Verifying with cosign

For advanced verification using [cosign](https://blog.sigstore.dev/cosign-verify-bundles/):

```bash
# 1. Download the package tarball
curl https://registry.npmjs.org/<scope>/<package>/-/<package>-<version>.tgz > package.tgz

# 2. Get the provenance bundle
curl "https://registry.npmjs.org/-/npm/v1/attestations/<scope>/<package>@<version>" \
  | jq '.attestations[]|select(.predicateType=="https://slsa.dev/provenance/v1").bundle' \
  > provenance.sigstore.json

# 3. Verify
cosign verify-blob-attestation \
  --bundle provenance.sigstore.json \
  --new-bundle-format \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  --certificate-identity-regexp="^https://github.com/<owner>/<repo>/.github/workflows/<workflow>.yml" \
  package.tgz
```

## Tag format

| Tag example      | Publishes as                       |
| ---------------- | ---------------------------------- |
| `v1.0.0`         | `latest` (stable)                  |
| `service/v1.0.0` | `latest` (stable, monorepo prefix) |
| `v1.0.0-rc.1`    | `beta`                             |
| `v1.0.0-alpha.1` | `beta`                             |

## Inputs

| Input                | Type    | Default               | Description                                                     |
| -------------------- | ------- | --------------------- | --------------------------------------------------------------- |
| `path`               | string  | `.`                   | Path to the package root directory containing `package.json`    |
| `strict_version`     | boolean | `true`                | Enforce that the git tag version matches `package.json` version |
| `npm_access`         | string  | `restricted`          | Package access level: `public` or `restricted`                  |
| `npm_provenance`     | boolean | `true`                | Enable npm provenance (requires `id-token: write` permission)   |
| `skip_publish`       | boolean | `false`               | Skip the publish step                                           |
| `debug_mode`         | boolean | `false`               | Print debug information on failure                              |
| `regex_stable_tag`   | string  | `v1.0.0` pattern      | Regex to match stable release tags                              |
| `regex_unstable_tag` | string  | `v1.0.0-rc.1` pattern | Regex to match beta release tags (rc/alpha)                     |
