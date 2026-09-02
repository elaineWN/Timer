# Personal Time Management Tool - Architecture Document

## Phase 1: Architecture Analysis

### 1. Project Structure

```
/workspace
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql    # Database schema
├── src/
│   ├── components/                    # React components
│   │   ├── timer/                     # Timer-related components
│   │   ├── categories/                # Category management components
│   │   ├── conversion/                # Conversion rule components
│   │   ├── statistics/                # Statistics components
│   │   └── common/                    # Reusable UI components
│   ├── hooks/                         # Custom React hooks
│   │   ├── useTimer.ts                # Timer logic with persistence
│   │   ├── useAvailableTime.ts        # Available time calculation
│   │   └── useCategories.ts           # Category management
│   ├── lib/                           # Utility libraries
│   │   ├── supabase.ts                # Supabase client configuration
│   │   ├── timeUtils.ts               # Time calculation utilities
│   │   └── conversionUtils.ts         # Conversion rule calculations
│   ├── store/                         # State management (Zustand)
│   │   └── timerStore.ts              # Timer state
│   ├── types/                         # TypeScript type definitions
│   │   └── index.ts
│   ├── pages/                         # Page components
│   │   ├── Dashboard.tsx
│   │   ├── TimerStart.tsx
│   │   ├── CategoryManagement.tsx
│   │   └── ConversionRules.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── tests/                             # Test files
│   ├── timer.test.ts
│   ├── conversion.test.ts
│   └── availableTime.test.ts
├── public/
├── .env.example                       # Environment variables template
├── .github/
│   └── workflows/
│       └── deploy.yml                 # GitHub Actions deployment
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

### 2. Database Schema Summary

The database schema (`supabase/migrations/001_initial_schema.sql`) includes:

#### Tables:
1. **big_categories**: Major time allocation areas (ACTIVE/INACTIVE status, never deleted)
2. **small_categories**: Sub-categories belonging to one Big Category
3. **conversion_rules**: Versioned rules with effective_from and effective_to dates
4. **time_records**: Immutable historical records with actual duration
5. **active_timer**: Single row for persistent timer state

#### Key Design Decisions:

1. **No physical deletion**: Big Categories use status field (ACTIVE/INACTIVE) instead of deletion
2. **Versioned conversion rules**: Each rule change creates a new version with effective_from date
3. **Immutable time records**: Once created, time_records are never modified
4. **Single active timer**: Only one row in active_timer table at any time
5. **UTC timestamps**: All timestamps stored in UTC, converted to local time in frontend

### 3. Timer Persistence Model

**Problem**: Browser-only setInterval() timers fail on page refresh/close.

**Solution**: Database-driven timer state calculation.

#### Active Timer Schema:
```sql
CREATE TABLE active_timer (
    id UUID,
    big_category_id UUID,
    small_category_id UUID,
    timer_mode VARCHAR(20), -- 'COUNT_UP' or 'COUNTDOWN'
    countdown_target_seconds INTEGER, -- NULL for COUNT_UP
    start_time TIMESTAMPTZ, -- When timer was first started
    paused_at TIMESTAMPTZ, -- NULL if currently running
    total_paused_duration_seconds INTEGER, -- Accumulated paused time
    status VARCHAR(20), -- 'RUNNING' or 'PAUSED'
    ...
);
```

#### Timer Calculation Logic:

**For COUNT_UP:**
```typescript
elapsedSeconds = (currentTime - startTime - totalPausedDuration)
if (status === 'PAUSED') {
  // paused_at is set, timer is not accumulating time
  elapsedSeconds = (paused_at - startTime - totalPausedDuration)
}
```

**For COUNTDOWN:**
```typescript
elapsedSeconds = (currentTime - startTime - totalPausedDuration)
remainingSeconds = countdown_target_seconds - elapsedSeconds
```

#### Recovery Flow:
1. On app load, query `active_timer` table
2. If a row exists, calculate current elapsed time using timestamps
3. Update UI with calculated time
4. Continue timer from calculated state

This approach ensures:
- ✅ Browser refresh preserves timer
- ✅ Browser close/reopen preserves timer
- ✅ Network interruption doesn't lose data
- ✅ Multiple tabs show consistent state

### 4. Available Time Calculation

**Formula:**
```
Available Time (for target category T) = 
  SUM(Earned Time from all source categories) - SUM(Consumed Time in T)
```

#### Earned Time Calculation:
For each conversion rule (Source → Target with ratio S:T):
```sql
SELECT 
  tr.big_category_id as source_category,
  SUM(tr.actual_duration_seconds * (target_ratio / source_ratio)) as earned_seconds
FROM time_records tr
JOIN conversion_rules cr ON tr.big_category_id = cr.source_big_category_id
WHERE cr.target_big_category_id = :targetCategoryId
  AND cr.effective_from <= tr.start_time::date
  AND (cr.effective_to IS NULL OR cr.effective_to > tr.start_time::date)
GROUP BY tr.big_category_id
```

**Key Point**: The conversion rule used is the one that was effective **at the time the source time was recorded**, not the current rule.

#### Consumed Time Calculation:
```sql
SELECT SUM(actual_duration_seconds) 
FROM time_records 
WHERE big_category_id = :targetCategoryId
```

#### Implementation Approach:
1. Frontend queries time_records and conversion_rules
2. Business logic layer calculates available time per category
3. Cache calculation result with invalidation on new time record

### 5. Conversion Rule History Handling

#### Versioning Strategy:
When user changes a conversion rule:
1. Find existing active rule (effective_to IS NULL) for same source/target pair
2. Set its effective_to to (new effective_from - 1 day)
3. Create new rule version with new effective_from and effective_to = NULL

#### Example Timeline:
```
Rule 1: 学习 → 娱乐 = 1:1, effective_from = 2026-01-01, effective_to = 2026-09-09
Rule 2: 学习 → 娱乐 = 2:1, effective_from = 2026-09-10, effective_to = NULL
```

When calculating earned entertainment time:
- Study records from Jan 1 to Sep 9 use 1:1 ratio
- Study records from Sep 10 onward use 2:1 ratio

#### SQL Query for Historical Calculation:
```sql
SELECT 
  tr.id,
  tr.actual_duration_seconds,
  cr.source_ratio,
  cr.target_ratio,
  tr.actual_duration_seconds * (cr.target_ratio / cr.source_ratio) as earned_seconds
FROM time_records tr
JOIN conversion_rules cr ON 
  tr.big_category_id = cr.source_big_category_id
  AND cr.target_big_category_id = :targetCategoryId
  AND cr.effective_from <= tr.start_time::date
  AND (cr.effective_to IS NULL OR cr.effective_to >= tr.start_time::date)
WHERE cr.target_big_category_id = :targetCategoryId
```

### 6. Business Rules Implementation Checklist

| Rule | Implementation |
|------|----------------|
| Big Categories user-defined | ✅ Database table, no hardcoded values |
| Big Categories cannot be deleted | ✅ Status field (ACTIVE/INACTIVE), no DELETE operation |
| Deactivated categories remain in history | ✅ Foreign keys use ON DELETE RESTRICT |
| Only Big→Big conversion in MVP | ✅ conversion_rules references big_categories only |
| Configurable ratios | ✅ source_ratio, target_ratio DECIMAL fields |
| All time cumulative | ✅ No daily reset, SUM from beginning |
| Negative available time allowed | ✅ No CHECK constraint preventing negative |
| Historical rules preserved | ✅ Versioned rules with effective dates |
| One active timer | ✅ Application-level lock, single row in active_timer |
| Timer survives refresh | ✅ Database persistence + timestamp calculation |
| Count Up stops at zero | ✅ Frontend check before allowing continuation |
| Countdown starts only if available > 0 | ✅ Validation on timer start |
| Countdown can exceed available | ✅ No enforcement during countdown |
| Countdown continues into negative | ✅ No automatic stop for countdown |
| Available = Earned - Consumed | ✅ Calculation function |

### 7. Technical Decisions

#### State Management: Zustand
- Lightweight alternative to Redux
- Good for timer state that needs frequent updates
- Persists to localStorage as backup

#### Supabase Client
- Use @supabase/supabase-js
- Environment variables for URL and anon key
- No service-role keys in frontend

#### Timer Precision
- Store timestamps with millisecond precision
- Calculate duration in seconds for display
- Round display to nearest second

#### Time Zone Handling
- Database: UTC (TIMESTAMPTZ)
- Frontend: Convert to local timezone for display
- Store timezone in user preferences (future enhancement)

### 8. Security Considerations

#### Current MVP (No Auth):
- RLS policies allow full access (acceptable for personal tool)
- Supabase anon key exposed (required for frontend)
- No sensitive data stored

#### Future Enhancement (With Auth):
- Enable Supabase Auth
- Add user_id foreign key to all tables
- Update RLS policies to filter by auth.uid()

### 9. Deployment Architecture

```
User Browser
     ↓
GitHub Pages (Static Frontend)
     ↓
Supabase API (Backend as a Service)
     ↓
PostgreSQL Database
```

Environment Variables Required:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

### 10. Testing Strategy

#### Unit Tests (Vitest):
- Timer calculation functions
- Available time calculation
- Conversion rule application
- Duration formatting

#### Integration Tests:
- Timer start/pause/resume/stop flow
- Category CRUD operations
- Conversion rule versioning

#### Manual Testing:
- Browser refresh during active timer
- Browser close/reopen
- Network interruption simulation

---

## Next Steps

Before implementing, please confirm:

1. **Database Schema**: Does the proposed schema meet all requirements?
2. **Timer Persistence Model**: Is the timestamp-based calculation approach acceptable?
3. **Conversion Rule History**: Is the versioning strategy clear?
4. **Available Time Calculation**: Should this be a database view or frontend calculation? (Currently planned as frontend calculation for flexibility)

Any ambiguities or concerns should be addressed before proceeding to Phase 2 (Database Implementation).
