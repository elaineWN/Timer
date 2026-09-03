import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">仪表盘</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">欢迎使用个人时间管理工具</p>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">今日统计</span>
            <span className="text-gray-500">暂无数据</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">累计统计</span>
            <span className="text-gray-500">暂无数据</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimerPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">计时器</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">计时器功能开发中...</p>
      </div>
    </div>
  )
}

function CategoriesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">分类管理</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">分类管理功能开发中...</p>
      </div>
    </div>
  )
}

function ConversionRulesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">转换规则</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">转换规则功能开发中...</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link to="/" className="text-xl font-bold text-gray-800">
                  时间管理
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                <Link to="/" className="text-gray-600 hover:text-gray-900">
                  仪表盘
                </Link>
                <Link to="/timer" className="text-gray-600 hover:text-gray-900">
                  计时器
                </Link>
                <Link to="/categories" className="text-gray-600 hover:text-gray-900">
                  分类
                </Link>
                <Link to="/rules" className="text-gray-600 hover:text-gray-900">
                  规则
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/rules" element={<ConversionRulesPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
