// Format seconds to HH:MM:SS or MM:SS
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Format seconds to readable Chinese text
export function formatDurationChinese(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} 秒`)
  
  return parts.join(' ')
}

// Calculate elapsed time from active timer data
export function calculateElapsedSeconds(
  accumulatedActiveSeconds: number,
  lastSessionStart: string | null,
  status: 'RUNNING' | 'PAUSED'
): number {
  if (status === 'PAUSED' || lastSessionStart === null) {
    return accumulatedActiveSeconds
  }
  
  const sessionStart = new Date(lastSessionStart).getTime()
  const now = Date.now()
  const currentSessionSeconds = Math.floor((now - sessionStart) / 1000)
  
  return accumulatedActiveSeconds + currentSessionSeconds
}

// Calculate remaining time for countdown
export function calculateRemainingSeconds(
  targetSeconds: number,
  accumulatedActiveSeconds: number,
  lastSessionStart: string | null,
  status: 'RUNNING' | 'PAUSED'
): number {
  const elapsed = calculateElapsedSeconds(accumulatedActiveSeconds, lastSessionStart, status)
  return Math.max(0, targetSeconds - elapsed)
}

// Check if countdown is complete
export function isCountdownComplete(
  targetSeconds: number,
  accumulatedActiveSeconds: number,
  lastSessionStart: string | null,
  status: 'RUNNING' | 'PAUSED'
): boolean {
  const elapsed = calculateElapsedSeconds(accumulatedActiveSeconds, lastSessionStart, status)
  return elapsed >= targetSeconds
}

// Parse duration string (e.g., "01:30:00" or "90:00") to seconds
export function parseDurationToSeconds(durationStr: string): number {
  const parts = durationStr.split(':').map(p => parseInt(p, 10))
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + (parts[1] || 0)
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
  }
  
  return 0
}

// Convert ratio to display string (e.g., "2:1")
export function formatRatio(sourceRatio: number, targetRatio: number): string {
  // Simplify the ratio
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const sourceInt = Math.round(sourceRatio * 100)
  const targetInt = Math.round(targetRatio * 100)
  const divisor = gcd(sourceInt, targetInt)
  
  return `${sourceInt / divisor}:${targetInt / divisor}`
}
