# World Cup historical score enhancer data

Download source CSV files before running ETL:

```powershell
npm run etl:worldcup:download
```

The downloader stores `source_manifest.json` with source URLs, byte counts and
SHA256 checksums. You can also place files manually if you have audited copies.

Expected Fjelstul World Cup database files:

- `matches.csv`
- `goals.csv`
- `tournament_stages.csv`
- `host_countries.csv`

Expected martj42 international results files:

- `results.csv`
- `shootouts.csv`

Generated files:

- `international_elo_backfill.csv`
- `international_elo_backfill.parquet` when parquet engine is installed
- `worldcup_reg90_matches.csv`
- `worldcup_reg90_matches.parquet` when parquet engine is installed
- `hist_score_priors.json`

The ETL never uses final score as the regular-time score. Regular-time scores are rebuilt from `goals.csv`.
