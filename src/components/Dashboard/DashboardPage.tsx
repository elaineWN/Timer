import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDuration, formatDurationChinese } from '@/lib/utils'
import { useTimerStore, getCurrentTimerState } from '@/stores/timerStore'

interface TodayStat {
  big_category_id: string
  big_category_name: string
  small_category_id: string | null
  small_category_name: string | null
  total_seconds: number
}

interface AllTimeStat {
  big_category_id: string
  big_category_name: string
  total_seconds: number
  percentage: number
}

interface TrendData {
  date_value: string
  total_seconds: number
  formatted_duration?: string
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
    fetchActiveTimer()
  }, [])

  const fetchDashboardData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: todayData, error: todayError } = await supabase.rpc('get_today_statistics')
      if (todayError) throw todayError
      setTodayStats(todayData || [])

      const { data: allTimeData, error: allTimeError } = await supabase.rpc('get_all_time_statistics')
      if (allTimeError) throw allTimeError
      setAllTimeStats(allTimeData || [])

      const { data: availData, error: availError } = await supabase.rpc('get_available_time_summary')
      if (availError) throw availError
      setAvailableTimes(availData || [])

      const { data: trend7Data, error: trend7Error } = await supabase.rpc('get_daily_trend', { p_days: 7 })
      if (trend7Error) throw trend7Error
      setTrend7Days(trend7Data || [])

      const { data: trend30Data, error: trend30Error } = await supabase.rpc('get_daily_trend', { p_days: 30 })
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
    <div className="page-container">
      <div className="mb-8">
        <h1 className="page-title">仪表盘</h1>
        <p className="page-description">概览您的时间使用情况和可用时间余额</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Active Timer Section */}
      <div className="card mb-6">
        <div className="card-header">
          <h2 className="section-title mb-0">当前计时器</h2>
        </div>
        <div className="card-body">
          {activeTimer && (activeTimer.status === 'RUNNING' || activeTimer.status === 'PAUSED') ? (
            <div className="text-center py-6">
              <div className="text-sm text-gray-500 mb-3">
                <span className="font-medium text-gray-700">
                  {bigCategoryName(activeTimer.big_category_id)}
                </span>
                {activeTimer.small_category_id && (
                  <>
                    {' → '}
                    <span className="font-medium text-gray-700">
                      {smallCategoryName(activeTimer.small_category_id)}
                    </span>
                  </>
                )}
              </div>
              <div className="text-5xl font-mono font-bold text-gray-900 mb-6">
                {timerState?.elapsed_seconds !== undefined 
                  ? formatDuration(timerState.elapsed_seconds)
                  : '00:00:00'}
              </div>
              <div className="flex justify-center gap-3">
                <a
                  href="/timer"
                  className="btn-primary"
                >
                  管理计时器
                </a>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <svg className="empty-state-icon w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 mb-4">当前没有运行中的计时器</p>
              <a
                href="/timer"
                className="btn-primary"
              >
                开始计时
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Available Time Cards */}
      <div className="mb-6">
        <h2 className="section-title">可用时间</h2>
        {availableTimes.length === 0 ? (
          <div className="card">
            <div className="card-body empty-state">
              <svg className="empty-state-icon w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="empty-state-text">暂无可用时间数据（需要配置转换规则）</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTimes.map(item => (
              <div
                key={item.big_category_id}
                className={`card overflow-hidden ${
                  item.available_seconds > 0
                    ? 'border-green-200 bg-gradient-to-br from-green-50 to-white'
                    : item.available_seconds === 0
                    ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white'
                    : 'border-red-200 bg-gradient-to-br from-red-50 to-white'
                }`}
              >
                <div className="card-body pb-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    {item.big_category_name}
                  </div>
                  <div className={`text-2xl font-bold mb-3 ${
                    item.available_seconds > 0
                      ? 'text-green-700'
                      : item.available_seconds === 0
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}>
                    {formatDurationChinese(Math.abs(item.available_seconds))}
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">赚取</span>
                      <span className="font-medium">{formatDuration(item.earned_seconds)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">消费</span>
                      <span className="font-medium">{formatDuration(item.consumed_seconds)}</span>
                    </div>
                  </div>
                  {item.available_seconds < 0 && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <span className="badge badge-danger">超额使用</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Today's Statistics */}
        <div className="card">
          <div className="card-header">
            <h2 className="section-title mb-0">今日统计</h2>
          </div>
          <div className="card-body">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : todayStats.length === 0 ? (
              <div className="empty-state py-6">
                <p className="empty-state-text">今日暂无记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayStats.map(stat => (
                  <div key={stat.big_category_id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-900">{stat.big_category_name}</span>
                      {stat.small_category_name && (
                        <span className="block text-xs text-gray-500 ml-1">
                          · {stat.small_category_name}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-700 font-mono text-sm">{formatDuration(stat.total_seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* All-Time Statistics */}
        <div className="card">
          <div className="card-header">
            <h2 className="section-title mb-0">累计统计</h2>
          </div>
          <div className="card-body">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : allTimeStats.length === 0 ? (
              <div className="empty-state py-6">
                <p className="empty-state-text">暂无记录</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6 pb-6 border-b border-gray-100">
                  <div className="text-sm text-gray-500 mb-1">总记录时间</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {formatDurationChinese(totalTrackedSeconds)}
                  </div>
                </div>
                <div className="space-y-3">
                  {allTimeStats.map(stat => (
                    <div key={stat.big_category_id} className="flex justify-between items-center py-2">
                      <div>
                        <span className="font-medium text-gray-900">{stat.big_category_name}</span>
                        <div className="text-xs text-gray-500">{stat.percentage.toFixed(1)}%</div>
                      </div>
                      <span className="text-gray-700 font-mono text-sm">{formatDuration(stat.total_seconds)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="card mb-6">
        <div className="card-header">
          <h2 className="section-title mb-0">最近趋势</h2>
        </div>
        <div className="card-body">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : (
            <div className="space-y-8">
              {/* 7-Day Trend */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  近 7 天
                </h3>
                {trend7Days.length === 0 ? (
                  <div className="empty-state py-6">
                    <p className="empty-state-text">暂无数据</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-2 h-32">
                    {trend7Days.map((day, idx) => {
                      const maxVal = Math.max(...trend7Days.map(d => d.total_seconds), 1)
                      const height = (day.total_seconds / maxVal) * 100
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center group">
                          <div className="relative w-full flex justify-center mb-2">
                            <div
                              className="w-full max-w-[40px] bg-blue-100 rounded-t-md group-hover:bg-blue-200 transition-all duration-150"
                              style={{ height: `${Math.max(height, 4)}%`, minHeight: '4%' }}
                            />
                            {day.total_seconds > 0 && (
                              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {formatDuration(day.total_seconds)}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 rotate-0">
                            {day.date_value.slice(5)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 30-Day Trend */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  近 30 天
                </h3>
                {trend30Days.length === 0 ? (
                  <div className="empty-state py-6">
                    <p className="empty-state-text">暂无数据</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                    {trend30Days.map((day, idx) => {
                      const maxVal = Math.max(...trend30Days.map(d => d.total_seconds), 1)
                      const height = (day.total_seconds / maxVal) * 100
                      return (
                        <div key={idx} className="flex-shrink-0 w-3 flex flex-col items-center group">
                          <div className="relative mb-1">
                            <div
                              className="w-3 bg-green-100 rounded-t group-hover:bg-green-200 transition-all duration-150"
                              style={{ height: `${Math.max(height, 4)}%`, minHeight: '4%' }}
                            />
                            {day.total_seconds > 0 && (
                              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {formatDuration(day.total_seconds)}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper functions to get category names
function bigCategoryName(id: string): string {
  // This would ideally come from a store or context
  return id
}

function smallCategoryName(id: string): string {
  return id
}
