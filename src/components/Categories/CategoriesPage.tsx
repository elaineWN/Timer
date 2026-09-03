import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface BigCategory {
  id: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
}

interface SmallCategory {
  id: string
  big_category_id: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
}

export function CategoriesPage() {
  const [bigCategories, setBigCategories] = useState<BigCategory[]>([])
  const [smallCategories, setSmallCategories] = useState<SmallCategory[]>([])
  const [selectedBigCategory, setSelectedBigCategory] = useState<string>('')
  const [newBigCatName, setNewBigCatName] = useState('')
  const [newSmallCatName, setNewSmallCatName] = useState('')
  const [editingBigCat, setEditingBigCat] = useState<string | null>(null)
  const [editingSmallCat, setEditingSmallCat] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    setIsLoading(true)
    try {
      // Fetch all big categories (including inactive for management)
      const { data: bigCats, error: bigError } = await supabase
        .from('big_categories')
        .select('*')
        .order('created_at', { ascending: true })

      if (bigError) throw bigError

      // Fetch all small categories
      const { data: smallCats, error: smallError } = await supabase
        .from('small_categories')
        .select('*')
        .order('created_at', { ascending: true })

      if (smallError) throw smallError

      setBigCategories(bigCats || [])
      setSmallCategories(smallCats || [])
    } catch (err) {
      setError('获取分类失败')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const createBigCategory = async () => {
    if (!newBigCatName.trim()) {
      alert('请输入大类名称')
      return
    }

    try {
      const { error } = await supabase
        .from('big_categories')
        .insert({
          name: newBigCatName.trim(),
          status: 'ACTIVE'
        })

      if (error) {
        if (error.code === '23505') {
          alert('已存在同名的大类')
        } else {
          alert('创建失败：' + error.message)
        }
        return
      }

      setNewBigCatName('')
      fetchCategories()
    } catch (err) {
      alert('创建失败')
    }
  }

  const updateBigCategory = async (id: string, newName: string) => {
    if (!newName.trim()) {
      alert('名称不能为空')
      return
    }

    try {
      const { error } = await supabase
        .from('big_categories')
        .update({ name: newName.trim() })
        .eq('id', id)

      if (error) {
        if (error.code === '23505') {
          alert('已存在同名的大类')
        } else {
          alert('更新失败：' + error.message)
        }
        return
      }

      setEditingBigCat(null)
      fetchCategories()
    } catch (err) {
      alert('更新失败')
    }
  }

  const toggleBigCategoryStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    
    try {
      const { error } = await supabase
        .from('big_categories')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) {
        alert('操作失败：' + error.message)
        return
      }

      fetchCategories()
    } catch (err) {
      alert('操作失败')
    }
  }

  const createSmallCategory = async () => {
    if (!selectedBigCategory) {
      alert('请先选择所属大类')
      return
    }

    if (!newSmallCatName.trim()) {
      alert('请输入小类名称')
      return
    }

    try {
      const { error } = await supabase
        .from('small_categories')
        .insert({
          big_category_id: selectedBigCategory,
          name: newSmallCatName.trim(),
          status: 'ACTIVE'
        })

      if (error) {
        if (error.code === '23505') {
          alert('该大类下已存在同名的小类')
        } else {
          alert('创建失败：' + error.message)
        }
        return
      }

      setNewSmallCatName('')
      fetchCategories()
    } catch (err) {
      alert('创建失败')
    }
  }

  const updateSmallCategory = async (id: string, newName: string) => {
    if (!newName.trim()) {
      alert('名称不能为空')
      return
    }

    try {
      const { error } = await supabase
        .from('small_categories')
        .update({ name: newName.trim() })
        .eq('id', id)

      if (error) {
        if (error.code === '23505') {
          alert('该大类下已存在同名的小类')
        } else {
          alert('更新失败：' + error.message)
        }
        return
      }

      setEditingSmallCat(null)
      fetchCategories()
    } catch (err) {
      alert('更新失败')
    }
  }

  const toggleSmallCategoryStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    
    try {
      const { error } = await supabase
        .from('small_categories')
        .update({ status: newStatus })
        .eq('id', id)

      if (error) {
        alert('操作失败：' + error.message)
        return
      }

      fetchCategories()
    } catch (err) {
      alert('操作失败')
    }
  }

  const filteredSmallCategories = smallCategories.filter(
    sc => sc.big_category_id === selectedBigCategory
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">分类管理</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Big Categories Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">大类管理</h2>

        {/* Create Big Category */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newBigCatName}
            onChange={(e) => setNewBigCatName(e.target.value)}
            placeholder="输入大类名称"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && createBigCategory()}
          />
          <button
            onClick={createBigCategory}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            添加大类
          </button>
        </div>

        {/* Big Category List */}
        <div className="space-y-2">
          {bigCategories.map(cat => (
            <div
              key={cat.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                cat.status === 'ACTIVE' 
                  ? 'border-gray-200 bg-white' 
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                {editingBigCat === cat.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-2 py-1"
                    autoFocus
                    onBlur={() => updateBigCategory(cat.id, editName)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        updateBigCategory(cat.id, editName)
                      } else if (e.key === 'Escape') {
                        setEditingBigCat(null)
                      }
                    }}
                  />
                ) : (
                  <>
                    <span className="font-medium">{cat.name}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      cat.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {cat.status === 'ACTIVE' ? '启用' : '停用'}
                    </span>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingBigCat(cat.id)
                    setEditName(cat.name)
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  重命名
                </button>
                <button
                  onClick={() => toggleBigCategoryStatus(cat.id, cat.status)}
                  className={`text-sm ${
                    cat.status === 'ACTIVE'
                      ? 'text-red-600 hover:text-red-800'
                      : 'text-green-600 hover:text-green-800'
                  }`}
                >
                  {cat.status === 'ACTIVE' ? '停用' : '启用'}
                </button>
              </div>
            </div>
          ))}

          {bigCategories.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              暂无大类，请添加
            </div>
          )}
        </div>
      </div>

      {/* Small Categories Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">小类管理</h2>

        {/* Select Big Category */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择所属大类
          </label>
          <select
            value={selectedBigCategory}
            onChange={(e) => setSelectedBigCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择大类</option>
            {bigCategories.filter(bc => bc.status === 'ACTIVE').map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Create Small Category */}
        {selectedBigCategory && (
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newSmallCatName}
              onChange={(e) => setNewSmallCatName(e.target.value)}
              placeholder="输入小类名称"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && createSmallCategory()}
            />
            <button
              onClick={createSmallCategory}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              添加小类
            </button>
          </div>
        )}

        {/* Small Category List */}
        {selectedBigCategory && (
          <div className="space-y-2">
            {filteredSmallCategories.map(cat => (
              <div
                key={cat.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  cat.status === 'ACTIVE' 
                    ? 'border-gray-200 bg-white' 
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {editingSmallCat === cat.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1"
                      autoFocus
                      onBlur={() => updateSmallCategory(cat.id, editName)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          updateSmallCategory(cat.id, editName)
                        } else if (e.key === 'Escape') {
                          setEditingSmallCat(null)
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="font-medium">{cat.name}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        cat.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {cat.status === 'ACTIVE' ? '启用' : '停用'}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingSmallCat(cat.id)
                      setEditName(cat.name)
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    重命名
                  </button>
                  <button
                    onClick={() => toggleSmallCategoryStatus(cat.id, cat.status)}
                    className={`text-sm ${
                      cat.status === 'ACTIVE'
                        ? 'text-red-600 hover:text-red-800'
                        : 'text-green-600 hover:text-green-800'
                    }`}
                  >
                    {cat.status === 'ACTIVE' ? '停用' : '启用'}
                  </button>
                </div>
              </div>
            ))}

            {filteredSmallCategories.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                该大类下暂无小类
              </div>
            )}
          </div>
        )}

        {!selectedBigCategory && (
          <div className="text-center text-gray-500 py-8">
            请先选择一个大类来管理其小类
          </div>
        )}
      </div>
    </div>
  )
}
