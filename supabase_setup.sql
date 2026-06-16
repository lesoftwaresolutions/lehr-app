-- ============================================================================
-- LEHR FINAL PRODUCTION DATABASE SETUP & SECURITY (REFINED)
-- ============================================================================

-- 1. SCHEMA UPDATES
-- Ensure companies table uses owner_id and has required columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS break_allowance_minutes INTEGER DEFAULT 30;

-- Ensure employees table has user_id for Auth linking
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Ensure shifts, leave_requests, and time_logs have company_id for better RLS
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- DATA MIGRATION: Populate company_id for existing records
UPDATE shifts s SET company_id = e.company_id FROM employees e WHERE s.employee_id = e.id AND s.company_id IS NULL;
UPDATE leave_requests lr SET company_id = e.company_id FROM employees e WHERE lr.employee_id = e.id AND lr.company_id IS NULL;
UPDATE time_logs tl SET company_id = e.company_id FROM employees e WHERE tl.employee_id = e.id AND tl.company_id IS NULL;

-- DATA MIGRATION: Standardize legacy action names
UPDATE time_logs SET action = 'clock_in' WHERE action IN ('login', 'clock_in');
UPDATE time_logs SET action = 'clock_out' WHERE action IN ('logout', 'clock_out');
UPDATE time_logs SET action = 'break_start' WHERE action IN ('break-out', 'break_in', 'break_start') AND action != 'break_end'; -- Careful with swap
-- Actually, let's be more precise to avoid confusion during migration
UPDATE time_logs SET action = 'break_start' WHERE action = 'break-out';
UPDATE time_logs SET action = 'break_end' WHERE action = 'break-in';

-- Update time_logs action constraint to support standardized names
-- Standard: clock_in, clock_out, break_start, break_end
ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_action_check;
ALTER TABLE time_logs ADD CONSTRAINT time_logs_action_check
  CHECK (action IN ('clock_in', 'clock_out', 'break_start', 'break_end', 'login', 'logout', 'break-in', 'break-out'));
  -- We keep legacy in check for a bit or just migrate them all above.
  -- Better to migrate all and have a clean constraint.

UPDATE time_logs SET action = 'clock_in' WHERE action = 'login';
UPDATE time_logs SET action = 'clock_out' WHERE action = 'logout';
UPDATE time_logs SET action = 'break_start' WHERE action = 'break-out';
UPDATE time_logs SET action = 'break_end' WHERE action = 'break-in';

ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_action_check;
ALTER TABLE time_logs ADD CONSTRAINT time_logs_action_check
  CHECK (action IN ('clock_in', 'clock_out', 'break_start', 'break_end'));

-- 2. SECURE PIN VERIFICATION RPC
-- 2. SECURE HELPER FUNCTIONS
-- Helper to check if a user is an owner or employee of a company
-- SECURITY DEFINER breaks recursion in RLS policies.
CREATE OR REPLACE FUNCTION check_company_access(p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM employees WHERE company_id = p_company_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- Helper to validate employee status for Kiosk clock-in without exposing employee table
CREATE OR REPLACE FUNCTION validate_kiosk_entry(p_employee_id UUID, p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employees
    WHERE id = p_employee_id
    AND company_id = p_company_id
    AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql;

-- This allows checking a PIN without exposing the pin_code column via SELECT policies.
CREATE OR REPLACE FUNCTION verify_employee_pin(p_company_id UUID, p_pin_code TEXT)
RETURNS TABLE (id UUID, full_name TEXT)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.full_name
  FROM employees e
  WHERE e.company_id = p_company_id
    AND e.pin_code = p_pin_code
    AND e.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant access to the RPC function
-- Grant access to the RPC and helper functions
GRANT EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_kiosk_entry(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_kiosk_entry(UUID, UUID) TO authenticated;

-- 3. CLEANUP: Remove all old policies
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('companies','employees','time_logs','shifts','leave_requests')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 4. ENABLE RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 5. COMPANIES TABLE POLICIES
-- Kiosk needs to see its own company name and settings
CREATE POLICY "Kiosk Company Read"
ON companies FOR SELECT
TO anon
USING (true);

-- Authenticated users: Owners and Employees can select
CREATE POLICY "User Select Company"
ON companies FOR SELECT
TO authenticated
USING (check_company_access(id));

CREATE POLICY "Owner Manage Company"
ON companies FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Allow anyone authenticated to insert a company (e.g. during signup)
CREATE POLICY "Enable insert for authenticated users only"
ON companies FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 6. EMPLOYEES TABLE POLICIES
-- Admins manage their own staff, Employees can see their own record
CREATE POLICY "User Manage Employees"
ON employees FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- Kiosk: NO general select for anon. PIN verification is done via RPC.
-- However, we might need a restricted select for the Kiosk to show names in "Active Now"
-- but ONLY if they have logged in today.
CREATE POLICY "Kiosk employee name lookup"
ON employees FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM time_logs tl
    WHERE tl.employee_id = employees.id
    AND tl.timestamp >= (now() AT TIME ZONE 'UTC')::date::timestamptz
  )
);

-- 7. SHIFTS TABLE POLICIES
CREATE POLICY "User Manage Shifts"
ON shifts FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- 8. TIME LOGS TABLE POLICIES
CREATE POLICY "User Manage Time Logs"
ON time_logs FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- Kiosk inserts: Validate that the employee belongs to the company
-- Uses SECURITY DEFINER function to bypass RLS SELECT restrictions on employees table
CREATE POLICY "Kiosk insert"
ON time_logs FOR INSERT
TO anon, authenticated
WITH CHECK (
  validate_kiosk_entry(employee_id, company_id)
);

-- Kiosk select: ONLY today's logs
CREATE POLICY "Kiosk select"
ON time_logs FOR SELECT
TO anon, authenticated
USING (
  timestamp >= (now() AT TIME ZONE 'UTC')::date::timestamptz
);

-- 9. LEAVE REQUESTS TABLE POLICIES
CREATE POLICY "User Manage Leave Requests"
ON leave_requests FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- 10. ENABLE REALTIME
-- Check if publication exists first, then add tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Only add tables if they aren't already part of the publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'time_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE time_logs;
  END IF;
END $$;
