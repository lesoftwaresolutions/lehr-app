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

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

  // Require a valid Supabase session — this endpoint uses the service role
  // key and must never be reachable by an unauthenticated caller.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

  const { data: { user: requester }, error: sessionError } =
    await supabaseAdmin.auth.getUser(authHeader.slice(7));

  if (sessionError || !requester) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  try {
    const { full_name, email, pin_code, role, company_id } = req.body ?? {};

    if (!email || !full_name || !pin_code || !company_id) {
      return res
        .status(400)
        .json({ error: "Missing required fields: email, full_name, pin_code, or company_id" });
    }

    if (!/^\d{4}$/.test(pin_code)) {
      return res.status(400).json({ error: "PIN must be exactly 4 digits." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    // Verify the requester owns this company before letting them add staff to it.
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .eq("owner_id", requester.id)
      .single();

    if (companyError || !company) {
      return res.status(403).json({ error: "You do not have permission to add staff to this company." });
    }

    // Check for duplicate PIN within the company.
    const { data: pinConflict } = await supabaseAdmin
      .from("employees")
      .select("id, full_name")
      .eq("company_id", company_id)
      .eq("pin_code", pin_code)
      .single();

    if (pinConflict) {
      return res.status(409).json({
        error: `PIN ${pin_code} is already in use by ${pinConflict.full_name}. Please choose a different PIN.`,
      });
    }

    // Step A: Create the user in Supabase Auth.
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: generateTempPassword(),
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
        role: role ?? "staff",
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
