// Timer Mode
export type TimerMode = 'COUNT_UP' | 'COUNTDOWN'

// Timer Status
export type TimerStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'STOPPED'

// Big Category Status
export type CategoryStatus = 'ACTIVE' | 'INACTIVE'

// Big Category
export interface BigCategory {
  id: string
  name: string
  status: CategoryStatus
  created_at: string
  updated_at: string
}

// Small Category
export interface SmallCategory {
  id: string
  big_category_id: string
  name: string
  status: CategoryStatus
  created_at: string
  updated_at: string
}

// Conversion Rule
export interface ConversionRule {
  id: string
  source_big_category_id: string
  target_big_category_id: string
  source_ratio: number
  target_ratio: number
  effective_from: string
  effective_to: string | null
  created_at: string
}

// Time Record
export interface TimeRecord {
  id: string
  big_category_id: string
  small_category_id: string | null
  timer_mode: TimerMode
  start_time: string
  end_time: string
  actual_duration_seconds: number
  paused_duration_seconds: number
  conversion_rule_id: string | null
  created_at: string
}

// Active Timer
export interface ActiveTimer {
  id: string
  big_category_id: string
  small_category_id: string | null
  timer_mode: TimerMode
  countdown_target_seconds: number | null
  start_time: string
  accumulated_active_seconds: number
  last_session_start: string | null
  total_paused_duration_seconds: number
  status: TimerStatus
  created_at: string
  updated_at: string
}

// Timer State for UI (calculated from ActiveTimer)
export interface TimerState {
  id: string
  big_category_id: string
  small_category_id: string | null
  timer_mode: TimerMode
  countdown_target_seconds: number | null
  elapsed_seconds: number // Calculated current elapsed time
  remaining_seconds: number | null // For countdown only
  status: TimerStatus
  big_category?: BigCategory
  small_category?: SmallCategory
}

// Available Time
export interface AvailableTime {
  big_category_id: string
  big_category_name: string
  available_seconds: number
}

// Time Statistics
export interface TimeStats {
  big_category_id: string
  big_category_name: string
  total_seconds: number
  small_categories?: Array<{
    small_category_id: string
    small_category_name: string
    total_seconds: number
  }>
}

// Timer Start Parameters
export interface TimerStartParams {
  big_category_id: string
  small_category_id: string | null
  timer_mode: TimerMode
  countdown_seconds?: number | null
}
