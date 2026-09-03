import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDurationChinese } from '@/lib/utils'

interface BigCategory {
  id: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
}

interface ConversionRule {
  id: string
  source_category_id: string
  target_category_id: string
  source_ratio: number
  target_ratio: number
  effective_from: string
  effective_to: string | null
  created_at: string
}

export function ConversionRulesPage() {
  const [bigCategories, setBigCategories] = useState<BigCategory[]>([])
  const [rules, setRules] = useState<ConversionRule[]>([])
  const [sourceCat, setSourceCat] = useState('')
  const [targetCat, setTargetCat] = useState('')
  const [sourceRatio, setSourceRatio] = useState<number>(1)
  const [targetRatio, setTargetRatio] = useState<number>(1)
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
    fetchRules()
  }, [])

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('big_categories')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('name')

      if (error) throw error
      setBigCategories(data || [])
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }

  const fetchRules = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('conversion_rules')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRules(data || [])
    } catch (err) {
      setError('获取规则失败')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateRule = async () => {
    setSuccessMsg(null)
    setError(null)

    if (!sourceCat || !targetCat) {
      alert('请选择源大类和目标大类')
      return
    }

    if (sourceCat === targetCat) {
      alert('源大类和目标大类不能相同')
      return
    }

    if (sourceRatio <= 0 || targetRatio <= 0) {
      alert('比率必须大于 0')
      return
    }

    try {
      // When creating a new rule, the database trigger will automatically
      // close any existing overlapping rule for the same source/target pair
      const { error } = await supabase
        .from('conversion_rules')
        .insert({
          source_category_id: sourceCat,
          target_category_id: targetCat,
          source_ratio: sourceRatio,
          target_ratio: targetRatio,
          effective_from: effectiveFrom,
          effective_to: null
        })

      if (error) {
        if (error.code === '23505') {
          alert('已存在相同有效期的规则')
        } else {
          alert('创建失败：' + error.message)
        }
        return
      }

      setSuccessMsg('规则创建成功')
      setSourceCat('')
      setTargetCat('')
      setSourceRatio(1)
      setTargetRatio(1)
      fetchRules()
    } catch (err) {
      alert('创建失败')
    }
  }

  // Group rules by source/target pair
  const ruleGroups = rules.reduce((acc, rule) => {
    const key = `${rule.source_category_id}-${rule.target_category_id}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(rule)
    return acc
  }, {} as Record<string, ConversionRule[]>)

  const getRatioDisplay = (rule: ConversionRule) => {
    // Simplify ratio display (e.g., 2:1, 1:0.5)
    return `${rule.source_ratio}:${rule.target_ratio}`
  }

  const isActiveRule = (rule: ConversionRule) => {
    return rule.effective_to === null
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">转换规则管理</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
          {successMsg}
        </div>
      )}

      {/* Create Rule Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">创建新规则</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              源大类（赚取时间）
            </label>
            <select
              value={sourceCat}
              onChange={(e) => setSourceCat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">选择源大类</option>
              {bigCategories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              目标大类（消耗时间）
            </label>
            <select
              value={targetCat}
              onChange={(e) => setTargetCat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">选择目标大类</option>
              {bigCategories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              源比率
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={sourceRatio}
              onChange={(e) => setSourceRatio(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              目标比率
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={targetRatio}
              onChange={(e) => setTargetRatio(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            生效日期
          </label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-gray-50 p-4 rounded-lg mb-4">
          <p className="text-sm text-gray-600">
            示例：如果源比率为 2，目标比率为 1，则每 2 小时源大类时间可转换为 1 小时目标大类可用时间。
          </p>
        </div>

        <button
          onClick={handleCreateRule}
          disabled={!sourceCat || !targetCat}
          className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300"
        >
          创建规则
        </button>
      </div>

      {/* Rules List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">规则历史</h2>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : Object.keys(ruleGroups).length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无转换规则</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(ruleGroups).map(([key, groupRules]) => {
              const sourceId = key.split('-')[0]
              const targetId = key.split('-')[1]
              const sourceName = bigCategories.find(c => c.id === sourceId)?.name || '未知'
              const targetName = bigCategories.find(c => c.id === targetId)?.name || '未知'

              return (
                <div key={key}>
                  <h3 className="font-medium text-gray-700 mb-2">
                    {sourceName} → {targetName}
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">比率</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">生效日期</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">结束日期</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {groupRules.map(rule => (
                          <tr key={rule.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {getRatioDisplay(rule)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {rule.effective_from}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {rule.effective_to || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded ${
                                isActiveRule(rule)
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {isActiveRule(rule) ? '当前有效' : '历史版本'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
