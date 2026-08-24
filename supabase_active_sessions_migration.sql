-- ============================================================================
-- LEHR: Persistent "active work session" support
-- Additive migration only. Does not rename/drop any existing column, table,
-- row, or RLS policy. Safe to run against production.
-- ============================================================================

-- 1. Audit trail column for manager-forced clock-outs ("Close Shift").
--    NULL  = the clock_out row was created by the employee themselves
--            (kiosk self clock-out).
--    value = the auth.users.id of the manager/owner who manually closed
--            an abandoned session. Only ever set on `clock_out` rows.
alter table public.time_logs
  add column if not exists closed_by uuid references auth.users(id);

comment on column public.time_logs.closed_by is
  'Set only on clock_out rows created via close_employee_shift() by a manager. NULL means the employee clocked themselves out.';

-- ============================================================================
-- 2. Rewrite get_kiosk_data(): derive "who is active" from each employee's
--    own last clock_in vs last clock_out, not from a "today" date window.
--    This is the root-cause fix for active employees disappearing after
--    midnight / after a forgotten clock-out. Also drops the previous
--    hardcoded 'Europe/London' timezone assumption entirely, since the
--    windowing is no longer date-based at all.
-- ============================================================================
create or replace function public.get_kiosk_data(p_company_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company JSON;
  v_logs JSON;
begin
  select json_build_object(
    'id', id,
    'name', name,
    'break_allowance_minutes', break_allowance_minutes
  ) into v_company
  from companies
  where id = p_company_id;

  if v_company is null then
    return null;
  end if;

  -- For each employee, return only the events belonging to their CURRENT
  -- open session: everything strictly after their most recent clock_out
  -- (or their entire history if they have never clocked out). An employee
  -- whose last event is itself a clock_out contributes no rows here, so
  -- they correctly fall out of the "working"/"on break" computation.
  select json_agg(t order by t.timestamp asc) into v_logs
  from (
    select
      tl.employee_id,
      tl.action,
      tl.timestamp,
      json_build_object('full_name', e.full_name, 'company_id', e.company_id) as employees
    from time_logs tl
    join employees e on tl.employee_id = e.id
    where tl.company_id = p_company_id
      and tl.timestamp > coalesce(
        (
          select max(tl2.timestamp)
          from time_logs tl2
          where tl2.employee_id = tl.employee_id
            and tl2.action = 'clock_out'
        ),
        '-infinity'::timestamptz
      )
  ) t;

  return json_build_object(
    'company', v_company,
    'logs', coalesce(v_logs, '[]'::json)
  );
end;
$function$;

-- ============================================================================
-- 3. New: get_active_employees() for the manager dashboard. Same "current
--    open session" windowing as get_kiosk_data, but SECURITY INVOKER so it
--    runs under the caller's own RLS (only an authenticated company
--    owner/admin can see rows, via the existing "Admin Manage Time Logs"
--    policy) instead of being a broad SECURITY DEFINER surface. Replaces
--    the three duplicated, date-bounded client-side queries in
--    DashboardPage.tsx and DashboardLayout.tsx.
-- ============================================================================
create or replace function public.get_active_employees(p_company_id uuid)
returns table(employee_id uuid, action text, "timestamp" timestamptz)
language sql
security invoker
stable
set search_path to 'public'
as $function$
  select tl.employee_id, tl.action, tl.timestamp
  from time_logs tl
  where tl.company_id = p_company_id
    and tl.timestamp > coalesce(
      (
        select max(tl2.timestamp)
        from time_logs tl2
        where tl2.employee_id = tl.employee_id
          and tl2.action = 'clock_out'
      ),
      '-infinity'::timestamptz
    )
  order by tl.employee_id, tl.timestamp asc;
$function$;

revoke all on function public.get_active_employees(uuid) from public;
grant execute on function public.get_active_employees(uuid) to authenticated;

-- ============================================================================
-- 4. New: close_employee_shift() — manager manual correction for an
--    abandoned/forgotten session. SECURITY INVOKER: the INSERT runs as the
--    calling user and is still gated by the existing "Admin Manage Time
--    Logs" RLS policy (owner-of-company only), so this adds no new
--    privilege beyond what an owner already has via the dashboard.
-- ============================================================================
create or replace function public.close_employee_shift(p_employee_id uuid, p_company_id uuid)
returns time_logs
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_last_clock_in timestamptz;
  v_last_clock_out timestamptz;
  v_row time_logs;
begin
  select max(timestamp) into v_last_clock_in
  from time_logs
  where employee_id = p_employee_id and company_id = p_company_id and action = 'clock_in';

  select max(timestamp) into v_last_clock_out
  from time_logs
  where employee_id = p_employee_id and company_id = p_company_id and action = 'clock_out';

  if v_last_clock_in is null or (v_last_clock_out is not null and v_last_clock_out >= v_last_clock_in) then
    raise exception 'Employee has no active session to close' using errcode = '22023';
  end if;

  insert into time_logs (employee_id, company_id, action, timestamp, closed_by)
  values (p_employee_id, p_company_id, 'clock_out', now(), auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.close_employee_shift(uuid, uuid) from public;
grant execute on function public.close_employee_shift(uuid, uuid) to authenticated;
