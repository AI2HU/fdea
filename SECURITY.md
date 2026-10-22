# Security Policy

## Supported versions

Security fixes are provided for the latest published version of FDEA. Upgrade before reporting a problem that may already be resolved.

## Reporting a vulnerability

Do not disclose vulnerabilities, proof-of-concept exploits, credentials or private documents in a public issue.

Use **Report a vulnerability** in the repository's **Security** tab to report privately. Include the FDEA version, operating system, impact and reproduction steps. Remove credentials and private documents from logs and examples.

## Security boundary

- FDEA runs locally. It stores projects and ingested documents under `~/.fdea` (or `FDEA_HOME`) and sends nothing to a service of its own.
- Ingesting a URL fetches that URL and its stylesheets from your machine, with a timeout and a size limit. Do not ingest URLs you do not want contacted.
- Generation runs `npm`, `node ace` and `npx` in the output directory, and downloads the AdonisJS starter kit and packages from the network.
- `fdea setup` only adds or updates its own entry in agent configuration files, backs them up first and asks before writing.
- Generated applications close sign-up and hash passwords with the AdonisJS hasher. Review the generated code and set a secret `APP_KEY` before deploying.
