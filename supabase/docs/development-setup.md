# Type News Supabase Development Setup

This project is a new Vercel + Supabase Type News project. It does not need to
sync live with the Firebase-hosted `typenews.kr` service.

## What Stays Untouched

- Do not run `firebase deploy` from this project unless explicitly requested.
- Do not change the production Firebase Hosting project.
- Do not move the `typenews.kr` domain until final cutover.
- Do not commit Firebase service account JSON, Firebase Auth export JSON, backup JSONL, or Supabase secret keys.

## Supabase Values

Use only the values needed for each task.

### Frontend Runtime

Store these in `frontend/.env.local`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

These are public browser values. They are safe to use in Vercel environment
variables, but should still not be hard-coded into source files.

### Admin Page Lock

Also in `frontend/.env.local`, and in the Vercel project.

```env
ADMIN_PANEL_PASSWORD=
```

This gates `/admin` behind a password prompt so an admin cannot open the editing
screen by accident. It is **not** the authorization check — that is `is_admin()`
and RLS on the server. It is compared only in `/api/admin/unlock`, never in the
browser, so it must not carry a `NEXT_PUBLIC_` prefix. Without it the unlock
route answers `503` and nobody can enter.

### Local Migration Scripts

Store these in `.env.local` at the repository root or in your shell.

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is secret and admin-level. Never expose it to the
browser, never place it in `frontend/.env.local` with a `NEXT_PUBLIC_` prefix,
and never commit it.

## One-Time Supabase Dashboard Work

Service: Supabase

Menu path:

1. Open your Supabase development project.
2. Go to `SQL Editor`.
3. Open `supabase/migrations/0001_initial_type_news_schema.sql`.
4. Paste and run the full SQL.

This creates:

- `profiles`
- `monthly_stats`
- `typing_results`
- `suspicious_records`
- RLS policies
- `link_current_google_identity()`
- `record_typing_result(...)`
- `get_monthly_ranking(...)`

## Google OAuth

Service: Supabase

Menu path:

1. `Authentication`
2. `Providers`
3. `Google`

Set Google OAuth using the development project's callback URL shown by Supabase.
The Google Client Secret is secret. Do not paste it into chat. Configure it only
in the Supabase dashboard.

Service: Google Cloud Console

Menu path:

1. `APIs & Services`
2. `Credentials`
3. OAuth client for this development project
4. `Authorized redirect URIs`

Add the callback URI supplied by Supabase.

After this is complete, only tell Codex: "Google OAuth is configured." Do not
send the Client Secret.

## Backup Data Shape

The migration script expects local JSONL backups created by:

```powershell
python scripts\backup_firestore.py --service-account C:\secure\firebase-service-account.json --output-dir backups\firebase-dev
```

The script reads:

- `backups/firebase-dev/firestore/users-*.jsonl`
- `backups/firebase-dev/firestore/suspiciousRecords-*.jsonl`, if present

Firebase Auth export JSON is optional but recommended because it can preserve
historical Google `sub` values for account linking.

## Migration Dry Run

Install Python dependencies:

```powershell
python -m pip install -r scripts\requirements.txt
```

Dry-run without writing:

```powershell
python scripts\migrate_to_supabase.py `
  --firestore-dir backups\firebase-dev\firestore `
  --auth-export C:\secure\firebase-auth-export.json `
  --report migration-report-dry-run.json
```

If there is no Auth export yet, omit `--auth-export`.

## Apply Migration

Only after the dry-run counts look correct:

```powershell
python scripts\migrate_to_supabase.py `
  --firestore-dir backups\firebase-dev\firestore `
  --auth-export C:\secure\firebase-auth-export.json `
  --apply `
  --report migration-report-apply.json
```

The script uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from local env.

## Local Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel Environment Variables

Service: Vercel

Menu path:

1. Project
2. `Settings`
3. `Environment Variables`

Set only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ADMIN_PANEL_PASSWORD` (server-only, no `NEXT_PUBLIC_` prefix)

Do not set `SUPABASE_SERVICE_ROLE_KEY` on the frontend project unless a future
server-only API route explicitly requires it.
