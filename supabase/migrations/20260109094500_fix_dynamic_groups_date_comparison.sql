-- Migration to fix date comparison in dynamic groups
-- Forces UTC interpretation and improves robustness

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
  IF prop_value IS NULL OR prop_value = '' THEN
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
      BEGIN
        days_value := rule_value::INTEGER;
        date_value := prop_value::TIMESTAMPTZ;
        RETURN date_value < (now() - (days_value || ' days')::INTERVAL);
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'newerThanDays' THEN
      BEGIN
        days_value := rule_value::INTEGER;
        date_value := prop_value::TIMESTAMPTZ;
        RETURN date_value >= (now() - (days_value || ' days')::INTERVAL);
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'after' THEN
      BEGIN
        date_value := prop_value::TIMESTAMPTZ;
        -- Force UTC interpretation for date-only strings from frontend DatePicker
        IF rule_value ~ '^\d{4}-\d{2}-\d{2}$' THEN
            target_date := (rule_value || ' 00:00:00+00')::TIMESTAMPTZ;
        ELSE
            target_date := rule_value::TIMESTAMPTZ;
        END IF;
        RETURN date_value > target_date;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    WHEN 'before' THEN
      BEGIN
        date_value := prop_value::TIMESTAMPTZ;
        -- Force UTC interpretation for date-only strings from frontend DatePicker
        IF rule_value ~ '^\d{4}-\d{2}-\d{2}$' THEN
            target_date := (rule_value || ' 00:00:00+00')::TIMESTAMPTZ;
        ELSE
            target_date := rule_value::TIMESTAMPTZ;
        END IF;
        RETURN date_value < target_date;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE;
