# 个人时间管理工具

一个轻量级的个人时间管理 Web 应用，帮助你追踪时间分配、积累可用时间并通过转换规则在不同类别间调配时间。

## 核心功能

- ⏱️ **计时器**：正计时/倒计时两种模式，状态持久化
- 📁 **分类管理**：大类和小类两层结构
- 🔄 **时间转换**： configurable 比例将一个大类时间转换为另一个大类的可用时间
- 📊 **统计分析**：今日统计、累计统计、趋势图表
- 💰 **可用时间**：自动计算每个大类的可用时间（支持负数）

## 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS
- **后端**：Supabase (PostgreSQL)
- **部署**：GitHub Pages
- **测试**：Vitest

## 快速开始

### 1. 环境准备
```bash
node --version  # 需要 v18+
npm --version   # 需要 v9+
```

### 2. 克隆项目
```bash
git clone https://github.com/elaineWN/Timer.git
cd Timer
```

### 3. 安装依赖
```bash
npm install
```

### 4. 配置环境变量
```bash
cp .env.example .env.local
# 编辑 .env.local 填入你的 Supabase 凭证
```

### 5. 启动开发
```bash
npm run dev
```
访问 http://localhost:5173

## 部署

详细部署指南请参考 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

### GitHub Pages 部署
1. 在 GitHub Settings 中配置 Actions Secrets
2. 启用 GitHub Pages (Source: GitHub Actions)
3. 推送到 main 分支自动部署

## 测试

```bash
npm test           # 运行所有测试
npm test --watch   # 监听模式
```

## 文档

- [部署指南](./DEPLOYMENT_GUIDE.md) - 完整的部署和配置流程
- [架构设计](./ARCHITECTURE.md) - 系统架构和设计决策

## License

MIT
