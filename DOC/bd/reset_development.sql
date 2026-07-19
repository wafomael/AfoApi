DO $$
DECLARE
    tables_sql TEXT;
BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
      INTO tables_sql
      FROM pg_tables
     WHERE schemaname = 's_afro_dev';

    IF tables_sql IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables_sql || ' RESTART IDENTITY CASCADE';
    END IF;
END;
$$;
