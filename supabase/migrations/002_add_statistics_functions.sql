-- ============================================================
-- Migration: 002_add_statistics_functions.sql
-- Purpose: Add statistics RPC functions for Dashboard Phase 6
-- Prerequisites: Requires 001_initial_schema.sql to be applied first
-- ============================================================

-- Drop existing functions if they exist (to allow re-running)
DROP FUNCTION IF EXISTS get_today_statistics(text);
DROP FUNCTION IF EXISTS get_all_time_statistics();
DROP FUNCTION IF EXISTS get_daily_trend(integer, text);
DROP FUNCTION IF EXISTS get_monthly_trend(integer, text);
DROP FUNCTION IF EXISTS get_available_time_summary();

-- ============================================================
-- Helper: format_duration
-- Formats seconds into human-readable Chinese duration string
-- Example: 3665 -> "1 小时 1 分钟 5 秒"
-- ============================================================
CREATE OR REPLACE FUNCTION format_duration(seconds bigint)
RETURNS TEXT AS $$
DECLARE
    h bigint;
    m bigint;
    s bigint;
    parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF seconds IS NULL OR seconds = 0 THEN
        RETURN '0 秒';
    END IF;
    
    h := seconds / 3600;
    m := (seconds % 3600) / 60;
    s := seconds % 60;
    
    IF h > 0 THEN
        parts := array_append(parts, h || '小时');
    END IF;
    
    IF m > 0 THEN
        parts := array_append(parts, m || '分钟');
    END IF;
    
    IF s > 0 THEN
        parts := array_append(parts, s || '秒');
    END IF;
    
    IF array_length(parts, 1) = 0 THEN
        RETURN '0 秒';
    END IF;
    
    RETURN array_to_string(parts, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Function: get_today_statistics
-- Returns time records grouped by Big Category and Small Category for today
-- Parameter: user_timezone (e.g., 'Asia/Shanghai', 'America/New_York')
-- ============================================================
CREATE OR REPLACE FUNCTION get_today_statistics(user_timezone text DEFAULT 'UTC')
RETURNS TABLE (
    big_category_id uuid,
    big_category_name text,
    small_category_id uuid,
    small_category_name text,
    total_seconds bigint,
    formatted_duration text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bc.id AS big_category_id,
        bc.name::varchar AS big_category_name,
        sc.id AS small_category_id,
        sc.name::varchar AS small_category_name,
        SUM(tr.actual_duration_seconds)::bigint AS total_seconds,
        format_duration(SUM(tr.actual_duration_seconds)) AS formatted_duration
    FROM time_records tr
    JOIN big_categories bc ON tr.big_category_id = bc.id
    LEFT JOIN small_categories sc ON tr.small_category_id = sc.id
    WHERE 
        DATE(tr.start_time AT TIME ZONE 'UTC' AT TIME ZONE user_timezone) = 
        (CURRENT_DATE AT TIME ZONE user_timezone)::date
    GROUP BY bc.id, bc.name, sc.id, sc.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function: get_all_time_statistics
-- Returns cumulative time records grouped by Big Category and Small Category
-- Includes percentage of total time
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_time_statistics()
RETURNS TABLE (
    big_category_id uuid,
    big_category_name text,
    small_category_id uuid,
    small_category_name text,
    total_seconds bigint,
    formatted_duration text,
    percentage numeric
) AS $$
DECLARE
    total_time bigint;
BEGIN
    -- Calculate total time across all categories
    SELECT COALESCE(SUM(actual_duration_seconds), 0) INTO total_time
    FROM time_records;
    
    RETURN QUERY
    SELECT 
        bc.id AS big_category_id,
        bc.name::varchar AS big_category_name,
        sc.id AS small_category_id,
        sc.name::varchar AS small_category_name,
        COALESCE(SUM(tr.actual_duration_seconds), 0)::bigint AS total_seconds,
        format_duration(COALESCE(SUM(tr.actual_duration_seconds), 0)) AS formatted_duration,
        CASE 
            WHEN total_time = 0 THEN 0
            ELSE ROUND((COALESCE(SUM(tr.actual_duration_seconds), 0)::numeric / total_time::numeric * 100), 2)
        END AS percentage
    FROM time_records tr
    JOIN big_categories bc ON tr.big_category_id = bc.id
    LEFT JOIN small_categories sc ON tr.small_category_id = sc.id
    GROUP BY bc.id, bc.name, sc.id, sc.name, total_time
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function: get_daily_trend
-- Returns daily totals for the last N days
-- Parameter: days_count (e.g., 7, 30)
-- Parameter: user_timezone
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_trend(days_count integer DEFAULT 7, user_timezone text DEFAULT 'UTC')
RETURNS TABLE (
    date_value date,
    total_seconds bigint,
    formatted_duration text
) AS $$
BEGIN
    RETURN QUERY
    WITH date_range AS (
        SELECT generate_series(
            CURRENT_DATE - (days_count - 1),
            CURRENT_DATE,
            '1 day'::interval
        )::date AS series_date
    ),
    daily_totals AS (
        SELECT 
            DATE(tr.start_time AT TIME ZONE 'UTC' AT TIME ZONE user_timezone) AS record_date,
            SUM(tr.actual_duration_seconds) AS day_total
        FROM time_records tr
        WHERE tr.start_time >= (CURRENT_DATE - (days_count - 1)) AT TIME ZONE user_timezone AT TIME ZONE 'UTC'
        GROUP BY DATE(tr.start_time AT TIME ZONE 'UTC' AT TIME ZONE user_timezone)
    )
    SELECT 
        dr.series_date AS date_value,
        COALESCE(dt.day_total, 0)::bigint AS total_seconds,
        format_duration(COALESCE(dt.day_total, 0)) AS formatted_duration
    FROM date_range dr
    LEFT JOIN daily_totals dt ON dr.series_date = dt.record_date
    ORDER BY dr.series_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function: get_monthly_trend
-- Returns monthly totals for the last N months
-- Parameter: months_count (e.g., 12)
-- Parameter: user_timezone
-- ============================================================
CREATE OR REPLACE FUNCTION get_monthly_trend(months_count integer DEFAULT 12, user_timezone text DEFAULT 'UTC')
RETURNS TABLE (
    month_value text,
    total_seconds bigint,
    formatted_duration text
) AS $$
BEGIN
    RETURN QUERY
    WITH date_range AS (
        SELECT generate_series(
            DATE_TRUNC('month', CURRENT_DATE) - ((months_count - 1) || ' months')::interval,
            DATE_TRUNC('month', CURRENT_DATE),
            '1 month'::interval
        )::date AS series_date
    ),
    monthly_totals AS (
        SELECT 
            DATE_TRUNC('month', tr.start_time AT TIME ZONE 'UTC' AT TIME ZONE user_timezone)::date AS record_month,
            SUM(tr.actual_duration_seconds) AS month_total
        FROM time_records tr
        WHERE tr.start_time >= (DATE_TRUNC('month', CURRENT_DATE) - ((months_count - 1) || ' months')::interval) AT TIME ZONE user_timezone AT TIME ZONE 'UTC'
        GROUP BY DATE_TRUNC('month', tr.start_time AT TIME ZONE 'UTC' AT TIME ZONE user_timezone)::date
    )
    SELECT 
        TO_CHAR(dr.series_date, 'YYYY-MM') AS month_value,
        COALESCE(mt.month_total, 0)::bigint AS total_seconds,
        format_duration(COALESCE(mt.month_total, 0)) AS formatted_duration
    FROM date_range dr
    LEFT JOIN monthly_totals mt ON dr.series_date = mt.record_month
    ORDER BY dr.series_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Function: get_available_time_summary
-- Returns available time for all active Big Categories
-- Reuses calculate_available_time_fast function from Phase 5
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_time_summary()
RETURNS TABLE (
    big_category_id uuid,
    big_category_name text,
    earned_seconds bigint,
    consumed_seconds bigint,
    available_seconds bigint,
    formatted_earned text,
    formatted_consumed text,
    formatted_available text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bc.id AS big_category_id,
        bc.name::varchar AS big_category_name,
        COALESCE(stats.earned_seconds, 0)::bigint AS earned_seconds,
        COALESCE(stats.consumed_seconds, 0)::bigint AS consumed_seconds,
        COALESCE(stats.available_seconds, 0)::bigint AS available_seconds,
        format_duration(COALESCE(stats.earned_seconds, 0)) AS formatted_earned,
        format_duration(COALESCE(stats.consumed_seconds, 0)) AS formatted_consumed,
        format_duration(COALESCE(stats.available_seconds, 0)) AS formatted_available
    FROM big_categories bc
    CROSS JOIN LATERAL (
        SELECT 
            earned_seconds,
            consumed_seconds,
            available_seconds
        FROM calculate_available_time_fast(bc.id)
    ) stats
    WHERE bc.status = 'ACTIVE'
    ORDER BY bc.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_today_statistics(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_time_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_time_summary() TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_today_statistics(text) IS 'Returns time records grouped by category for today based on user timezone';
COMMENT ON FUNCTION get_all_time_statistics() IS 'Returns cumulative time records grouped by category with percentages';
COMMENT ON FUNCTION get_daily_trend(integer, text) IS 'Returns daily totals for the last N days';
COMMENT ON FUNCTION get_monthly_trend(integer, text) IS 'Returns monthly totals for the last N months';
COMMENT ON FUNCTION get_available_time_summary() IS 'Returns available/earned/consumed time for all active Big Categories';
COMMENT ON FUNCTION format_duration(bigint) IS 'Formats seconds into human-readable Chinese duration string';
