-- Add periodic refresh functionality for dynamic group memberships
-- This is needed for time-based rules (olderThanDays, newerThanDays, etc.)

--------------------------------------------------
-- 1. Function to refresh all dynamic group memberships
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_all_dynamic_group_memberships()
RETURNS void AS $$
DECLARE
  grp RECORD;
BEGIN
  -- Loop through all dynamic groups and refresh membership
  FOR grp IN SELECT id, rule_expression FROM public.dynamic_computer_groups
  LOOP
    -- Clear existing members
    DELETE FROM public.dynamic_group_members WHERE group_id = grp.id;
    
    -- Re-evaluate all computers for this group
    INSERT INTO public.dynamic_group_members (group_id, computer_id)
    SELECT grp.id, c.id
    FROM public.computers c
    WHERE public.evaluate_rule_expression(
      grp.rule_expression,
      c.name::TEXT,
      c.os::TEXT,
      c.os_version::TEXT,
      c.ip::TEXT,
      c.login_user::TEXT,
      c.created_at::TEXT
    );
    
    -- Update last evaluated timestamp
    UPDATE public.dynamic_computer_groups 
    SET last_evaluated_at = now() 
    WHERE id = grp.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_all_dynamic_group_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_dynamic_group_memberships() TO service_role;

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to run every hour
SELECT cron.schedule('refresh-dynamic-groups', '0 * * * *', 'SELECT public.refresh_all_dynamic_group_memberships()');