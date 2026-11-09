# shade/ — Stage 4 adapter sketch

**SCAFFOLD — NOT DEPLOYED, NOT REGISTERED, NOT WIRED.**

This directory is the Stage 4 feasibility spike's adapter sketch (see
`docs/SHADE.md` for the full design and verdict). It maps the existing
worker's entry points (`worker/src/index.ts`) onto the shape the
Shade Agent Framework template expects, as code-shaped documentation
for the real Stage 4 build.

What it is:

- `src/index.ts` — the Shade bootstrap sequence (ShadeClient.create →
  fund check → register loop → re-register timer), a minimal Hono
  surface, and the exact handoff point where the existing
  `BoundenWorker` poll loop starts. The Shade-mode leash verification
  is an explicit stub that **throws** — it must never silently pass.
- `deployment.yaml.sketch` — the template's `deployment.yaml` with
  Bounden's values annotated. Not a live config: the Shade CLI is not
  installed here and Docker is unavailable on the build VM
  (`docker: command not found`, verified in the spike), so nothing in
  this directory has been run through the CLI.

What it is not:

- Not part of the worker package. Not built, not typechecked against
  the real `@neardefi/shade-agent-js` (the published registry version
  must be resolved at real build time — see docs/SHADE.md §3), not
  imported by anything.
- Not a fallback worker. The shipped cashier is `worker/`, unchanged.

When Stage 4 is built for real (on a Docker-capable host), this
sketch is the starting diff, and `docs/SHADE.md` §5 lists the
preconditions and the hour budget.
