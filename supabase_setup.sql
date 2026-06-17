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
-- 2. SECURE HELPER FUNCTIONS & RPCs
-- Helper to check if a user is the OWNER of a company.
CREATE OR REPLACE FUNCTION is_company_owner(p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- Helper to check if a user is an EMPLOYEE of a company.
CREATE OR REPLACE FUNCTION is_company_employee(p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employees WHERE company_id = p_company_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- Helper to check if a user has access to a company (either as owner or employee).
CREATE OR REPLACE FUNCTION check_company_access(p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  RETURN is_company_owner(p_company_id) OR is_company_employee(p_company_id);
END;
$$ LANGUAGE plpgsql;

-- Helper to validate employee status for Kiosk clock-in without exposing employee table directly
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

-- Secure RPC to fetch kiosk data without public RLS SELECT policies on companies/employees
CREATE OR REPLACE FUNCTION get_kiosk_data(p_company_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company JSON;
  v_logs JSON;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- 1. Get company info
  SELECT json_build_object(
    'id', id,
    'name', name,
    'break_allowance_minutes', break_allowance_minutes
  ) INTO v_company
  FROM companies
  WHERE id = p_company_id;

  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Get today's logs for this company (includes employee names)
  SELECT json_agg(t) INTO v_logs
  FROM (
    SELECT
      tl.employee_id,
      tl.action,
      tl.timestamp,
      json_build_object('full_name', e.full_name) as employees
    FROM time_logs tl
    JOIN employees e ON tl.employee_id = e.id
    WHERE tl.company_id = p_company_id
    AND tl.timestamp >= v_today::timestamptz
    ORDER BY tl.timestamp ASC
  ) t;

  RETURN json_build_object(
    'company', v_company,
    'logs', COALESCE(v_logs, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql;

-- Grant access to the RPC and helper functions
GRANT EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_kiosk_entry(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_kiosk_data(UUID) TO anon, authenticated;

-- Enforce owner_id on insertion via Trigger
CREATE OR REPLACE FUNCTION public.handle_company_insertion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.owner_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_company_created ON companies;
CREATE TRIGGER on_company_created
  BEFORE INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_company_insertion();

-- 3. CLEANUP: Remove all old policies to ensure no leakage
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

-- 4. ENABLE RLS (Crucial for multi-tenancy)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 5. COMPANIES TABLE POLICIES
-- KFC owner should ONLY see KFC, Costa owner should ONLY see Costa.
CREATE POLICY "Users see their owned companies"
ON companies FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Employees see their employer company"
ON companies FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM employees
  WHERE employees.company_id = companies.id
  AND employees.user_id = auth.uid()
));

CREATE POLICY "Owners manage their companies"
ON companies FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Allow company creation"
ON companies FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 6. EMPLOYEES TABLE POLICIES
-- Strictly isolated by company_id. Users can only see/manage staff if they have company access.
CREATE POLICY "Isolated Employee Access"
ON employees FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- No anonymous select on employees (Kiosk uses RPCs)

-- 7. SHIFTS TABLE POLICIES
CREATE POLICY "Isolated Shift Access"
ON shifts FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- 8. TIME LOGS TABLE POLICIES
CREATE POLICY "Isolated Time Log Access"
ON time_logs FOR ALL
TO authenticated
USING (check_company_access(company_id))
WITH CHECK (check_company_access(company_id));

-- Kiosk inserts: Validate that the employee belongs to the company.
-- Role restricted to 'anon' for security.
CREATE POLICY "Kiosk Secure Insert"
ON time_logs FOR INSERT
TO anon
WITH CHECK (validate_kiosk_entry(employee_id, company_id));

-- 9. LEAVE REQUESTS TABLE POLICIES
CREATE POLICY "Isolated Leave Access"
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
