# Contributing

Thanks for helping improve Production Sports Intelligence System.

## Development setup

```powershell
npm install
pip install -r services\ai\requirements.txt
pip install -r backend\requirements.txt
```

For local development, copy `.env.example` to `.env` and fill only the provider
keys you intend to use. The project must keep working in demo mode without paid
provider credentials.

## Quality checks

Run the focused checks before opening a pull request:

```powershell
npm run build
npm run test:api
npm run test:ai
python -m compileall backend services\ai\app
```

## Data policy

Do not invent match facts. If a provider does not return xG, possession,
lineups, cards, substitutions, injuries, or player events, return a missing
value and let the UI show that the source is not connected.

Do not commit real API keys, customer data, betting account data, generated
logs, virtual environments, `node_modules`, or local build caches.
