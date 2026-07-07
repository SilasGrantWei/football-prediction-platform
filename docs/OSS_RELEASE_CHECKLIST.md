# OSS Release Checklist

Use this checklist before uploading the project to GitHub.

## Repository

- Create a new public GitHub repository named `football-prediction-platform`.
- Upload the contents of `football-prediction-platform-oss.zip`, or push the
  cleaned folder directly.
- Keep `LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `CITATION.cff`, `DEPENDENCIES.md`,
  `SUPPORT.md`, `MAINTAINERS.md`, `THIRD_PARTY_NOTICES.md`, and
  `.github/workflows/ci.yml` in the first public commit.
- Replace placeholders in `MAINTAINERS.md`, `.github/CODEOWNERS`, and
  `.github/ISSUE_TEMPLATE/config.yml`.
- Do not upload `.env`, `node_modules`, `.venv`, `.next`, logs, or local zips.

## Local commands

```powershell
cd C:\Code\CodexRepair\football-prediction-platform
npm install
npm run build
npm run test:api
npm run test:ai
npm audit --audit-level=moderate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-oss-package.ps1
```

If `npm audit` reports the known Next.js nested `postcss` finding, review
`docs/SECURITY_AUDIT.md` before changing framework versions.

## Suggested initial Git commands

Run these only inside the cleaned project folder, not from `C:\Code\CodexRepair`
itself.

```powershell
git init
git add .
git commit -m "Initial open source release"
git branch -M main
git remote add origin https://github.com/SilasGrantWei/football-prediction-platform.git
git push -u origin main
```

After pushing, replace all `<...>` placeholders in
`docs/openai-codex-for-oss-application.md` and submit the OpenAI form.

## Optional release commands

```powershell
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 ..\football-prediction-platform-oss.zip --title "v0.1.0" --notes-file RELEASE_NOTES.md
```

Only run the `gh release create` command after the repository exists on GitHub
and the GitHub CLI is authenticated.
