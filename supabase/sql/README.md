# Database changes

`archive/` is the SQL already run on the live database (by date, in the
SQL editor). Do not run those files again.

New schema goes in `../migrations/` as `YYYYMMDDHHMMSS_description.sql`
so `supabase db push` can apply it in order.

If migrations are empty, capture the current schema first:

```
supabase db pull
```

That writes a baseline migration matching production, and later files
only describe what changed after that.
