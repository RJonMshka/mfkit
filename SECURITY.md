# Security Policy

## Supported versions

MFKit is pre-1.0. Only the latest published `alpha` of each `@mfkit/*` package
receives fixes.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/RJonMshka/mfkit/security/advisories/new).

Include affected package(s) and versions, a description of the impact, and a
reproduction if you have one. You can expect an acknowledgement within 5
working days and a status update at least weekly until resolution. We'll
credit you in the advisory unless you ask us not to.

## Scope notes

MFKit generates build configuration and loads remote code at runtime by
design. Reports are most useful when they show MFKit doing something a
consumer didn't configure, such as:

- generated config that loads a remote from an origin the manifest didn't declare
- kit-generated code (e.g. the CSS injection snippet) that can be made to
  execute attacker-controlled input
- the `mfkit-migrate` CLI writing outside the project directory

Loading a remote you deliberately pointed the manifest at is not a
vulnerability in MFKit. Remote integrity (SRI, CSP, signed manifests) is
tracked as a roadmap item in `docs/project-review-2026-10.md`.
