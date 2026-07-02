import { createClient } from "@supabase/supabase-js";

// Vercel serverless function served from THIS project at /api/create-employee.
// Functions take precedence over rewrites, so this eliminates the previous
// self-referential /api rewrite that caused a 508 INFINITE_LOOP_DETECTED.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL                – https://drhseqszhnnbeifvpfmx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   – service_role key (server-only, never exposed to client)

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error:
        "Server misconfigured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel.",
    });
  }

  try {
    const { full_name, email, pin_code, role, company_id } = req.body ?? {};

    if (!email || !full_name || !pin_code) {
      return res
        .status(400)
        .json({ error: "Missing required fields: email, full_name, or pin_code" });
    }

    // Step A: Create the user in Supabase Auth.
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: "TemporaryPassword123!",
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (authError) throw authError;

    // Step B: Create the employee record linked to the new Auth user.
    const { error: empError } = await supabaseAdmin.from("employees").insert([
      {
        full_name,
        email,
        pin_code,
        role,
        company_id,
        user_id: authUser.user.id,
      },
    ]);

    if (empError) {
      // Roll back the auth user so a failed insert doesn't leave an orphan.
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      throw empError;
    }

    return res.status(200).json({
      message: "Employee created successfully!",
      userId: authUser.user.id,
    });
  } catch (err: any) {
    console.error("Error in /api/create-employee:", err);
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}
