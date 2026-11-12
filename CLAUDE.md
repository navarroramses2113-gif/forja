# Forja web app: notes for Claude

Read README.md first. It covers the layout, how the app runs, and how to
run it locally. This file adds how we work.

**This repo is public.** Never commit secrets, keys, personal details or
local machine paths here.

## Two machines, one repo

This project is worked on from two computers: a Mac mini (main) and a
Windows laptop (backup). Claude may be running on either one.

- **Always `git pull` before starting work.** The other machine may have
  pushed changes.
- **Commit and push when a piece of work is done**, so the other machine
  can pick it up. Don't leave work only on one machine.
- If both machines need to work at the same time, use separate branches
  or separate files, and say so before starting.
- Claude's memory does not sync between machines. Anything both machines
  should know goes in this file.

## Related repo

The Android app (Capacitor) is a separate private repo, `forja-app`.
It copies files from this repo into its `www/` folder at build time, so
this repo stays the single source of truth for the app's code. When you
add, rename or move a file the app loads, the list in `forja-app`'s
`scripts/copy-web.js` needs the same change.

## Conventions

- Plain HTML, CSS and JavaScript. No frameworks, no bundler, no build step.
- New features go in their own file in `js/`; don't keep growing `js/script.js`.
- Game rules and rep counting live in `shared/` and are used by both the
  phone and the Supabase Edge Functions. Change them in one place.
- Keep the English and Spanish (`i18n/`) text in step.
