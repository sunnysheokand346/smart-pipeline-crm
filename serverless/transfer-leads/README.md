Serverless transfer-leads function (Vercel)

What this does
- Verifies the manager's credentials by calling Supabase Auth token endpoint (grant_type=password) using the project's anon key.
- Ensures the token belongs to the provided managerId.
- Verifies the manager actually manages the telecaller via the profiles table.
- Uses the Supabase service_role key to update `leads` rows where `telecaller_id = telecallerId` and set `telecaller_id = NULL` (transfer to lead pool).

Environment variables (set in Vercel dashboard)
- SUPABASE_URL = https://your-project.supabase.co
- SUPABASE_ANON_KEY = <anon public key>
- SUPABASE_SERVICE_ROLE_KEY = <service_role key - keep private>

Deploy
1. Create a new Vercel project and add this folder as the repo (or just the function file under `api/transfer-leads.js`).
2. Set environment variables in the Vercel project settings.
3. Deploy. The function will be available at https://<your-vercel-domain>/api/transfer-leads

Client usage
- POST JSON with { managerId, managerEmail, managerPassword, telecallerId } to the endpoint.
- The client `TeamManagement.js` currently uses this endpoint (set SERVERLESS_TRANSFER_URL accordingly).

Notes
- We set `telecaller_id = NULL` to move leads back to an unassigned pool. If you have a specific leadpool user id, replace the update to set `telecaller_id = <leadpool_user_id>` instead.
- Keep service_role key private.
- Consider inserting an audit record for the transfer (who, when, count).
