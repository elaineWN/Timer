-- Personal Time Management Tool - Initial Schema
-- This schema supports:
-- 1. Big Categories (cannot be deleted, only deactivated)
-- 2. Small Categories (belong to one Big Category)
-- 3. Time Records (immutable historical records)
-- 4. Conversion Rules (versioned with effective dates, no overlaps)
-- 5. Active Timer (only one at a time, persistent)
-- 6. Available Time calculation (database-side authoritative)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BIG CATEGORIES TABLE
-- ============================================
CREATE TABLE big_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for filtering active categories
CREATE INDEX idx_big_categories_status ON big_categories(status);

-- ============================================
-- SMALL CATEGORIES TABLE
-- ============================================
CREATE TABLE small_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    big_category_id UUID NOT NULL REFERENCES big_categories(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_small_category_per_big
        UNIQUE (big_category_id, name),

    CONSTRAINT unique_small_category_id_big_category
        UNIQUE (id, big_category_id)
);

-- Index for querying by big category
CREATE INDEX idx_small_categories_big_category_id ON small_categories(big_category_id);
CREATE INDEX idx_small_categories_status ON small_categories(status);

-- ============================================
-- CONVERSION RULES TABLE (Versioned)
-- ============================================
-- Each rule version has an effective_from date
-- When a new rule is created for the same source/target pair,
-- the previous rule's effective_to is set
-- Exclusion constraint prevents overlapping effective periods
CREATE TABLE conversion_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_big_category_id UUID NOT NULL REFERENCES big_categories(id) ON DELETE RESTRICT,
    target_big_category_id UUID NOT NULL REFERENCES big_categories(id) ON DELETE RESTRICT,
    source_ratio DECIMAL(10, 4) NOT NULL CHECK (source_ratio > 0),
    target_ratio DECIMAL(10, 4) NOT NULL CHECK (target_ratio > 0),
    effective_from DATE NOT NULL,
    effective_to DATE, -- NULL means this is the current active version
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure source and target are different
    CONSTRAINT chk_different_categories CHECK (source_big_category_id != target_big_category_id)
);

-- Exclusion constraint to prevent overlapping effective periods for same source/target pair
-- Requires btree_gist extension
CREATE EXTENSION IF NOT EXISTS "btree_gist";
ALTER TABLE conversion_rules ADD CONSTRAINT no_overlapping_rules
    EXCLUDE USING GIST (
        source_big_category_id WITH =,
        target_big_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31')) WITH &&
    );

-- Indexes for efficient lookups
CREATE INDEX idx_conversion_rules_source_target ON conversion_rules(source_big_category_id, target_big_category_id);
CREATE INDEX idx_conversion_rules_effective_from ON conversion_rules(source_big_category_id, target_big_category_id, effective_from);

-- ============================================
-- TIME RECORDS TABLE (Immutable)
-- ============================================
-- conversion_rule_id is NULL if this record doesn't contribute to earning time for another category
-- In MVP, one time record can contribute to only ONE target Big Category through ONE conversion rule
CREATE TABLE time_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    big_category_id UUID NOT NULL REFERENCES big_categories(id) ON DELETE RESTRICT,
    small_category_id UUID REFERENCES small_categories(id) ON DELETE SET NULL,
    timer_mode VARCHAR(20) NOT NULL CHECK (timer_mode IN ('COUNT_UP', 'COUNTDOWN')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    actual_duration_seconds INTEGER NOT NULL CHECK (actual_duration_seconds >= 0),
    paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
    conversion_rule_id UUID REFERENCES conversion_rules(id), -- NULL if not part of a conversion
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure small_category belongs to the correct big_category (if provided)
    CONSTRAINT fk_small_category_big_category 
        FOREIGN KEY (small_category_id, big_category_id) 
        REFERENCES small_categories(id, big_category_id)
);

-- Indexes for statistics queries
CREATE INDEX idx_time_records_big_category_id ON time_records(big_category_id);
CREATE INDEX idx_time_records_small_category_id ON time_records(small_category_id);
CREATE INDEX idx_time_records_start_time ON time_records(start_time);
CREATE INDEX idx_time_records_end_time ON time_records(end_time);
CREATE INDEX idx_time_records_date_range ON time_records(start_time, end_time);
CREATE INDEX idx_time_records_conversion_rule ON time_records(conversion_rule_id);

-- ============================================
-- ACTIVE TIMER TABLE (Only one row at a time)
-- ============================================
-- This table persists the current timer state
-- so it survives browser refresh/close
-- Uses accumulated_active_seconds + last_session_start for accurate elapsed time calculation
CREATE TABLE active_timer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    big_category_id UUID NOT NULL REFERENCES big_categories(id) ON DELETE RESTRICT,
    small_category_id UUID REFERENCES small_categories(id) ON DELETE SET NULL,
    timer_mode VARCHAR(20) NOT NULL CHECK (timer_mode IN ('COUNT_UP', 'COUNTDOWN')),
    countdown_target_seconds INTEGER, -- NULL for COUNT_UP, seconds for COUNTDOWN
    start_time TIMESTAMPTZ NOT NULL,
    accumulated_active_seconds INTEGER NOT NULL DEFAULT 0, -- Time accumulated before current session
    last_session_start TIMESTAMPTZ, -- NULL if paused, start of current running session
    total_paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure small_category belongs to the correct big_category (if provided)
    CONSTRAINT fk_small_category_big_category 
        FOREIGN KEY (small_category_id, big_category_id) 
        REFERENCES small_categories(id, big_category_id)
);

-- Unique partial index to ensure only one active timer exists
-- A timer is considered "active" if status is RUNNING or PAUSED
CREATE UNIQUE INDEX idx_active_timer_single ON active_timer((TRUE)) 
    WHERE status IN ('RUNNING', 'PAUSED');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_big_categories_updated_at
    BEFORE UPDATE ON big_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_small_categories_updated_at
    BEFORE UPDATE ON small_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_active_timer_updated_at
    BEFORE UPDATE ON active_timer
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- IMMUTABILITY TRIGGERS FOR TIME RECORDS
-- ============================================
-- Prevent UPDATE or DELETE on time_records to ensure historical integrity

CREATE OR REPLACE FUNCTION prevent_time_record_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Only allow no-op updates (same values)
        IF OLD.* IS DISTINCT FROM NEW.* THEN
            RAISE EXCEPTION 'Cannot modify historical time records. Record ID: %', OLD.id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete historical time records. Record ID: %', OLD.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_time_record_update
    BEFORE UPDATE ON time_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_time_record_modification();

CREATE TRIGGER trg_prevent_time_record_delete
    BEFORE DELETE ON time_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_time_record_modification();

-- ============================================
-- TRIGGER TO AUTO-SET CONVERSION RULE ID
-- ============================================
-- When a time record is created, automatically find and store
-- the conversion rule that was effective at the start_time.
-- This ensures historical accuracy even if rules change later.

CREATE OR REPLACE FUNCTION set_conversion_rule_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_rule_id UUID;
BEGIN
    -- Only set conversion_rule_id if it's NULL and there's a matching rule
    IF NEW.conversion_rule_id IS NULL THEN
        -- Find the conversion rule that was effective at the start_time
        SELECT cr.id INTO v_rule_id
        FROM conversion_rules cr
        WHERE cr.source_big_category_id = NEW.big_category_id
          AND cr.effective_from <= (NEW.start_time::DATE)
          AND (cr.effective_to IS NULL OR cr.effective_to >= (NEW.start_time::DATE))
        ORDER BY cr.effective_from DESC
        LIMIT 1;
        
        -- Set the found rule ID (or leave as NULL if no rule exists)
        NEW.conversion_rule_id := v_rule_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_conversion_rule_on_insert
    BEFORE INSERT ON time_records
    FOR EACH ROW
    EXECUTE FUNCTION set_conversion_rule_on_insert();

-- ============================================
-- AVAILABLE TIME CALCULATION FUNCTIONS
-- ============================================

-- Function to get the conversion rule that was effective at a given timestamp
-- Returns the rule that was active when the time was recorded
CREATE OR REPLACE FUNCTION get_conversion_rule_at_time(
    p_source_category_id UUID,
    p_target_category_id UUID,
    p_timestamp TIMESTAMPTZ
)
RETURNS TABLE (
    id UUID,
    source_ratio DECIMAL,
    target_ratio DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.source_ratio,
        cr.target_ratio
    FROM conversion_rules cr
    WHERE cr.source_big_category_id = p_source_category_id
      AND cr.target_big_category_id = p_target_category_id
      AND cr.effective_from <= (p_timestamp::DATE)
      AND (cr.effective_to IS NULL OR cr.effective_to >= (p_timestamp::DATE))
    ORDER BY cr.effective_from DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate available time for a target big category
-- Available Time = Total Earned Time - Total Consumed Time
-- Earned time uses the conversion rule that was effective when each source record was created
CREATE OR REPLACE FUNCTION calculate_available_time(p_target_category_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_earned_seconds INTEGER := 0;
    v_consumed_seconds INTEGER := 0;
    v_record RECORD;
    v_rule RECORD;
BEGIN
    -- Calculate consumed time: sum of all time spent in the target category
    SELECT COALESCE(SUM(actual_duration_seconds), 0)
    INTO v_consumed_seconds
    FROM time_records
    WHERE big_category_id = p_target_category_id;
    
    -- Calculate earned time: sum of converted time from all source categories
    -- For each source record, we need to find the rule that was effective at that time
    FOR v_record IN 
        SELECT tr.big_category_id as source_cat_id, 
               tr.actual_duration_seconds,
               tr.start_time
        FROM time_records tr
        JOIN conversion_rules cr ON tr.big_category_id = cr.source_big_category_id
        WHERE cr.target_big_category_id = p_target_category_id
          AND tr.conversion_rule_id IS NOT NULL
    LOOP
        -- Get the rule that was effective for this specific record
        -- We use the stored conversion_rule_id to get the exact ratios
        SELECT cr.source_ratio, cr.target_ratio
        INTO v_rule
        FROM conversion_rules cr
        WHERE cr.id = v_record.conversion_rule_id;
        
        IF FOUND THEN
            v_earned_seconds := v_earned_seconds + 
                (v_record.actual_duration_seconds * (v_rule.target_ratio / v_rule.source_ratio))::INTEGER;
        END IF;
    END LOOP;
    
    RETURN v_earned_seconds - v_consumed_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

-- More efficient version using a view-like approach
-- Returns a table with earned, consumed, and available seconds
CREATE OR REPLACE FUNCTION calculate_available_time_fast(p_target_category_id UUID)
RETURNS TABLE (
    earned_seconds INTEGER,
    consumed_seconds INTEGER,
    available_seconds INTEGER
) AS $$
DECLARE
    v_earned_seconds INTEGER := 0;
    v_consumed_seconds INTEGER := 0;
BEGIN
    -- Calculate consumed time: sum of all time spent in the target category
    SELECT COALESCE(SUM(actual_duration_seconds), 0)
    INTO v_consumed_seconds
    FROM time_records
    WHERE big_category_id = p_target_category_id;
    
    -- Calculate earned time using stored conversion_rule_id
    SELECT COALESCE(SUM(
        tr.actual_duration_seconds * (cr.target_ratio / cr.source_ratio)
    )::INTEGER, 0)
    INTO v_earned_seconds
    FROM time_records tr
    JOIN conversion_rules cr ON tr.conversion_rule_id = cr.id
    WHERE cr.target_big_category_id = p_target_category_id
      AND tr.conversion_rule_id IS NOT NULL;
    
    earned_seconds := v_earned_seconds;
    consumed_seconds := v_consumed_seconds;
    available_seconds := v_earned_seconds - v_consumed_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- VIEW FOR AVAILABLE TIME BY CATEGORY
-- ============================================
-- Shows available time for all categories that have conversion rules targeting them

CREATE VIEW available_time_view AS
SELECT 
    bc.id as big_category_id,
    bc.name as big_category_name,
    (calc.earned_seconds)::INTEGER as earned_seconds,
    (calc.consumed_seconds)::INTEGER as consumed_seconds,
    (calc.available_seconds)::INTEGER as available_seconds
FROM big_categories bc
CROSS JOIN LATERAL calculate_available_time_fast(bc.id) calc
WHERE bc.status = 'ACTIVE'
  AND EXISTS (
      SELECT 1 FROM conversion_rules cr 
      WHERE cr.target_big_category_id = bc.id
  );

-- ============================================
-- VIEW FOR CURRENT ACTIVE CONVERSION RULES
-- ============================================
-- Gets the latest version for each source/target pair (where effective_to IS NULL)

CREATE VIEW current_conversion_rules AS
SELECT 
    id,
    source_big_category_id,
    target_big_category_id,
    source_ratio,
    target_ratio,
    effective_from
FROM conversion_rules
WHERE effective_to IS NULL;

-- ============================================
-- TIMER VALIDATION FUNCTION
-- ============================================
-- Validates whether a timer can be started for a given category
-- Returns TRUE if allowed, raises exception if not

CREATE OR REPLACE FUNCTION validate_timer_start(
    p_big_category_id UUID,
    p_timer_mode VARCHAR,
    p_countdown_seconds INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_available_seconds INTEGER;
    v_has_conversion_rule BOOLEAN;
    v_result RECORD;
BEGIN
    -- Check if this category is controlled by a conversion rule
    SELECT EXISTS(
        SELECT 1 FROM conversion_rules cr 
        WHERE cr.target_big_category_id = p_big_category_id
    ) INTO v_has_conversion_rule;
    
    -- If category is controlled by conversion rule, check available time
    IF v_has_conversion_rule THEN
        SELECT available_seconds INTO v_result
        FROM calculate_available_time_fast(p_big_category_id);
        v_available_seconds := v_result.available_seconds;
        
        -- Both COUNT_UP and COUNTDOWN require available_time > 0 to START
        IF v_available_seconds <= 0 THEN
            RAISE EXCEPTION 'Cannot start timer: Available time for this category is % seconds (must be > 0)', v_available_seconds;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- For a personal app, we can keep RLS simple or disable it
-- If authentication is added later, these policies can be enhanced

-- Enable RLS on all tables
ALTER TABLE big_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE small_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_timer ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (or all users if no auth)
-- For MVP without complex auth, we allow full access
-- TODO: Add proper auth policies when Supabase Auth is configured

CREATE POLICY "Allow full access to big_categories" ON big_categories
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to small_categories" ON small_categories
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to conversion_rules" ON conversion_rules
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to time_records" ON time_records
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to active_timer" ON active_timer
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE big_categories IS 'Major time allocation areas. Cannot be deleted, only deactivated.';
COMMENT ON TABLE small_categories IS 'Sub-categories belonging to one Big Category.';
COMMENT ON TABLE conversion_rules IS 'Versioned rules for converting time between Big Categories. Each version has effective_from and optional effective_to. Overlapping periods are prevented by exclusion constraint.';
COMMENT ON TABLE time_records IS 'Immutable historical time records. Never modified after creation. conversion_rule_id is NULL if not part of a conversion.';
COMMENT ON TABLE active_timer IS 'Currently active timer. Only one row should exist at any time (enforced by unique partial index).';
COMMENT ON COLUMN conversion_rules.source_ratio IS 'Source ratio in conversion (e.g., 2 in "2:1")';
COMMENT ON COLUMN conversion_rules.target_ratio IS 'Target ratio in conversion (e.g., 1 in "2:1")';
COMMENT ON COLUMN time_records.actual_duration_seconds IS 'Actual active duration excluding paused time';
COMMENT ON COLUMN time_records.paused_duration_seconds IS 'Total paused duration (for reference)';
COMMENT ON COLUMN time_records.conversion_rule_id IS 'Reference to conversion rule used when this time contributed to earning. NULL if not applicable.';
COMMENT ON COLUMN active_timer.countdown_target_seconds IS 'Target duration for COUNTDOWN mode, NULL for COUNT_UP';
COMMENT ON COLUMN active_timer.total_paused_duration_seconds IS 'Accumulated paused time during this timer session';
COMMENT ON COLUMN active_timer.accumulated_active_seconds IS 'Active time accumulated before the current session';
COMMENT ON COLUMN active_timer.last_session_start IS 'Start time of current running session, NULL if paused';
COMMENT ON FUNCTION calculate_available_time_fast(UUID) IS 'Returns TABLE(earned_seconds, consumed_seconds, available_seconds). Calculates available time for a category: earned - consumed. Uses stored conversion_rule_id for historical accuracy.';
COMMENT ON FUNCTION validate_timer_start IS 'Validates if a timer can start. Checks available_time > 0 for controlled categories.';
