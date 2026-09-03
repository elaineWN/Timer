import { useState, useEffect } from 'react'
import { useTimerStore, getCurrentTimerState } from '@/stores/timerStore'
import { formatDuration, formatDurationChinese } from '@/lib/utils'
import type { TimerMode } from '@/types'

export function TimerPage() {
  const { 
    activeTimer, 
    bigCategories, 
    smallCategories, 
    availableTimes,
    isLoading,
    error,
    fetchActiveTimer, 
    fetchCategories, 
    fetchAvailableTimes,
    startTimer, 
    pauseTimer, 
    resumeTimer, 
    stopTimer,
    clearError
  } = useTimerStore()

  const [timerMode, setTimerMode] = useState<TimerMode>('COUNT_UP')
  const [selectedBigCategory, setSelectedBigCategory] = useState<string>('')
  const [selectedSmallCategory, setSelectedSmallCategory] = useState<string>('')
  const [countdownMinutes, setCountdownMinutes] = useState<number>(25)
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0)

  // Load initial data
  useEffect(() => {
    fetchActiveTimer()
    fetchCategories()
    fetchAvailableTimes()
  }, [])

  // Get filtered small categories
  const filteredSmallCategories = smallCategories.filter(
    sc => sc.big_category_id === selectedBigCategory
  )

  // Get available time for selected category
  const availableTime = availableTimes.find(
    t => t.big_category_id === selectedBigCategory
  )
  const availableSeconds = availableTime?.available_seconds || 0

  // Calculate current timer display
  const timerState = getCurrentTimerState(activeTimer)
  const elapsedDisplay = timerState ? formatDuration(timerState.elapsed_seconds) : '00:00:00'
  const remainingDisplay = timerState && timerState.remaining_seconds !== null 
    ? formatDuration(timerState.remaining_seconds) 
    : '00:00:00'

  const handleStart = async () => {
    if (!selectedBigCategory) {
      alert('请选择大类')
      return
    }

    const countdownTotal = timerMode === 'COUNTDOWN' 
      ? countdownMinutes * 60 + countdownSeconds 
      : null

    const result = await startTimer({
      big_category_id: selectedBigCategory,
      small_category_id: selectedSmallCategory || null,
      timer_mode: timerMode,
      countdown_seconds: countdownTotal
    })

    if (!result.success) {
      alert(result.error || '启动失败')
    }
  }

  const handlePause = async () => {
    const result = await pauseTimer()
    if (!result.success) {
      alert(result.error || '暂停失败')
    }
  }

  const handleResume = async () => {
    const result = await resumeTimer()
    if (!result.success) {
      alert(result.error || '继续失败')
    }
  }

  const handleStop = async () => {
    const result = await stopTimer()
    if (!result.success) {
      alert(result.error || '停止失败')
    }
  }

  // If there's an active timer, show the timer UI
  if (activeTimer && (activeTimer.status === 'RUNNING' || activeTimer.status === 'PAUSED')) {
    const bigCat = bigCategories.find(c => c.id === activeTimer.big_category_id)
    const smallCat = smallCategories.find(c => c.id === activeTimer.small_category_id)

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">计时器</h1>
        
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <div className="text-center mb-6">
            <div className="text-sm text-gray-600 mb-2">
              {bigCat?.name || '未知大类'}
              {smallCat && <span className="mx-2">→</span>}
              {smallCat?.name}
            </div>
            <div className="text-xs text-gray-500 mb-4">
              {activeTimer.timer_mode === 'COUNT_UP' ? '正计时' : '倒计时'}
              {' · '}
              <span className={`px-2 py-1 rounded ${
                activeTimer.status === 'RUNNING' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {activeTimer.status === 'RUNNING' ? '运行中' : '已暂停'}
              </span>
            </div>
            
            <div className="text-6xl font-mono font-bold mb-6">
              {activeTimer.timer_mode === 'COUNT_UP' 
                ? elapsedDisplay 
                : remainingDisplay}
            </div>

            <div className="flex justify-center gap-4">
              {activeTimer.status === 'RUNNING' ? (
                <>
                  <button
                    onClick={handlePause}
                    className="px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                  >
                    暂停
                  </button>
                  <button
                    onClick={handleStop}
                    className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                  >
                    停止
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleResume}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                  >
                    继续
                  </button>
                  <button
                    onClick={handleStop}
                    className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                  >
                    停止
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>
    )
  }

  // Show timer start form
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">计时器</h1>
      
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Timer Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            计时模式
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTimerMode('COUNT_UP')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition ${
                timerMode === 'COUNT_UP'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              正计时
            </button>
            <button
              type="button"
              onClick={() => setTimerMode('COUNTDOWN')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition ${
                timerMode === 'COUNTDOWN'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              倒计时
            </button>
          </div>
        </div>

        {/* Big Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            大类
          </label>
          <select
            value={selectedBigCategory}
            onChange={(e) => {
              setSelectedBigCategory(e.target.value)
              setSelectedSmallCategory('')
            }}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">选择大类</option>
            {bigCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Small Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            小类（可选）
          </label>
          <select
            value={selectedSmallCategory}
            onChange={(e) => setSelectedSmallCategory(e.target.value)}
            disabled={!selectedBigCategory}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          >
            <option value="">选择小类</option>
            {filteredSmallCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Countdown Duration */}
        {timerMode === 'COUNTDOWN' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              倒计时时长
            </label>
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={countdownMinutes}
                  onChange={(e) => setCountdownMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500"
                  placeholder="分钟"
                />
                <span className="text-sm text-gray-500 mt-1 block">分钟</span>
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={countdownSeconds}
                  onChange={(e) => setCountdownSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500"
                  placeholder="秒"
                />
                <span className="text-sm text-gray-500 mt-1 block">秒</span>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              总计：{formatDuration(countdownMinutes * 60 + countdownSeconds)}
            </div>
          </div>
        )}

        {/* Available Time Display */}
        {selectedBigCategory && availableSeconds !== undefined && (
          <div className={`p-4 rounded-lg ${
            availableSeconds > 0 
              ? 'bg-green-50 text-green-800' 
              : availableSeconds === 0
              ? 'bg-yellow-50 text-yellow-800'
              : 'bg-red-50 text-red-800'
          }`}>
            <div className="text-sm font-medium">可用时间</div>
            <div className="text-2xl font-bold mt-1">
              {formatDurationChinese(Math.abs(availableSeconds))}
              {availableSeconds < 0 && ' (超额)'}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!selectedBigCategory || isLoading}
          className="w-full py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-lg"
        >
          {isLoading ? '加载中...' : '开始计时'}
        </button>

        {bigCategories.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            暂无可用大类，请先在<a href="/categories" className="text-blue-500 hover:underline">分类管理</a>中创建
          </div>
        )}
      </div>
    </div>
  )
}
