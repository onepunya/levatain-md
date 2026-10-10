# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.
Report privately through GitHub: **Security → Report a vulnerability** on this repository.
Include what you found, how to reproduce it, and the impact. We aim to reply within a few days.

## Keep your own bot safe

- Never commit `.env`, the `session/` folder or `database/`. Anyone with `session/` can control your WhatsApp account.
- If an API key or cookie leaks, revoke it and create a new one.
- Do not expose the dashboard port to the internet without a firewall or reverse proxy with authentication.
