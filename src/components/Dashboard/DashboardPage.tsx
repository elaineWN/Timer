import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDuration, formatDurationChinese } from '@/lib/utils'
import { useTimerStore, getCurrentTimerState } from '@/stores/timerStore'

interface TodayStat {
  big_category_id: string
  big_category_name: string
  total_seconds: number
}

interface AllTimeStat {
  big_category_id: string
  big_category_name: string
  total_seconds: number
  percentage: number
}

interface TrendData {
  date: string
  total_seconds: number
}

interface AvailableTimeData {
  big_category_id: string
  big_category_name: string
  earned_seconds: number
  consumed_seconds: number
  available_seconds: number
}

export function DashboardPage() {
  const { activeTimer, fetchActiveTimer } = useTimerStore()
  const [todayStats, setTodayStats] = useState<TodayStat[]>([])
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStat[]>([])
  const [availableTimes, setAvailableTimes] = useState<AvailableTimeData[]>([])
  const [trend7Days, setTrend7Days] = useState<TrendData[]>([])
  const [trend30Days, setTrend30Days] = useState<TrendData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
    // Refresh timer state
    fetchActiveTimer()
  }, [])

  const fetchDashboardData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch today's statistics
      const { data: todayData, error: todayError } = await supabase.rpc('get_today_statistics')
      if (todayError) throw todayError
      setTodayStats(todayData || [])

      // Fetch all-time statistics
      const { data: allTimeData, error: allTimeError } = await supabase.rpc('get_all_time_statistics')
      if (allTimeError) throw allTimeError
      setAllTimeStats(allTimeData || [])

      // Fetch available time summary
      const { data: availData, error: availError } = await supabase.rpc('get_available_time_summary')
      if (availError) throw availError
      setAvailableTimes(availData || [])

      // Fetch 7-day trend
      const { data: trend7Data, error: trend7Error } = await supabase.rpc('get_daily_trend', { 
        p_days: 7 
      })
      if (trend7Error) throw trend7Error
      setTrend7Days(trend7Data || [])

      // Fetch 30-day trend
      const { data: trend30Data, error: trend30Error } = await supabase.rpc('get_daily_trend', { 
        p_days: 30 
      })
      if (trend30Error) throw trend30Error
      setTrend30Days(trend30Data || [])

    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
      setError('获取数据失败，请检查数据库连接')
    } finally {
      setIsLoading(false)
    }
  }

  const timerState = getCurrentTimerState(activeTimer)
  const totalTrackedSeconds = allTimeStats.reduce((sum, s) => sum + s.total_seconds, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Active Timer Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">当前计时器</h2>
        {activeTimer && (activeTimer.status === 'RUNNING' || activeTimer.status === 'PAUSED') ? (
          <div className="text-center py-4">
            <div className="text-sm text-gray-600 mb-2">
              大类 ID: {activeTimer.big_category_id}
              {activeTimer.small_category_id && ` → 小类 ID: ${activeTimer.small_category_id}`}
            </div>
            <div className="text-4xl font-mono font-bold mb-4">
              {timerState?.elapsed_seconds !== undefined 
                ? formatDuration(timerState.elapsed_seconds)
                : '00:00:00'}
            </div>
            <div className="flex justify-center gap-4">
              <a
                href="/timer"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                管理计时器
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-4">当前没有运行中的计时器</p>
            <a
              href="/timer"
              className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              开始计时
            </a>
          </div>
        )}
      </div>

      {/* Available Time Cards */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">可用时间</h2>
        {availableTimes.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            暂无可用时间数据（需要配置转换规则）
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTimes.map(item => (
              <div
                key={item.big_category_id}
                className={`rounded-lg shadow p-4 ${
                  item.available_seconds > 0
                    ? 'bg-green-50 border border-green-200'
                    : item.available_seconds === 0
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="text-sm font-medium text-gray-700 mb-2">
                  {item.big_category_name}
                </div>
                <div className="text-2xl font-bold mb-2">
                  {formatDurationChinese(Math.abs(item.available_seconds))}
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>赚取：</span>
                    <span>{formatDuration(item.earned_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>消费：</span>
                    <span>{formatDuration(item.consumed_seconds)}</span>
                  </div>
                </div>
                {item.available_seconds < 0 && (
                  <div className="text-xs text-red-600 mt-2">超额</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Statistics */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">今日统计</h2>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : todayStats.length === 0 ? (
          <div className="text-center py-8 text-gray-500">今日暂无记录</div>
        ) : (
          <div className="space-y-3">
            {todayStats.map(stat => (
              <div key={stat.big_category_id} className="flex justify-between items-center">
                <span className="font-medium">{stat.big_category_name}</span>
                <span className="text-gray-700">{formatDuration(stat.total_seconds)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All-Time Statistics */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">累计统计</h2>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : allTimeStats.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无记录</div>
        ) : (
          <>
            <div className="text-center mb-6 pb-4 border-b">
              <div className="text-sm text-gray-600">总记录时间</div>
              <div className="text-3xl font-bold text-gray-900">
                {formatDurationChinese(totalTrackedSeconds)}
              </div>
            </div>
            <div className="space-y-3">
              {allTimeStats.map(stat => (
                <div key={stat.big_category_id} className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{stat.big_category_name}</span>
                    <div className="text-xs text-gray-500">{stat.percentage.toFixed(1)}%</div>
                  </div>
                  <span className="text-gray-700">{formatDuration(stat.total_seconds)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Trends */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">最近趋势</h2>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : (
          <div className="space-y-6">
            {/* 7-Day Trend */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">近 7 天</h3>
              <div className="flex items-end gap-2 h-32">
                {trend7Days.map((day, idx) => {
                  const maxVal = Math.max(...trend7Days.map(d => d.total_seconds), 1)
                  const height = (day.total_seconds / maxVal) * 100
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-blue-200 rounded-t transition-all"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={formatDuration(day.total_seconds)}
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {day.date.slice(5)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 30-Day Trend */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">近 30 天</h3>
              <div className="flex items-end gap-1 h-32 overflow-x-auto">
                {trend30Days.map((day, idx) => {
                  const maxVal = Math.max(...trend30Days.map(d => d.total_seconds), 1)
                  const height = (day.total_seconds / maxVal) * 100
                  return (
                    <div key={idx} className="flex-shrink-0 w-4 flex flex-col items-center">
                      <div
                        className="w-full bg-green-200 rounded-t"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${day.date}: ${formatDuration(day.total_seconds)}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
