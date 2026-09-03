import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { DashboardPage } from '@/components/Dashboard/DashboardPage'
import { TimerPage } from '@/components/Timer/TimerPage'
import { CategoriesPage } from '@/components/Categories/CategoriesPage'
import { ConversionRulesPage } from '@/components/Rules/ConversionRulesPage'

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/rules" element={<ConversionRulesPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
