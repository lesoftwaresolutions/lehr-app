import { Router, type IRouter, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import healthRouter from "./health";

const router: IRouter = Router();

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel environment variables.
// NOTE: Do NOT use VITE_SUPABASE_URL here — the VITE_ prefix is a Vite build-time
// convention injected into the browser bundle only. It is NOT available in Node.js.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  // Fail hard at startup so misconfiguration is immediately obvious in Vercel logs
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. " +
    "Set them in the Vercel project settings for the API server."
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Health check route
router.use(healthRouter);

// 🚀 ROUTE: Create Employee + Auth Account (SECURED)
router.post("/create-employee", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");

    // 1. Verify the requester's token
    const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);

    if (verifyError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { full_name, email, pin_code, role, company_id } = req.body;

    if (!email || !full_name || !pin_code || !company_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 2. Verify the requester owns the company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return res.status(403).json({ error: "Unauthorized: You do not own this company" });
    }

    // 3. Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'TemporaryPassword123!', // Temporary password
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 4. Create the employee record linked to the new Auth User
    const { error: empError } = await supabaseAdmin
      .from('employees')
      .insert([{ 
        full_name, 
        email, 
        pin_code, 
        role, 
        company_id, 
        user_id: authUser.user.id,
        status: 'active'
      }]);

    if (empError) {
      // Cleanup: delete the auth user if the DB record fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({ error: empError.message });
    }

    return res.status(200).json({ 
      message: 'Employee created successfully!', 
      userId: authUser.user.id 
    });

  } catch (err: any) {
    console.error("Error in /create-employee:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

export default router;
