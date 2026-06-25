import { createClient } from "@supabase/supabase-js";
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: "Missing Supabase configuration" });
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: "Missing Authorization header" });
        }
        const token = authHeader.replace("Bearer ", "");
        // Use admin.getUser to verify the manager's token
        const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
        if (verifyError || !user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        const { full_name, email, pin_code, role, company_id } = req.body;
        if (!email || !full_name || !pin_code || !company_id) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        // Verify company ownership
        const { data: company, error: companyError } = await supabaseAdmin
            .from("companies")
            .select("id")
            .eq("id", company_id)
            .eq("owner_id", user.id)
            .single();
        if (companyError || !company) {
            return res.status(403).json({ error: "Unauthorized: You do not own this company" });
        }
        // Create auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: 'TemporaryPassword123!',
            email_confirm: true,
            user_metadata: { full_name }
        });
        if (authError) {
            return res.status(400).json({ error: authError.message });
        }
        // Create employee record
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
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            return res.status(400).json({ error: empError.message });
        }
        return res.status(200).json({
            message: 'Employee created successfully!',
            userId: authUser.user.id
        });
    }
    catch (err) {
        console.error("Error in /create-employee:", err);
        return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
}
