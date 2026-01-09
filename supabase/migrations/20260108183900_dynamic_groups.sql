-- Dynamic Computer Groups with cached membership and nested rule support

--------------------------------------------------
-- 1. Create tables
--------------------------------------------------

CREATE TABLE public.dynamic_computer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  description TEXT,
  rule_expression JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_evaluated_at TIMESTAMPTZ
);

ALTER TABLE public.dynamic_computer_groups ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX dynamic_computer_groups_display_name_key 
  ON public.dynamic_computer_groups USING btree (display_name);

CREATE TABLE public.dynamic_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.dynamic_computer_groups(id) ON DELETE CASCADE,
  computer_id UUID NOT NULL REFERENCES public.computers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, computer_id)
);

ALTER TABLE public.dynamic_group_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX dynamic_group_members_group_id_idx 
  ON public.dynamic_group_members USING btree (group_id);
CREATE INDEX dynamic_group_members_computer_id_idx 
  ON public.dynamic_group_members USING btree (computer_id);

--------------------------------------------------
-- 2. Helper function: evaluate a single operator
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_operator(
  op TEXT,
  prop_value TEXT,
  rule_value TEXT
) RETURNS BOOLEAN AS $$
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
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

--------------------------------------------------
-- 3. Recursive function: evaluate nested rules
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_rule_expression(
  expr JSONB,
  comp_name TEXT,
  comp_os TEXT,
  comp_os_version TEXT,
  comp_ip TEXT,
  comp_login_user TEXT
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
      ELSE NULL
    END;
    RETURN public.evaluate_operator(expr->>'operator', prop_value, expr->>'value');
  END IF;
  
  -- Branch node (nested conditions)
  logic := COALESCE(expr->>'logic', 'AND');
  
  FOR cond IN SELECT jsonb_array_elements(expr->'conditions')
  LOOP
    results := array_append(results, public.evaluate_rule_expression(
      cond, comp_name, comp_os, comp_os_version, comp_ip, comp_login_user
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

--------------------------------------------------
-- 4. Trigger: refresh memberships on computer change
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
    NEW.login_user::TEXT
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_computer_dynamic_membership_refresh
AFTER INSERT OR UPDATE ON public.computers
FOR EACH ROW EXECUTE FUNCTION public.refresh_computer_dynamic_memberships();

--------------------------------------------------
-- 5. Trigger: refresh memberships on group rule change
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
    c.login_user::TEXT
  );
  
  -- Update last evaluated timestamp
  UPDATE public.dynamic_computer_groups 
  SET last_evaluated_at = now() 
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dynamic_group_rules_refresh
AFTER INSERT OR UPDATE OF rule_expression ON public.dynamic_computer_groups
FOR EACH ROW EXECUTE FUNCTION public.refresh_dynamic_group_membership();

--------------------------------------------------
-- 6. Grants for all roles
--------------------------------------------------

GRANT ALL ON TABLE public.dynamic_computer_groups TO anon;
GRANT ALL ON TABLE public.dynamic_computer_groups TO authenticated;
GRANT ALL ON TABLE public.dynamic_computer_groups TO postgres;
GRANT ALL ON TABLE public.dynamic_computer_groups TO service_role;

GRANT ALL ON TABLE public.dynamic_group_members TO anon;
GRANT ALL ON TABLE public.dynamic_group_members TO authenticated;
GRANT ALL ON TABLE public.dynamic_group_members TO postgres;
GRANT ALL ON TABLE public.dynamic_group_members TO service_role;

--------------------------------------------------
-- 7. RLS Policies
--------------------------------------------------

CREATE POLICY "allow all for authenticated"
ON public.dynamic_computer_groups
AS PERMISSIVE
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "allow all for authenticated"
ON public.dynamic_group_members
AS PERMISSIVE
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

--------------------------------------------------
-- 8. Enable realtime
--------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_computer_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_group_members;

--------------------------------------------------
-- 9. Preview function for rule testing
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
    c.login_user::TEXT
  );
END;
$$ LANGUAGE plpgsql STABLE;

--------------------------------------------------
-- 10. Default "All Computers" group
--------------------------------------------------

INSERT INTO public.dynamic_computer_groups (display_name, description, rule_expression)
VALUES (
  'All Computers',
  'Automatically includes all computers in the system',
  '{"property": "name", "operator": "regex", "value": ".*"}'::jsonb
);
