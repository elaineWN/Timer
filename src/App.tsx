import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { DashboardPage } from '@/components/Dashboard/DashboardPage'
import { TimerPage } from '@/components/Timer/TimerPage'
import { CategoriesPage } from '@/components/Categories/CategoriesPage'
import { ConversionRulesPage } from '@/components/Rules/ConversionRulesPage'

function Navigation() {
  const location = useLocation()
  
  const navItems = [
    { path: '/', label: '仪表盘' },
    { path: '/timer', label: '计时器' },
    { path: '/categories', label: '分类' },
    { path: '/rules', label: '规则' },
  ]
  
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-lg font-semibold text-gray-900">时间管理</span>
            </Link>
          </div>
          
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/rules" element={<ConversionRulesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
