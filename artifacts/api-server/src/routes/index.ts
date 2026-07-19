import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import healthRouter from "./health.js";

const router: IRouter = Router();

// ─── Supabase admin client ────────────────────────────────────────────────────
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel environment
// variables for the lehr-app-api-server project.
// Do NOT use VITE_SUPABASE_URL — the VITE_ prefix is a Vite browser-only
// build-time convention and is never available in Node.js.
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
  throw new Error(
    "[lehr-api] Missing or invalid SUPABASE_URL environment variable. " +
    "Set it in Vercel → lehr-app-api-server → Settings → Environment Variables."
  );
}

if (!supabaseServiceKey || supabaseServiceKey.length < 100) {
  throw new Error(
    "[lehr-api] Missing or invalid SUPABASE_SERVICE_ROLE_KEY environment variable. " +
    "Set it in Vercel → lehr-app-api-server → Settings → Environment Variables."
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Health check ─────────────────────────────────────────────────────────────
router.use(healthRouter);

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  // Attach user to request for downstream handlers
  (req as any).user = user;
  next();
  return;
}

// ─── POST /api/create-employee ────────────────────────────────────────────────
router.post("/create-employee", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const { full_name, email, pin_code, role, company_id } = req.body as {
      full_name?: string;
      email?: string;
      pin_code?: string;
      role?: string;
      company_id?: string;
    };

    // 1. Input validation
    const missing = (["full_name", "email", "pin_code", "company_id"] as const)
      .filter(k => !req.body[k]?.toString().trim());

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    if (!/^\d{4}$/.test(pin_code!)) {
      return res.status(400).json({ error: "PIN must be exactly 4 digits." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    // 2. Verify the requester owns this company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("id", company_id!)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return res.status(403).json({ error: "You do not have permission to add staff to this company." });
    }

    // 3. Check for duplicate PIN within the company
    const { data: pinConflict } = await supabaseAdmin
      .from("employees")
      .select("id, full_name")
      .eq("company_id", company_id!)
      .eq("pin_code", pin_code!)
      .single();

    if (pinConflict) {
      return res.status(409).json({
        error: `PIN ${pin_code} is already in use by ${pinConflict.full_name}. Please choose a different PIN.`,
      });
    }

    // 4. Create Supabase Auth account for the employee
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email!,
      password: generateTempPassword(),
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      // Surface meaningful errors (e.g. email already registered)
      if (authError.message.includes("already been registered")) {
        return res.status(409).json({ error: `An account with email ${email} already exists.` });
      }
      return res.status(400).json({ error: authError.message });
    }

    // 5. Create the employee record linked to the Auth user
    const { error: empError } = await supabaseAdmin.from("employees").insert([{
      full_name: full_name!.trim(),
      email: email!.trim().toLowerCase(),
      pin_code: pin_code!,
      role: role ?? "staff",
      company_id: company_id!,
      user_id: authUser.user.id,
      status: "active",
    }]);

    if (empError) {
      // Rollback: remove the Auth user if the DB record failed
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);

      if (empError.code === "23505") {
        return res.status(409).json({ error: `PIN ${pin_code} is already in use. Please choose a different PIN.` });
      }

      return res.status(400).json({ error: empError.message });
    }

    return res.status(201).json({
      message: `${full_name} has been added successfully.`,
      userId: authUser.user.id,
    });

  } catch (err: any) {
    console.error("[lehr-api] Unexpected error in /create-employee:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateTempPassword(): string {
  // Generates a random 20-char password. The employee uses PIN at kiosk,
  // not this password. They can reset via forgot-password if they need login access.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default router;
