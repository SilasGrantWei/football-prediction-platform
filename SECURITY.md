# Security Policy

## Supported versions

Security fixes are accepted for the current `main` branch.

## Reporting a vulnerability

Open a private security advisory on GitHub after the repository is published,
or contact the maintainer through the email listed in the GitHub profile.

Please include:

- affected component
- reproduction steps
- expected and actual behavior
- any logs with secrets removed

Do not include live API keys, betting credentials, customer data, or private
provider payloads in public issues.

## Secret handling

Runtime secrets belong in `.env` or deployment-specific secret stores. The
public repository should include only `.env.example` with blank optional keys.

## Audit notes

See `docs/SECURITY_AUDIT.md` for the latest dependency-audit notes that were
known when the repository package was prepared.
