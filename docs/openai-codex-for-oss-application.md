# OpenAI Codex for OSS Application Draft

Form: https://openai.com/zh-Hans-CN/form/codex-for-oss/

Use this as a copy/paste draft after the GitHub repository is public.
Replace every `<...>` placeholder before submitting.

Checked against the public Chinese form on 2026-07-05.

## Form fields

Last name / Surname:
`<your last name>`

First name / Given name:
`<your first name>`

Email:
`<your ChatGPT account email>`

GitHub username:
`SilasGrantWei`

GitHub repository URL:
`https://github.com/SilasGrantWei/football-prediction-platform`

Describe your role: are you a primary or core maintainer?

```text
Primary maintainer. I created and maintain the project architecture, monorepo,
Node API, Next.js dashboard, Python/FastAPI AI service, data-provider fallback
policy, tests, Docker setup, and release documentation. I review changes, triage
issues, keep CI green, and manage releases.
```

Why does this repository qualify? Maximum 500 characters.

```text
This project is a new public OSS full-stack reference for real-time football
intelligence: ingestion, prediction, odds, simulation, calibration, and
dashboards. Its value is transparency: it separates provider facts from model
predictions and never fabricates missing match data. It can help developers
build honest sports-data and AI products.
```

I'm interested in:

```text
API credits for my project
Codex Security, if the repository qualifies for deeper security review
```

OpenAI Organization ID:
`<your OpenAI organization ID>`

How will you use API credits for your project? Maximum 500 characters.

```text
Use Codex/API credits only for open-source maintenance: PR review, issue
triage, test generation, refactoring provider adapters, docs, CI failure
analysis, and release workflow automation. Credits will not be used for private
customer work, proprietary betting automation, or closed-source development.
```

Anything else we should know? Maximum 500 characters.

```text
The repository has an MIT license, setup docs, CI, tests, .env.example,
dependency notes, changelog, security policy, contribution guide, and
no-fabrication data policy. This is a new public release, so I am not claiming
existing stars or downloads.
```

## Extra project summary

Use this only if another field appears or you need a GitHub README summary.

```text
Production Sports Intelligence System is an open-source football intelligence
platform for real-time match ingestion, prediction, odds comparison,
simulation, and post-match calibration. It includes a Next.js dashboard, Node
API, Python realtime gateway, FastAPI AI service, PostgreSQL schema, Docker
Compose deployment, and reproducible tests.
```

## Maintainer commitment

I will keep the repository public, maintain the MIT license, accept issues and
pull requests, publish setup instructions, and use Codex credits only for work
that directly improves the open-source repository.

## Short version for small text boxes

Open-source full-stack football intelligence platform with realtime ingestion,
prediction, odds comparison, simulation, and post-match calibration. It
prioritizes transparent data provenance and never invents match facts when
providers do not return them. Codex credits would support OSS maintenance,
tests, refactoring, docs, and CI debugging.
