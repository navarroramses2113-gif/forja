# Forja

A daily accountability app: a few minutes of bodyweight work at home,
camera-verified reps, a streak, and friends. Live at
https://getforja.app/

Push-ups, planks and squats are required; walk/run is optional and
GPS-tracked. Competing days have floors (5 / 20s / 10) and two forgiven
rest days per Monday–Sunday week.

## Layout

```
index.html          the app (PWA start_url)
landing.html        getforja.app/  (waitlist + pitch)
install.html        getforja.app/install
privacy.html        privacy policy
growth.html         private admin counts
css/                app and landing styles
js/                 the app (script.js is the boot file)
i18n/               English→Spanish dictionaries
shared/             streak math + rep counter (phone and server)
icons/  brand/      PWA icons and logo
supabase/functions  Edge Functions (one folder per job)
supabase/sql/archive  SQL already applied on the live database
supabase/migrations   new schema, after a `supabase db pull` baseline
```

`js/script.js` is still the large file for Today, Feed, Record, Me and
auth. Later features already live next to it (`camera-verify.js`,
`onboarding.js`, `challenges.js`, `celebrations.js`). Split more of
`script.js` the same way; don't add a bundler.

Spanish dictionaries stay in three files on purpose: `/install` and the
front page should not download the whole app's translations.

## How it runs

Plain HTML, CSS and JavaScript — no frameworks, no build step. Guest
progress is stored in the browser (`localStorage`). Signed-in progress
is stored in Supabase (Postgres + Auth) with Row Level Security.

The phone never uploads video. It sends a joint-movement trace;
`submit-set` recounts it with `shared/exercise-counter.js`. Streaks,
plans and Feed posts are only written by Edge Functions, using
`shared/game-rules.js`.

Hosted on Netlify. `_redirects` sends `/` to the landing page, `/install`
to the Home Screen guide, and hides `supabase/`.

## Running locally

Any local web server works. For example:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser. The service worker
(offline support) only activates on `http://localhost` or `https` —
opening `index.html` as a file will skip it.

## License

All rights reserved. This code is publicly viewable but not licensed for
reuse, modification, or redistribution.
