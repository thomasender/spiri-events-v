# Security scanning (dependencies)

Read this ONLY when you touch `.github/workflows/security-scan.yml`, `.github/dependabot.yml`,
`.trivyignore.yaml`, or when the scan is red / an issue "Security scan: vulnerable dependencies"
shows up.

## How it works

- Workflow: `.github/workflows/security-scan.yml`. Runs weekly (Mondays 04:17 UTC), manually
  (`workflow_dispatch`), and on PRs / pushes to `main` that touch `package.json`,
  `package-lock.json`, `functions/package.json`, `functions/package-lock.json`,
  `.trivyignore.yaml` or the workflow itself. (The paths filter exists only here, never on
  `deploy.yml`.)
- Trivy scans the two lockfiles (root and `functions/`) as two matrix legs for known
  vulnerabilities: severity HIGH/CRITICAL, only findings with a fix available
  (`ignore-unfixed`).
- **Gate:** production dependencies only (Trivy skips devDependencies of npm lockfiles by
  default). Any finding turns the run red.
- **Report-only pass:** a second scan with `TRIVY_INCLUDE_DEV_DEPS=true` (build/test tools). It
  never fails the run; results are listed in the job summary and uploaded as separate code
  scanning category (`trivy-<root|functions>-dev`).
- SARIF results are uploaded to Security > Code scanning (not for fork PRs).
- On scheduled runs with findings, ONE issue "Security scan: vulnerable dependencies" (label
  `security`) is created, or a comment is added to the open one. Nothing is closed
  automatically; close it by hand once the scan is green.
- `.github/dependabot.yml` opens weekly update PRs (minor/patch grouped; Firebase and tiptap
  grouped separately; majors of eslint, typescript, vite, vitest, happy-dom and react-router
  are done by hand, security updates still come through).

## Rollout switch

`SCAN_BLOCKING` at the top of the workflow (`env:`). `'true'` = findings fail the run,
`'false'` = report-only (summary + code scanning + weekly issue, run stays green).

## Pinned actions (verified at implementation, 2026-10-24)

All actions are pinned by full commit SHA with the tag as comment. Do not use floating tags.
Dependabot (github-actions ecosystem) proposes updates for the SHAs.

| Action                            | Tag     | Commit                                   |
| --------------------------------- | ------- | ---------------------------------------- |
| aquasecurity/trivy-action         | v0.36.0 | ed142fd0673e97e23eac54620cfb913e5ce36c25 |
| github/codeql-action/upload-sarif | v4.39.1 | 9b3254085494b55a0f7c4c2b3d2d52cc712ce370 |
| actions/checkout                  | v7.0.1  | 3d3c42e5aac5ba805825da76410c181273ba90b1 |

trivy-action had a supply-chain compromise in early 2026 (old tags were repointed). v0.36.0
(Trivy v0.70.0) is a newer, signed, annotated tag whose commit is on `master`; the SHA was
resolved with `git ls-remote` (dereferenced `^{}`) and cross-checked in a clone. Its own
dependencies (`setup-trivy`, `actions/cache`) are SHA-pinned inside the action.

## Reading the results

- Job summary of the run: one section per leg with a table (ID, level, details).
- Security > Code scanning: alerts per category.
- A red run with the message "Trivy could not complete ... tool error" is NOT a vulnerability
  (e.g. DB download failed). Re-run the job. The DB is fetched from ghcr.io with a fallback to
  public.ecr.aws.
- To fix: update the package (`npm audit fix` or a targeted bump), commit the lockfile.

## Ignoring a finding properly

Only if it is not reachable / not exploitable for us, or the fix is not available yet. Add to
`.trivyignore.yaml`:

```yaml
vulnerabilities:
  - id: GHSA-xxxx-xxxx-xxxx # or CVE-...
    statement: Why this is safe for us, and the package/version.
    expired_at: 2027-01-22 # always set; max about 6 months out
```

Optional `paths:` limits an ignore to specific files. After the date the finding comes back,
which forces a re-check.

## Run Trivy locally

```bash
trivy fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed .
# including devDependencies:
trivy fs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --include-dev-deps .
```
