# IT Application Tracker

A Next.js tracker for IT application delivery, project management, test case management, and Supabase login.

## Stack

- Next.js App Router
- Supabase Auth and database-ready schema
- Vercel deployment-ready
- GitHub-ready repository structure

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd run dev` if script execution policy blocks `npm`.

You can also double-click `start-preview.cmd`, wait until the terminal says `Ready`, then open `http://localhost:3001/dashboard`.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` in the project root.
4. Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-sb-publishable-key
```

`supabase/.env.local` is not loaded by the Next.js app. After changing `.env.local`, restart the dev server so the browser bundle receives the new values.

The login page uses Supabase Auth with email and password.

To show each user's profile details, add these values to the Supabase Auth user's metadata:

```json
{
  "full_name": "Jessica Maica Libre",
  "position": "Project Coordinator",
  "avatar_url": "https://example.com/profile.jpg"
}
```

Temporary demo credential:

```text
Email: admin@tracker.local
Password: Admin123!
```

## GitHub

```bash
git init
git add .
git commit -m "Initial IT application tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/it-application-tracker.git
git push -u origin main
```

## Vercel

1. Import the GitHub repository in Vercel.
2. Add the two Supabase environment variables.
3. Deploy the project.

## Entities

- Dashboard
- Project Maintenance
- Test Case Management
- Log in
