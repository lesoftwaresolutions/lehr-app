-- ============================================================================
-- LEHR FINAL PRODUCTION DATABASE SETUP & SECURITY
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

-- Update time_logs action constraint to support the new action names
ALTER TABLE time_logs DROP CONSTRAINT IF EXISTS time_logs_action_check;
ALTER TABLE time_logs ADD CONSTRAINT time_logs_action_check
  CHECK (action IN ('login', 'logout', 'break-out', 'break-in', 'clock_in', 'clock_out', 'break_in', 'break_out'));

-- 2. CLEANUP: Remove all old policies to start from a fresh slate
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

-- 3. ENABLE RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 4. COMPANIES TABLE POLICIES
CREATE POLICY "Kiosk Company Read"
ON companies FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Owner Manage Company"
ON companies FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- 5. EMPLOYEES TABLE POLICIES
CREATE POLICY "Admin Manage Employees"
ON employees FOR ALL
TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

CREATE POLICY "Kiosk PIN lookup"
ON employees FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- 6. SHIFTS TABLE POLICIES
CREATE POLICY "Admin Manage Shifts"
ON shifts FOR ALL
TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- 7. TIME LOGS TABLE POLICIES
CREATE POLICY "Admin Manage Time Logs"
ON time_logs FOR ALL
TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- Kiosk inserts: Validate that the employee belongs to the company
CREATE POLICY "Kiosk insert"
ON time_logs FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees
    WHERE employees.id = employee_id
    AND employees.company_id = time_logs.company_id
    AND employees.status = 'active'
  )
);

-- Kiosk select: ONLY today's logs for the same company (privacy)
CREATE POLICY "Kiosk select"
ON time_logs FOR SELECT
TO anon, authenticated
USING (timestamp >= (now() AT TIME ZONE 'UTC')::date::timestamptz);

-- 8. LEAVE REQUESTS TABLE POLICIES
CREATE POLICY "Admin Manage Leave Requests"
ON leave_requests FOR ALL
TO authenticated
USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))
WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));

-- 9. ENABLE REALTIME
-- This depends on Supabase project settings, but adding to publication via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE time_logs;
