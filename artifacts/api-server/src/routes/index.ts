import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import healthRouter from "./health";

const router: IRouter = Router();

// 1. Setup Admin Client for User Creation
// These environment variables MUST be set in Vercel
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Health check route
router.use(healthRouter);

// 🚀 ROUTE: Create Employee + Auth Account
router.post("/create-employee", async (req, res) => {
  try {
    const { full_name, email, pin_code, role, company_id } = req.body;

    if (!email || !full_name || !pin_code) {
      return res.status(400).json({ error: "Missing required fields: email, full_name, or pin_code" });
    }

    // Step A: Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'TemporaryPassword123!', // Temporary password
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (authError) throw authError;

    // Step B: Create the employee record linked to the new Auth User
    const { error: empError } = await supabaseAdmin
      .from('employees')
      .insert([{ 
        full_name, 
        email, 
        pin_code, 
        role, 
        company_id, 
        user_id: authUser.user.id 
      }]);

    if (empError) throw empError;

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
