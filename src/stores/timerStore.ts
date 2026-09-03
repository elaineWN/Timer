import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { 
  ActiveTimer, 
  TimerMode, 
  TimerStatus, 
  BigCategory, 
  SmallCategory,
  TimeRecord,
  TimerState 
} from '@/types'
import { 
  calculateElapsedSeconds, 
  calculateRemainingSeconds,
  isCountdownComplete 
} from '@/lib/utils'

interface TimerStoreState {
  // Current active timer (if any)
  activeTimer: ActiveTimer | null
  isLoading: boolean
  error: string | null
  
  // Categories for timer start
  bigCategories: BigCategory[]
  smallCategories: SmallCategory[]
  
  // Available time for controlled categories
  availableTimes: Array<{ big_category_id: string; available_seconds: number }>
  
  // Actions
  fetchActiveTimer: () => Promise<void>
  fetchCategories: () => Promise<void>
  fetchAvailableTimes: () => Promise<void>
  startTimer: (params: {
    big_category_id: string
    small_category_id: string | null
    timer_mode: TimerMode
    countdown_seconds?: number | null
  }) => Promise<{ success: boolean; error?: string }>
  pauseTimer: () => Promise<{ success: boolean; error?: string }>
  resumeTimer: () => Promise<{ success: boolean; error?: string }>
  stopTimer: () => Promise<{ success: boolean; error?: string }>
  validateTimerStart: (bigCategoryId: string, timerMode: TimerMode, countdownSeconds?: number) => Promise<{ valid: boolean; error?: string }>
  clearError: () => void
}

// Polling interval for timer updates (in ms)
const TIMER_POLL_INTERVAL = 1000

// Auto-check interval for countdown completion and auto-stop
const AUTO_CHECK_INTERVAL = 2000

let pollIntervalId: ReturnType<typeof setInterval> | null = null
let autoCheckIntervalId: ReturnType<typeof setInterval> | null = null

export const useTimerStore = create<TimerStoreState>((set, get) => ({
  activeTimer: null,
  isLoading: false,
  error: null,
  bigCategories: [],
  smallCategories: [],
  availableTimes: [],

  fetchActiveTimer: async () => {
    try {
      const { data, error } = await supabase
        .from('active_timer')
        .select('*')
        .in('status', ['RUNNING', 'PAUSED'])
        .maybeSingle()

      if (error) throw error
      set({ activeTimer: data })
    } catch (err) {
      console.error('Failed to fetch active timer:', err)
      set({ error: '获取定时器失败' })
    }
  },

  fetchCategories: async () => {
    try {
      // Fetch big categories
      const { data: bigCats, error: bigCatError } = await supabase
        .from('big_categories')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })

      if (bigCatError) throw bigCatError

      // Fetch small categories
      const { data: smallCats, error: smallCatError } = await supabase
        .from('small_categories')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })

      if (smallCatError) throw smallCatError

      set({ 
        bigCategories: bigCats || [], 
        smallCategories: smallCats || [] 
      })
    } catch (err) {
      console.error('Failed to fetch categories:', err)
      set({ error: '获取分类失败' })
    }
  },

  fetchAvailableTimes: async () => {
    try {
      const { data, error } = await supabase
        .from('available_time_view')
        .select('*')

      if (error) throw error
      set({ availableTimes: data || [] })
    } catch (err) {
      console.error('Failed to fetch available times:', err)
    }
  },

  validateTimerStart: async (bigCategoryId, timerMode, countdownSeconds) => {
    try {
      // Call the database validation function
      const { data, error } = await supabase.rpc('validate_timer_start', {
        p_big_category_id: bigCategoryId,
        p_timer_mode: timerMode,
        p_countdown_seconds: countdownSeconds || null
      })

      if (error) {
        return { valid: false, error: error.message }
      }

      return { valid: true }
    } catch (err) {
      console.error('Validation error:', err)
      return { valid: false, error: '验证失败' }
    }
  },

  startTimer: async (params) => {
    const { big_category_id, small_category_id, timer_mode, countdown_seconds } = params
    
    try {
      // First validate that we can start a timer for this category
      const validation = await get().validateTimerStart(big_category_id, timer_mode, countdown_seconds || undefined)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Check if there's already an active timer
      const existingTimer = get().activeTimer
      if (existingTimer && (existingTimer.status === 'RUNNING' || existingTimer.status === 'PAUSED')) {
        return { success: false, error: '已有正在运行的定时器' }
      }

      // Create the active timer record
      const now = new Date().toISOString()
      
      const { data, error } = await supabase
        .from('active_timer')
        .insert({
          big_category_id,
          small_category_id,
          timer_mode,
          countdown_target_seconds: timer_mode === 'COUNTDOWN' ? (countdown_seconds || 0) : null,
          start_time: now,
          accumulated_active_seconds: 0,
          last_session_start: now,
          total_paused_duration_seconds: 0,
          status: 'RUNNING'
        })
        .select()
        .single()

      if (error) {
        // Check for unique constraint violation (another timer started concurrently)
        if (error.code === '23505') {
          return { success: false, error: '已有其他定时器启动' }
        }
        throw error
      }

      set({ activeTimer: data })
      
      // Start polling for timer updates
      startPolling()
      startAutoCheck()
      
      return { success: true }
    } catch (err) {
      console.error('Failed to start timer:', err)
      return { success: false, error: '启动定时器失败' }
    }
  },

  pauseTimer: async () => {
    const activeTimer = get().activeTimer
    if (!activeTimer || activeTimer.status !== 'RUNNING') {
      return { success: false, error: '没有正在运行的定时器' }
    }

    try {
      // Calculate elapsed time before pausing
      const elapsedSeconds = calculateElapsedSeconds(
        activeTimer.accumulated_active_seconds,
        activeTimer.last_session_start,
        'RUNNING'
      )

      const now = new Date().toISOString()
      
      const { data, error } = await supabase
        .from('active_timer')
        .update({
          status: 'PAUSED',
          accumulated_active_seconds: elapsedSeconds,
          last_session_start: null,
          updated_at: now
        })
        .eq('id', activeTimer.id)
        .select()
        .single()

      if (error) throw error

      set({ activeTimer: data })
      return { success: true }
    } catch (err) {
      console.error('Failed to pause timer:', err)
      return { success: false, error: '暂停定时器失败' }
    }
  },

  resumeTimer: async () => {
    const activeTimer = get().activeTimer
    if (!activeTimer || activeTimer.status !== 'PAUSED') {
      return { success: false, error: '没有已暂停的定时器' }
    }

    try {
      const now = new Date().toISOString()
      
      const { data, error } = await supabase
        .from('active_timer')
        .update({
          status: 'RUNNING',
          last_session_start: now,
          updated_at: now
        })
        .eq('id', activeTimer.id)
        .select()
        .single()

      if (error) throw error

      set({ activeTimer: data })
      startPolling()
      startAutoCheck()
      return { success: true }
    } catch (err) {
      console.error('Failed to resume timer:', err)
      return { success: false, error: '继续定时器失败' }
    }
  },

  stopTimer: async () => {
    const activeTimer = get().activeTimer
    if (!activeTimer) {
      return { success: false, error: '没有活动的定时器' }
    }

    try {
      // Calculate final elapsed time
      const elapsedSeconds = calculateElapsedSeconds(
        activeTimer.accumulated_active_seconds,
        activeTimer.last_session_start,
        activeTimer.status
      )

      const now = new Date().toISOString()
      const startTime = activeTimer.start_time

      // Skip creating record if duration is 0
      if (elapsedSeconds <= 0) {
        // Just clear the timer without creating a record
        await supabase.from('active_timer').delete().eq('id', activeTimer.id)
        set({ activeTimer: null })
        stopPolling()
        stopAutoCheck()
        return { success: true }
      }

      // Create the time record
      const { data: timeRecord, error: recordError } = await supabase
        .from('time_records')
        .insert({
          big_category_id: activeTimer.big_category_id,
          small_category_id: activeTimer.small_category_id,
          timer_mode: activeTimer.timer_mode,
          start_time: startTime,
          end_time: now,
          actual_duration_seconds: elapsedSeconds,
          paused_duration_seconds: activeTimer.total_paused_duration_seconds,
          conversion_rule_id: null // Will be calculated based on effective rule at time of record
        })
        .select()
        .single()

      if (recordError) throw recordError

      // Delete the active timer
      const { error: deleteError } = await supabase
        .from('active_timer')
        .delete()
        .eq('id', activeTimer.id)

      if (deleteError) throw deleteError

      set({ activeTimer: null })
      stopPolling()
      stopAutoCheck()
      
      // Refresh available times after stopping
      await get().fetchAvailableTimes()
      
      return { success: true }
    } catch (err) {
      console.error('Failed to stop timer:', err)
      return { success: false, error: '停止定时器失败' }
    }
  },

  clearError: () => set({ error: null }),
}))

// Start polling timer state
function startPolling() {
  if (pollIntervalId) return
  
  pollIntervalId = setInterval(async () => {
    const { fetchActiveTimer, activeTimer } = useTimerStore.getState()
    
    // Only poll if there's an active timer
    if (activeTimer && (activeTimer.status === 'RUNNING' || activeTimer.status === 'PAUSED')) {
      await fetchActiveTimer()
    }
  }, TIMER_POLL_INTERVAL)
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

// Auto-check for countdown completion and Count Up auto-stop
function startAutoCheck() {
  if (autoCheckIntervalId) return
  
  autoCheckIntervalId = setInterval(async () => {
    const state = useTimerStore.getState()
    const { activeTimer, stopTimer, fetchAvailableTimes } = state
    
    if (!activeTimer || activeTimer.status !== 'RUNNING') return

    // Check for countdown completion
    if (activeTimer.timer_mode === 'COUNTDOWN' && activeTimer.countdown_target_seconds !== null) {
      const complete = isCountdownComplete(
        activeTimer.countdown_target_seconds,
        activeTimer.accumulated_active_seconds,
        activeTimer.last_session_start,
        'RUNNING'
      )
      
      if (complete) {
        // Auto-complete the countdown
        await stopTimer()
        return
      }
    }

    // Check for Count Up auto-stop when available time reaches 0
    if (activeTimer.timer_mode === 'COUNT_UP') {
      const availableTime = state.availableTimes.find(
        t => t.big_category_id === activeTimer.big_category_id
      )
      
      if (availableTime && availableTime.available_seconds <= 0) {
        // Auto-stop the Count Up timer
        await stopTimer()
        return
      }
    }
  }, AUTO_CHECK_INTERVAL)
}

function stopAutoCheck() {
  if (autoCheckIntervalId) {
    clearInterval(autoCheckIntervalId)
    autoCheckIntervalId = null
  }
}

// Cleanup on unmount (for React environments)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    stopPolling()
    stopAutoCheck()
  })
}

// Helper to get current timer state with calculated values
export function getCurrentTimerState(activeTimer: ActiveTimer | null): TimerState | null {
  if (!activeTimer) return null
  
  const elapsedSeconds = calculateElapsedSeconds(
    activeTimer.accumulated_active_seconds,
    activeTimer.last_session_start,
    activeTimer.status
  )
  
  let remainingSeconds: number | null = null
  if (activeTimer.timer_mode === 'COUNTDOWN' && activeTimer.countdown_target_seconds !== null) {
    remainingSeconds = calculateRemainingSeconds(
      activeTimer.countdown_target_seconds,
      activeTimer.accumulated_active_seconds,
      activeTimer.last_session_start,
      activeTimer.status
    )
  }
  
  return {
    id: activeTimer.id,
    big_category_id: activeTimer.big_category_id,
    small_category_id: activeTimer.small_category_id,
    timer_mode: activeTimer.timer_mode,
    countdown_target_seconds: activeTimer.countdown_target_seconds,
    elapsed_seconds: elapsedSeconds,
    remaining_seconds: remainingSeconds,
    status: activeTimer.status,
  }
}
