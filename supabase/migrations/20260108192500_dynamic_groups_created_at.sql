-- Add createdAt property and time-based operators to dynamic groups

--------------------------------------------------
-- 1. Update evaluate_operator to handle date operations
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_operator(
  op TEXT,
  prop_value TEXT,
  rule_value TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  days_value INTEGER;
  date_value TIMESTAMPTZ;
  target_date TIMESTAMPTZ;
BEGIN
  IF prop_value IS NULL THEN
    RETURN FALSE;
  END IF;
  
  CASE op
    WHEN 'equals' THEN
      RETURN prop_value = rule_value;
    WHEN 'notEquals' THEN
      RETURN prop_value != rule_value;
    WHEN 'contains' THEN
      RETURN prop_value ILIKE '%' || rule_value || '%';
    WHEN 'notContains' THEN
      RETURN NOT (prop_value ILIKE '%' || rule_value || '%');
    WHEN 'startsWith' THEN
      RETURN prop_value ILIKE rule_value || '%';
    WHEN 'endsWith' THEN
      RETURN prop_value ILIKE '%' || rule_value;
    WHEN 'regex' THEN
      RETURN prop_value ~ rule_value;
    WHEN 'olderThanDays' THEN
      -- prop_value is ISO timestamp, rule_value is number of days
      BEGIN
        days_value := rule_value::INTEGER;
        date_value := prop_value::TIMESTAMPTZ;
        RETURN date_value < (now() - (days_value || ' days')::INTERVAL);
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'newerThanDays' THEN
      -- prop_value is ISO timestamp, rule_value is number of days
      BEGIN
        days_value := rule_value::INTEGER;
        date_value := prop_value::TIMESTAMPTZ;
        RETURN date_value >= (now() - (days_value || ' days')::INTERVAL);
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'after' THEN
      -- prop_value is ISO timestamp, rule_value is date string (YYYY-MM-DD)
      BEGIN
        date_value := prop_value::TIMESTAMPTZ;
        target_date := rule_value::TIMESTAMPTZ;
        RETURN date_value > target_date;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'before' THEN
      -- prop_value is ISO timestamp, rule_value is date string (YYYY-MM-DD)
      BEGIN
        date_value := prop_value::TIMESTAMPTZ;
        target_date := rule_value::TIMESTAMPTZ;
        RETURN date_value < target_date;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

--------------------------------------------------
-- 2. Update evaluate_rule_expression to support createdAt
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_rule_expression(
  expr JSONB,
  comp_name TEXT,
  comp_os TEXT,
  comp_os_version TEXT,
  comp_ip TEXT,
  comp_login_user TEXT,
  comp_created_at TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  cond JSONB;
  results BOOLEAN[] := '{}';
  prop_value TEXT;
  logic TEXT;
BEGIN
  -- Leaf node (single condition with property)
  IF expr ? 'property' THEN
    prop_value := CASE expr->>'property'
      WHEN 'name' THEN comp_name
      WHEN 'os' THEN comp_os
      WHEN 'osVersion' THEN comp_os_version
      WHEN 'ip' THEN comp_ip
      WHEN 'loginUser' THEN comp_login_user
      WHEN 'createdAt' THEN comp_created_at
      ELSE NULL
    END;
    RETURN public.evaluate_operator(expr->>'operator', prop_value, expr->>'value');
  END IF;
  
  -- Branch node (nested conditions)
  logic := COALESCE(expr->>'logic', 'AND');
  
  FOR cond IN SELECT jsonb_array_elements(expr->'conditions')
  LOOP
    results := array_append(results, public.evaluate_rule_expression(
      cond, comp_name, comp_os, comp_os_version, comp_ip, comp_login_user, comp_created_at
    ));
  END LOOP;
  
  -- Empty conditions = no match
  IF array_length(results, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF logic = 'AND' THEN
    -- All must be true
    RETURN NOT (FALSE = ANY(results));
  ELSE
    -- At least one must be true
    RETURN TRUE = ANY(results);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

--------------------------------------------------
-- 3. Update trigger for computer changes
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_computer_dynamic_memberships()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove existing memberships for this computer
  DELETE FROM public.dynamic_group_members WHERE computer_id = NEW.id;
  
  -- Re-evaluate all dynamic groups for this computer
  INSERT INTO public.dynamic_group_members (group_id, computer_id)
  SELECT g.id, NEW.id
  FROM public.dynamic_computer_groups g
  WHERE public.evaluate_rule_expression(
    g.rule_expression,
    NEW.name::TEXT,
    NEW.os::TEXT,
    NEW.os_version::TEXT,
    NEW.ip::TEXT,
    NEW.login_user::TEXT,
    NEW.created_at::TEXT
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------------------
-- 4. Update trigger for group rule changes
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_dynamic_group_membership()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear existing members of this group
  DELETE FROM public.dynamic_group_members WHERE group_id = NEW.id;
  
  -- Re-evaluate all computers for this group
  INSERT INTO public.dynamic_group_members (group_id, computer_id)
  SELECT NEW.id, c.id
  FROM public.computers c
  WHERE public.evaluate_rule_expression(
    NEW.rule_expression,
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
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------------------
-- 5. Update preview function
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_dynamic_group_members(
  rule_expr JSONB
) RETURNS TABLE(
  id UUID,
  name TEXT,
  os TEXT,
  os_version TEXT,
  ip TEXT,
  login_user TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name::TEXT,
    c.os::TEXT,
    c.os_version::TEXT,
    c.ip::TEXT,
    c.login_user::TEXT
  FROM public.computers c
  WHERE public.evaluate_rule_expression(
    rule_expr,
    c.name::TEXT,
    c.os::TEXT,
    c.os_version::TEXT,
    c.ip::TEXT,
    c.login_user::TEXT,
    c.created_at::TEXT
  );
END;
$$ LANGUAGE plpgsql STABLE;
