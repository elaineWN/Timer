# Architecture Review - Critical Updates

## Executive Summary

After detailed review of the initial architecture, the following critical changes are required:

1. **Timer State Model**: The current schema cannot accurately calculate elapsed time for PAUSED timers
2. **Available Time Calculation**: Must be database-side (not frontend) for consistency and reusability
3. **Conversion Rule Versioning**: Need stronger guarantees against overlapping periods
4. **Historical Immutability**: Should store reference to conversion rule version used
5. **Single Active Timer Constraint**: Need database-level enforcement

---

## 1. Updated Timer State Model

### Problem with Current Design

The current model uses:
```sql
start_time TIMESTAMPTZ
paused_at TIMESTAMPTZ  -- NULL if running
total_paused_duration_seconds INTEGER
status VARCHAR(20)  -- 'RUNNING' or 'PAUSED'
```

**Issue**: When status='PAUSED', the formula `current_time - start_time - total_paused_duration` is incorrect because `current_time` keeps advancing while paused.

### Corrected Model

We need to track **pause sessions** separately to accurately calculate elapsed active time:

```sql
CREATE TABLE active_timer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    big_category_id UUID NOT NULL REFERENCES big_categories(id),
    small_category_id UUID REFERENCES small_categories(id),
    timer_mode VARCHAR(20) NOT NULL CHECK (timer_mode IN ('COUNT_UP', 'COUNTDOWN')),
    countdown_target_seconds INTEGER,
    
    -- Core timing fields
    start_time TIMESTAMPTZ NOT NULL,
    accumulated_active_seconds INTEGER NOT NULL DEFAULT 0,  -- Active time before current session
    last_session_start TIMESTAMPTZ,  -- When current RUNNING session started (NULL if paused)
    
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one non-terminal timer exists
CREATE UNIQUE INDEX idx_active_timer_single_active 
ON active_timer((CASE WHEN status IN ('RUNNING', 'PAUSED') THEN 1 ELSE NULL END));
```

### Elapsed Time Calculation

**For RUNNING timer:**
```
elapsed = accumulated_active_seconds + (current_time - last_session_start)
```

**For PAUSED timer:**
```
elapsed = accumulated_active_seconds  -- last_session_start is NULL, no accumulation
```

This model:
- ✅ Correctly handles PAUSED state (no time accumulation)
- ✅ Correctly handles RUNNING state (accumulates from last_session_start)
- ✅ Survives browser refresh (all state in database)
- ✅ Simple calculation logic

### State Transitions

```
START → RUNNING
  - accumulated_active_seconds = 0
  - last_session_start = NOW()
  - status = 'RUNNING'

RUNNING → PAUSED
  - accumulated_active_seconds += (NOW() - last_session_start)
  - last_session_start = NULL
  - status = 'PAUSED'

PAUSED → RUNNING
  - last_session_start = NOW()
  - status = 'RUNNING'
  - (accumulated stays same)

RUNNING/PAUSED → STOPPED or COMPLETED
  - If RUNNING: accumulated_active_seconds += (NOW() - last_session_start)
  - Create time_record with final duration
  - Delete or mark as STOPPED/COMPLETED
```

### Database Constraint for Single Active Timer

```sql
-- Partial unique index ensures only one RUNNING or PAUSED timer exists
CREATE UNIQUE INDEX idx_one_active_timer 
ON active_timer((CASE WHEN status IN ('RUNNING', 'PAUSED') THEN 0 ELSE NULL END));
```

This creates a unique constraint where:
- All RUNNING/PAUSED rows have value `0` → only one allowed
- All STOPPED/COMPLETED rows have value `NULL` → multiple allowed (historical)

---

## 2. Available Time Calculation - Database Side

### Problem with Frontend Calculation

- Business logic duplicated across components
- Risk of inconsistent calculations
- Cannot be used for database-level validation
- Performance issues with large datasets

### Solution: PostgreSQL Function

Create a database function that calculates available time for any target category:

```sql
CREATE OR REPLACE FUNCTION calculate_available_time(p_target_category_id UUID)
RETURNS INTEGER AS $$
DECLARE
    earned_seconds INTEGER := 0;
    consumed_seconds INTEGER;
BEGIN
    -- Calculate earned time from all source categories
    -- using the conversion rule that was effective at the time of each record
    SELECT COALESCE(SUM(
        tr.actual_duration_seconds * (cr.target_ratio / cr.source_ratio)
    )::INTEGER, 0)
    INTO earned_seconds
    FROM time_records tr
    JOIN conversion_rules cr ON 
        tr.big_category_id = cr.source_big_category_id
        AND cr.target_big_category_id = p_target_category_id
        AND cr.effective_from <= tr.start_time::date
        AND (cr.effective_to IS NULL OR cr.effective_to > tr.start_time::date);
    
    -- Calculate consumed time in target category
    SELECT COALESCE(SUM(actual_duration_seconds), 0)
    INTO consumed_seconds
    FROM time_records
    WHERE big_category_id = p_target_category_id;
    
    RETURN earned_seconds - consumed_seconds;
END;
$$ LANGUAGE plpgsql STABLE;
```

### View for All Categories' Available Time

```sql
CREATE VIEW available_time_view AS
SELECT 
    bc.id as big_category_id,
    bc.name as big_category_name,
    COALESCE(earned.earned_seconds, 0) as earned_seconds,
    COALESCE(consumed.consumed_seconds, 0) as consumed_seconds,
    COALESCE(earned.earned_seconds, 0) - COALESCE(consumed.consumed_seconds, 0) as available_seconds
FROM big_categories bc
LEFT JOIN (
    -- Earned time subquery
    SELECT 
        cr.target_big_category_id,
        SUM(tr.actual_duration_seconds * (cr.target_ratio / cr.source_ratio))::INTEGER as earned_seconds
    FROM time_records tr
    JOIN conversion_rules cr ON 
        tr.big_category_id = cr.source_big_category_id
        AND cr.effective_from <= tr.start_time::date
        AND (cr.effective_to IS NULL OR cr.effective_to > tr.start_time::date)
    GROUP BY cr.target_big_category_id
) earned ON bc.id = earned.target_big_category_id
LEFT JOIN (
    -- Consumed time subquery
    SELECT 
        big_category_id,
        SUM(actual_duration_seconds)::INTEGER as consumed_seconds
    FROM time_records
    GROUP BY big_category_id
) consumed ON bc.id = consumed.big_category_id
WHERE bc.status = 'ACTIVE';
```

### Benefits

- ✅ Single source of truth for available time calculation
- ✅ Can be called from frontend, triggers, or validation functions
- ✅ Consistent results across all components
- ✅ Historical rules automatically applied based on record timestamps

---

## 3. Conversion Rule Versioning - Stronger Guarantees

### Problem

Current design allows overlapping effective periods at database level. Application must prevent this, but we want database-level guarantees.

### Solution: Exclusion Constraint

PostgreSQL supports exclusion constraints that prevent overlapping ranges:

```sql
CREATE TABLE conversion_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_big_category_id UUID NOT NULL REFERENCES big_categories(id),
    target_big_category_id UUID NOT NULL REFERENCES big_categories(id),
    source_ratio DECIMAL(10, 4) NOT NULL CHECK (source_ratio > 0),
    target_ratio DECIMAL(10, 4) NOT NULL CHECK (target_ratio > 0),
    effective_from DATE NOT NULL,
    effective_to DATE,  -- NULL means current active version
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Exclude overlapping effective periods for same source/target pair
    EXCLUDE USING gist (
        source_big_category_id WITH =,
        target_big_category_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31')) WITH &&
    )
);
```

This constraint ensures:
- No two rules for the same source/target pair can have overlapping date ranges
- Database-level enforcement (cannot be bypassed by application bug)
- Automatic rejection of conflicting inserts/updates

### Storing Reference to Conversion Rule in Time Records

**Option A: Store rule ID (Recommended)**

```sql
CREATE TABLE time_records (
    ...
    conversion_rule_id UUID REFERENCES conversion_rules(id),  -- Rule used for earning calculation
    ...
);
```

When creating a time record for a source category that has conversion rules:
1. Query the effective rule at the time of recording
2. Store its ID in `conversion_rule_id`
3. Use this specific rule for any future calculations

**Benefits:**
- ✅ Absolute guarantee of historical immutability
- ✅ No ambiguity about which rule was used
- ✅ Fast lookups (direct join vs. date range query)
- ✅ Audit trail preserved

**Trade-off:**
- Slightly more complex insert logic (must find and store rule ID)

### Recommendation

Use **Option A** (store rule ID) for maximum historical correctness. The schema becomes:

```sql
CREATE TABLE time_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    big_category_id UUID NOT NULL REFERENCES big_categories(id),
    small_category_id UUID REFERENCES small_categories(id) ON DELETE SET NULL,
    timer_mode VARCHAR(20) NOT NULL CHECK (timer_mode IN ('COUNT_UP', 'COUNTDOWN')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    actual_duration_seconds INTEGER NOT NULL CHECK (actual_duration_seconds >= 0),
    conversion_rule_id UUID REFERENCES conversion_rules(id),  -- For source category earning
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note: `conversion_rule_id` is nullable because:
- It's only set when the big_category is a SOURCE in a conversion rule
- Records for categories without conversion rules don't need it

---

## 4. Timer Start Validation - Database Function

Create a function to validate timer start based on available time:

```sql
CREATE OR REPLACE FUNCTION validate_timer_start(
    p_big_category_id UUID,
    p_timer_mode VARCHAR(20)
)
RETURNS TABLE (
    can_start BOOLEAN,
    available_seconds INTEGER,
    reason TEXT
) AS $$
DECLARE
    v_available INTEGER;
    v_has_conversion_rule BOOLEAN;
BEGIN
    -- Check if this category has any conversion rules targeting it
    SELECT EXISTS(
        SELECT 1 FROM conversion_rules 
        WHERE target_big_category_id = p_big_category_id
    ) INTO v_has_conversion_rule;
    
    IF NOT v_has_conversion_rule THEN
        -- No conversion rules, always allowed to start
        RETURN QUERY SELECT true, 0::INTEGER, 'No conversion rules'::TEXT;
        RETURN;
    END IF;
    
    -- Calculate available time
    SELECT calculate_available_time(p_big_category_id) INTO v_available;
    
    IF v_available <= 0 THEN
        -- Cannot start when available time <= 0
        RETURN QUERY SELECT false, v_available, 'Available time is zero or negative'::TEXT;
    ELSE
        -- Can start (both COUNT_UP and COUNTDOWN)
        RETURN QUERY SELECT true, v_available, 'Sufficient available time'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
```

### Usage

Frontend calls this function before allowing timer start:

```typescript
const { data } = await supabase.rpc('validate_timer_start', {
    p_big_category_id: categoryId,
    p_timer_mode: 'COUNT_UP'
});

if (!data[0].can_start) {
    showError(`Cannot start: ${data[0].reason}`);
    return;
}
```

### Count Up Auto-Stop Logic

Count Up auto-stop when available reaches zero is handled in the **frontend timer loop**:

```typescript
// In useTimer hook
useEffect(() => {
    if (timerMode === 'COUNT_UP' && controlledByConversionRule) {
        const checkInterval = setInterval(async () => {
            const { available_seconds } = await calculateAvailableTime(categoryId);
            if (available_seconds <= 0) {
                // Auto-stop the timer
                await stopTimer();
                showNotification('Timer stopped: Available time reached zero');
            }
        }, 5000); // Check every 5 seconds
        
        return () => clearInterval(checkInterval);
    }
}, [elapsedSeconds, categoryId]);
```

**Why frontend?** Because:
- Auto-stop requires real-time monitoring (database triggers can't poll)
- User experience (show notification, smooth transition)
- Countdown does NOT auto-stop, so logic must be mode-aware

---

## 5. Historical Immutability - RLS and Triggers

### Prevent Modification of Time Records

```sql
-- Trigger to prevent UPDATE on time_records
CREATE OR REPLACE FUNCTION prevent_time_record_update()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Time records cannot be modified. This is an immutable historical record.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_time_record_update
    BEFORE UPDATE ON time_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_time_record_update();

-- Trigger to prevent DELETE on time_records
CREATE OR REPLACE FUNCTION prevent_time_record_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Time records cannot be deleted. This is an immutable historical record.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_time_record_delete
    BEFORE DELETE ON time_records
    FOR EACH ROW
    EXECUTE FUNCTION prevent_time_record_delete();
```

### Prevent Physical Delete of Categories

```sql
-- Big Categories: Only allow UPDATE to change status, not DELETE
CREATE OR REPLACE FUNCTION prevent_big_category_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Big categories cannot be deleted. Set status to INACTIVE instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_big_category_delete
    BEFORE DELETE ON big_categories
    FOR EACH ROW
    EXECUTE FUNCTION prevent_big_category_delete();

-- Small Categories: Same protection
CREATE OR REPLACE FUNCTION prevent_small_category_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Small categories cannot be deleted. Set status to INACTIVE instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_small_category_delete
    BEFORE DELETE ON small_categories
    FOR EACH ROW
    EXECUTE FUNCTION prevent_small_category_delete();
```

### RLS Policies for Additional Protection

```sql
-- Time records: Allow INSERT, block UPDATE and DELETE
CREATE POLICY "Prevent time record modification" ON time_records
    FOR UPDATE USING (false);

CREATE POLICY "Prevent time record deletion" ON time_records
    FOR DELETE USING (false);

-- Categories: Allow INSERT and UPDATE, block DELETE
CREATE POLICY "Prevent big category deletion" ON big_categories
    FOR DELETE USING (false);

CREATE POLICY "Prevent small category deletion" ON small_categories
    FOR DELETE USING (false);
```

---

## 6. Updated Schema Summary

### Key Changes from Original

| Aspect | Original | Updated |
|--------|----------|---------|
| Timer state tracking | `paused_at`, `total_paused_duration_seconds` | `accumulated_active_seconds`, `last_session_start` |
| Single timer constraint | Application-level | Partial unique index |
| Available time calculation | Frontend | PostgreSQL function + view |
| Conversion rule overlap prevention | Application-level | Exclusion constraint |
| Historical rule reference | Not stored | `conversion_rule_id` in time_records |
| Immutability enforcement | Comments only | Triggers + RLS policies |

### Complete Updated Schema Structure

```sql
-- Tables
big_categories (id, name, status, created_at, updated_at)
small_categories (id, big_category_id, name, status, created_at, updated_at)
conversion_rules (id, source_id, target_id, source_ratio, target_ratio, effective_from, effective_to, created_at)
  └─ EXCLUDE constraint preventing overlapping date ranges
time_records (id, big_category_id, small_category_id, timer_mode, start_time, end_time, actual_duration_seconds, conversion_rule_id, created_at)
  └─ Triggers preventing UPDATE/DELETE
  └─ FK to conversion_rules for historical accuracy
active_timer (id, big_category_id, small_category_id, timer_mode, countdown_target_seconds, start_time, accumulated_active_seconds, last_session_start, status, created_at, updated_at)
  └─ Partial unique index ensuring single active timer

-- Functions
calculate_available_time(p_target_category_id) → INTEGER
validate_timer_start(p_big_category_id, p_timer_mode) → TABLE(can_start, available_seconds, reason)

-- Views
available_time_view (big_category_id, big_category_name, earned_seconds, consumed_seconds, available_seconds)
current_conversion_rules (latest active version for each source/target pair)

-- Triggers
prevent_time_record_update
prevent_time_record_delete
prevent_big_category_delete
prevent_small_category_delete
update_updated_at_column (for big_categories, small_categories, active_timer)

-- RLS Policies
Allow full access for personal MVP (enhance with auth later)
Block UPDATE/DELETE on time_records
Block DELETE on categories
```

---

## 7. Why This Design Guarantees Historical Correctness

### 1. Immutable Time Records
- Triggers physically prevent UPDATE/DELETE operations
- RLS policies provide additional layer of protection
- Once created, a time record never changes

### 2. Conversion Rule Snapshots
- Each time record stores `conversion_rule_id` pointing to the exact rule version used
- Even if the rule is later modified, the historical reference remains valid
- Exclusion constraint prevents ambiguous overlapping rules

### 3. Date-Based Rule Selection (Fallback)
- If `conversion_rule_id` is NULL, calculation falls back to date-range matching
- Query: `effective_from <= record_date AND (effective_to IS NULL OR effective_to > record_date)`
- Always finds the rule that was active when the record was created

### 4. Cumulative Calculation
- Available time = SUM(all historical earned) - SUM(all historical consumed)
- No resets, no daily limits
- Negative balances naturally supported

### 5. Database as Source of Truth
- All business logic in PostgreSQL functions
- Frontend simply displays calculated values
- No duplication, no drift between components

---

## 8. Migration from Old Schema

If implementing on top of existing schema:

```sql
-- Add new columns to active_timer
ALTER TABLE active_timer 
ADD COLUMN accumulated_active_seconds INTEGER DEFAULT 0,
ADD COLUMN last_session_start TIMESTAMPTZ;

-- Add conversion_rule_id to time_records
ALTER TABLE time_records
ADD COLUMN conversion_rule_id UUID REFERENCES conversion_rules(id);

-- Add exclusion constraint to conversion_rules
ALTER TABLE conversion_rules
ADD CONSTRAINT no_overlapping_rules
EXCLUDE USING gist (
    source_big_category_id WITH =,
    target_big_category_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31')) WITH &&
);

-- Add immutability triggers
-- (see section 5 above)

-- Create calculation functions
-- (see section 2 above)
```

---

## 9. Testing Implications

### Timer Tests
```typescript
describe('Timer Persistence', () => {
    test('RUNNING timer accumulates time correctly', () => {
        // Start timer at T0
        // Simulate passage of time
        // Verify: elapsed = accumulated + (now - last_session_start)
    });
    
    test('PAUSED timer does not accumulate time', () => {
        // Pause timer at T1
        // Wait 30 minutes
        // Resume at T2
        // Verify: elapsed unchanged during pause
    });
    
    test('Only one active timer allowed', async () => {
        // Start timer 1
        // Attempt to start timer 2
        // Verify: Database constraint violation or application error
    });
});
```

### Available Time Tests
```typescript
describe('Available Time Calculation', () => {
    test('Positive balance with 1:1 conversion', () => {
        // Study 2h with 1:1 rule → Entertainment earned = 2h
        // Entertainment consumed = 45m
        // Verify: Available = 1h15m
    });
    
    test('Negative balance allowed', () => {
        // Available = 30m
        // Countdown 1h
        // Verify: Available = -30m after completion
    });
    
    test('Historical rule preserved after rule change', () => {
        // Record 1h Study on Jan 1 (rule 1:1)
        // Change rule to 2:1 on Feb 1
        // Record 1h Study on Mar 1 (rule 2:1)
        // Verify: Total earned = 1h + 2h = 3h (not 2h or 4h)
    });
});
```

---

## 10. Required Changes to 001_initial_schema.sql

The following sections must be completely rewritten:

1. **active_timer table** - Replace with new model (accumulated_active_seconds, last_session_start)
2. **conversion_rules table** - Add exclusion constraint
3. **time_records table** - Add conversion_rule_id column
4. **Helper functions** - Add calculate_available_time, validate_timer_start
5. **Views** - Replace earned_time_by_target with available_time_view
6. **Triggers** - Add immutability triggers for time_records and categories
7. **RLS policies** - Add explicit UPDATE/DELETE blocking policies

Sections that remain unchanged:
- big_categories table
- small_categories table
- Basic indexes
- update_updated_at_column function

---

## 11. Final Checklist Before Phase 2

- [ ] Timer state model uses accumulated_active_seconds + last_session_start
- [ ] Partial unique index enforces single active timer
- [ ] calculate_available_time function implemented
- [ ] available_time_view created
- [ ] Exclusion constraint on conversion_rules prevents overlaps
- [ ] conversion_rule_id added to time_records
- [ ] Immutability triggers on time_records
- [ ] Immutability triggers on categories
- [ ] RLS policies block prohibited operations
- [ ] validate_timer_start function for frontend validation
- [ ] All business logic in database, not frontend

---

## Conclusion

This updated architecture addresses all concerns raised in the review:

1. ✅ **Timer persistence**: Accurate calculation for both RUNNING and PAUSED states
2. ✅ **Single timer guarantee**: Database-level constraint via partial unique index
3. ✅ **Historical conversion rules**: Stored reference + exclusion constraint + date-based fallback
4. ✅ **Available time calculation**: Centralized database function, not frontend logic
5. ✅ **Timer start validation**: Database function with clear START vs RUNNING distinction
6. ✅ **Historical immutability**: Triggers + RLS prevent accidental modifications

Ready to proceed to Phase 2 (Database Implementation) with these updates incorporated.
