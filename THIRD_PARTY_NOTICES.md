# Third-Party Notices

This repository does not intentionally vendor third-party source trees.

Direct dependencies are declared in:

- `package.json`
- `apps/web/package.json`
- `services/api/package.json`
- `package-lock.json`
- `backend/requirements.txt`
- `services/ai/requirements.txt`
- `services/ai/requirements-ml.txt`

Generated dependency folders such as `node_modules` and `.venv` are not part of
the source distribution. Review `DEPENDENCIES.md` and GitHub Dependency Graph
for package metadata, license metadata, and vulnerability alerts after the
repository is public.

## Data Sources

World Cup historical score enhancement uses public CSV snapshots downloaded by
`scripts/worldcup/download_worldcup_sources.py`. The downloader stores source
URLs, byte counts, and SHA256 checksums in
`data/worldcup/raw/source_manifest.json`.

Current public data source URLs:

- https://github.com/jfjelstul/worldcup
- https://github.com/martj42/international_results

Before redistributing modified data snapshots, review the upstream repositories'
current license and attribution requirements.
