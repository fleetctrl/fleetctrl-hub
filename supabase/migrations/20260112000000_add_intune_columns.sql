-- Add intune_id to computers table
ALTER TABLE public.computers ADD COLUMN intune_id TEXT;

-- Update evaluate_rule_expression to check intune_id for intuneMdm property
CREATE OR REPLACE FUNCTION public.evaluate_rule_expression(
  expr JSONB,
  comp_name TEXT,
  comp_os TEXT,
  comp_os_version TEXT,
  comp_ip TEXT,
  comp_login_user TEXT,
  comp_intune_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  cond JSONB;
  results BOOLEAN[] := '{}';
  prop_value TEXT;
  logic TEXT;
  rule_val TEXT;
BEGIN
  -- Leaf node (single condition with property)
  IF expr ? 'property' THEN
    IF (expr->>'property') = 'intuneMdm' THEN
        rule_val := expr->>'value';
        IF rule_val = 'true' THEN
            RETURN comp_intune_id IS NOT NULL AND comp_intune_id != '';
        ELSE
            RETURN comp_intune_id IS NULL OR comp_intune_id = '';
        END IF;
    END IF;

    prop_value := CASE expr->>'property'
      WHEN 'name' THEN comp_name
      WHEN 'os' THEN comp_os
      WHEN 'osVersion' THEN comp_os_version
      WHEN 'ip' THEN comp_ip
      WHEN 'loginUser' THEN comp_login_user
      ELSE NULL
    END;
    RETURN public.evaluate_operator(expr->>'operator', prop_value, expr->>'value');
  END IF;
  
  -- Branch node (nested conditions)
  logic := COALESCE(expr->>'logic', 'AND');
  
  FOR cond IN SELECT jsonb_array_elements(expr->'conditions')
  LOOP
    results := array_append(results, public.evaluate_rule_expression(
      cond, comp_name, comp_os, comp_os_version, comp_ip, comp_login_user, comp_intune_id
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update trigger function for computer changes
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
    NEW.intune_id::TEXT
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger function for group rule changes
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
    c.intune_id::TEXT
  );
  
  -- Update last evaluated timestamp
  UPDATE public.dynamic_computer_groups 
  SET last_evaluated_at = now() 
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update preview function
CREATE OR REPLACE FUNCTION public.preview_dynamic_group_members(
  rule_expr JSONB
) RETURNS TABLE(
  id UUID,
  name TEXT,
  os TEXT,
  os_version TEXT,
  ip TEXT,
  login_user TEXT,
  intune_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name::TEXT,
    c.os::TEXT,
    c.os_version::TEXT,
    c.ip::TEXT,
    c.login_user::TEXT,
    c.intune_id::TEXT
  FROM public.computers c
  WHERE public.evaluate_rule_expression(
    rule_expr,
    c.name::TEXT,
    c.os::TEXT,
    c.os_version::TEXT,
    c.ip::TEXT,
    c.login_user::TEXT,
    c.intune_id::TEXT
  );
END;
$$ LANGUAGE plpgsql STABLE;
