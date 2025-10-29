Serverless remove-telecaller function (Vercel)

What this does
- Verifies the manager's credentials by calling Supabase Auth token endpoint (grant_type=password) using the project's anon key.
- Ensures the token belongs to the managerId provided.
- Verifies the manager actually manages the telecaller (profiles.manager_id match).
- Uses the Supabase service_role key to delete the Auth user and remove the profile row.

Environment variables (set in Vercel dashboard)
- SUPABASE_URL = https://your-project.supabase.co
- SUPABASE_ANON_KEY = <anon public key>
- SUPABASE_SERVICE_ROLE_KEY = <service_role key - keep private>

Deploy
1. Create a new Vercel project and add this folder as the repo (or just the function file under `api/remove-telecaller.js`).
2. Set environment variables in the Vercel project settings.
3. Deploy. The function will be available at https://<your-vercel-domain>/api/remove-telecaller

Client usage
- POST JSON with { managerId, managerEmail, managerPassword, telecallerId } to the endpoint.
- Example request (already implemented in client `TeamManagement.js`):
  fetch(SERVERLESS_REMOVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ managerId, managerEmail, managerPassword, telecallerId }) })

Security notes
- The service_role key must never be shipped to clients. Keep it only in Vercel env.
- We validate the manager credentials server-side (so password is not sent to Supabase from client directly, but over HTTPS to this function). Ensure TLS is used (Vercel/HTTPS).
- Consider rate-limiting the endpoint and logging removal actions for audit.
