import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDuration,
  formatDurationChinese,
  calculateElapsedSeconds,
  calculateRemainingSeconds,
  isCountdownComplete,
  parseDurationToSeconds,
} from '@/lib/utils'

describe('formatDuration', () => {
  it('formats seconds to MM:SS when less than an hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(59)).toBe('00:59')
    expect(formatDuration(60)).toBe('01:00')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('formats seconds to HH:MM:SS when an hour or more', () => {
    expect(formatDuration(3600)).toBe('01:00:00')
    expect(formatDuration(3661)).toBe('01:01:01')
    expect(formatDuration(7384)).toBe('02:03:04')
  })
})

describe('formatDurationChinese', () => {
  it('formats seconds to Chinese text', () => {
    expect(formatDurationChinese(0)).toBe('0 秒')
    expect(formatDurationChinese(30)).toBe('30 秒')
    expect(formatDurationChinese(60)).toBe('1 分钟')
    expect(formatDurationChinese(90)).toBe('1 分钟 30 秒')
    expect(formatDurationChinese(3600)).toBe('1 小时')
    expect(formatDurationChinese(3661)).toBe('1 小时 1 分钟 1 秒')
    expect(formatDurationChinese(7384)).toBe('2 小时 3 分钟 4 秒')
  })
})

describe('calculateElapsedSeconds', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(mockNow)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns accumulated seconds when paused', () => {
    const result = calculateElapsedSeconds(1800, null, 'PAUSED')
    expect(result).toBe(1800) // 30 minutes
  })

  it('returns accumulated seconds when running but no session start', () => {
    const result = calculateElapsedSeconds(1800, null, 'RUNNING')
    expect(result).toBe(1800)
  })

  it('calculates elapsed time for running timer', () => {
    const sessionStart = new Date('2024-01-01T11:50:00Z').toISOString() // 10 minutes before now
    const result = calculateElapsedSeconds(1800, sessionStart, 'RUNNING')
    expect(result).toBeGreaterThanOrEqual(2400) // 1800 + 600 (10 min)
  })

  it('handles accumulated time plus current session', () => {
    const sessionStart = new Date('2024-01-01T11:55:00Z').toISOString() // 5 minutes before now
    const result = calculateElapsedSeconds(3600, sessionStart, 'RUNNING')
    expect(result).toBeGreaterThanOrEqual(3900) // 3600 + 300 (5 min)
  })
})

describe('calculateRemainingSeconds', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(mockNow)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates remaining time for countdown', () => {
    const sessionStart = new Date('2024-01-01T11:55:00Z').toISOString() // 5 minutes elapsed
    const result = calculateRemainingSeconds(1800, 0, sessionStart, 'RUNNING') // 30 min target
    expect(result).toBeLessThanOrEqual(1500) // ~25 minutes remaining
  })

  it('returns 0 when countdown is complete', () => {
    const sessionStart = new Date('2024-01-01T11:00:00Z').toISOString() // 1 hour elapsed
    const result = calculateRemainingSeconds(1800, 0, sessionStart, 'RUNNING') // 30 min target
    expect(result).toBe(0)
  })

  it('uses accumulated seconds when paused', () => {
    const result = calculateRemainingSeconds(3600, 1800, null, 'PAUSED') // 1 hour target, 30 min elapsed
    expect(result).toBe(1800)
  })
})

describe('isCountdownComplete', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(mockNow)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when countdown is not complete', () => {
    const sessionStart = new Date('2024-01-01T11:55:00Z').toISOString() // 5 minutes elapsed
    const result = isCountdownComplete(1800, 0, sessionStart, 'RUNNING') // 30 min target
    expect(result).toBe(false)
  })

  it('returns true when countdown is complete', () => {
    const sessionStart = new Date('2024-01-01T11:00:00Z').toISOString() // 1 hour elapsed
    const result = isCountdownComplete(1800, 0, sessionStart, 'RUNNING') // 30 min target
    expect(result).toBe(true)
  })

  it('returns false when paused before completion', () => {
    const result = isCountdownComplete(3600, 1800, null, 'PAUSED') // 1 hour target, 30 min elapsed
    expect(result).toBe(false)
  })

  it('returns true when paused at completion', () => {
    const result = isCountdownComplete(1800, 1800, null, 'PAUSED') // 30 min target, 30 min elapsed
    expect(result).toBe(true)
  })
})

describe('parseDurationToSeconds', () => {
  it('parses MM:SS format', () => {
    expect(parseDurationToSeconds('00:00')).toBe(0)
    expect(parseDurationToSeconds('01:00')).toBe(60)
    expect(parseDurationToSeconds('30:00')).toBe(1800)
    expect(parseDurationToSeconds('01:30')).toBe(90)
  })

  it('parses HH:MM:SS format', () => {
    expect(parseDurationToSeconds('00:00:00')).toBe(0)
    expect(parseDurationToSeconds('01:00:00')).toBe(3600)
    expect(parseDurationToSeconds('01:30:00')).toBe(5400)
    expect(parseDurationToSeconds('02:03:04')).toBe(7384)
  })

  it('handles invalid input', () => {
    expect(parseDurationToSeconds('')).toBe(0)
    expect(parseDurationToSeconds('invalid')).toBe(0)
  })
})
