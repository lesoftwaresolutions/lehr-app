-- ============================================================================
-- LEHR FIXES — Run this in Supabase SQL Editor
-- ============================================================================

-- FIX 1: PIN uniqueness per company
-- Prevents two staff members from sharing the same PIN, which would cause
-- verify_employee_pin to return the wrong person.
ALTER TABLE employees
  ADD CONSTRAINT employees_company_pin_unique
  UNIQUE (company_id, pin_code);

-- FIX 2: Timezone-aware kiosk data fetch
-- The original function used UTC midnight which caused the kiosk board to show
-- nobody working between 00:00–01:00 UK time (midnight UTC lag).
-- Now uses Europe/London so "today" matches what staff actually see on the clock.
CREATE OR REPLACE FUNCTION get_kiosk_data(p_company_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company JSON;
  v_logs JSON;
  -- Use London timezone so midnight is correct for UK-based kiosks.
  -- Change 'Europe/London' to your local timezone if operating elsewhere.
  v_today DATE := (now() AT TIME ZONE 'Europe/London')::date;
  v_today_start TIMESTAMPTZ := v_today::timestamptz AT TIME ZONE 'Europe/London';
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

  -- 2. Get today's logs for this company (timezone-safe window)
  SELECT json_agg(t ORDER BY t.timestamp ASC) INTO v_logs
  FROM (
    SELECT
      tl.employee_id,
      tl.action,
      tl.timestamp,
      json_build_object('full_name', e.full_name, 'company_id', e.company_id) as employees
    FROM time_logs tl
    JOIN employees e ON tl.employee_id = e.id
    WHERE tl.company_id = p_company_id
      AND tl.timestamp >= v_today_start
  ) t;

  RETURN json_build_object(
    'company', v_company,
    'logs', COALESCE(v_logs, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql;

-- Re-grant access after recreating the function
GRANT EXECUTE ON FUNCTION get_kiosk_data(UUID) TO anon, authenticated;
