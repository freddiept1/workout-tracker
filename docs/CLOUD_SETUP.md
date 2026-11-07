# Cloud setup (Supabase)

One-time setup, about 10 minutes. You only do this once. Clients never see any of it.

## 1. Create the project
1. Go to **supabase.com** and click **Start your project**. Sign in with **GitHub** (the account you already have).
2. Click **New project**:
   - **Name:** `fb-training`
   - **Database password:** click **Generate a password** and save it in your password manager. The app never needs it, but keep it.
   - **Region:** **West EU (London)** (keeps clients' data in the UK).
   - **Plan:** Free.
3. Click **Create new project** and wait a couple of minutes until it's ready.

## 2. Create the tables
1. In the left menu, open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this project, copy all of it, and paste it in.
3. Click **Run**. You should see "Success. No rows returned".

## 3. Make the sign-in email send a code
The app signs in with a code typed into the app (not a link), because links open in Safari instead of the installed app.
1. Open **Authentication** → **Emails** (it may be called **Email Templates**).
2. Open the **Magic Link** template and replace the message body with:
   ```html
   <h2>Your Freddie Butler Training code</h2>
   <p>Type this code into the app to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>It expires in one hour. If you didn't ask for it, ignore this email.</p>
   ```
   You can change the subject too, e.g. "Your sign-in code". Click **Save**.
3. Do the same for the **Confirm signup** template, since the first sign-in for a new email uses that one.
4. Under **Authentication** → **Sign In / Providers**, check that **Email** is enabled (it is by default).

## 4. Copy the two keys
1. Open **Project Settings** (cog icon) → **API Keys**. On some projects it's **Data API**.
2. Copy:
   - the **Project URL** (looks like `https://abcdefgh.supabase.co`; it's on the **Data API** page or the project's home page), and
   - the **Publishable key** (starts `sb_publishable_`), or on older projects the **anon public** key.
3. Paste both to Claude. They're safe to share and ship in the app. **Never** share the **secret** or **service_role** key.

## Later
- **Make your account the coach** (after your first sign-in), in SQL Editor:
  ```sql
  update public.profiles set role = 'coach'
  where id = (select id from auth.users where email = 'YOUR EMAIL');
  ```
- **Email limits:** Supabase's built-in email sends only a few codes per hour. That's fine for you alone. Before inviting clients, connect a free email service (Resend), which takes about 10 minutes.
- **Free plan pause:** a free project pauses after a week with no use. The app keeps working offline, and syncing resumes once you click **Restore** in Supabase.
