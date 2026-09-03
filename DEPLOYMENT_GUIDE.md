# 个人时间管理工具 - 部署与配置指南

## 目录
1. [环境准备](#1-环境准备)
2. [Supabase 数据库配置](#2-supabase-数据库配置)
3. [本地开发](#3-本地开发)
4. [GitHub Pages 部署](#4-github-pages-部署)
5. [常见问题](#5-常见问题)

---

## 1. 环境准备

### 必需软件
- **Node.js** v18+ 
- **npm** v9+
- **Git** v2+

验证安装：
```bash
node --version
npm --version
git --version
```

---

## 2. Supabase 数据库配置

### 2.1 创建项目
1. 访问 [supabase.com](https://supabase.com)
2. 点击 **New Project**
3. 填写项目信息并选择区域
4. 等待项目激活（约 2-3 分钟）

### 2.2 获取凭证
1. 进入 **Settings** → **API**
2. 记录：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGci...`

⚠️ **只使用 anon key，不要使用 service_role key**

### 2.3 初始化数据库
1. 进入 **SQL Editor**
2. 复制 `supabase/migrations/001_initial_schema.sql` 全部内容
3. 粘贴并执行
4. 验证表已创建：
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

---

## 3. 本地开发

### 3.1 克隆项目
```bash
git clone https://github.com/elaineWN/Timer.git
cd Timer
```

### 3.2 安装依赖
```bash
npm install
```

### 3.3 配置环境变量
```bash
cp .env.example .env.local
```

编辑 `.env.local`：
```env
VITE_SUPABASE_URL=https://你的项目引用.supabase.co
VITE_SUPABASE_ANON_KEY=你的 anon key
```

### 3.4 启动开发服务器
```bash
npm run dev
```
访问 http://localhost:5173

### 3.5 运行测试
```bash
npm test
```

---

## 4. GitHub Pages 部署

### 4.1 配置 GitHub Secrets
1. 进入仓库 **Settings** → **Secrets and variables** → **Actions**
2. 添加两个密钥：
   - `VITE_SUPABASE_URL`: 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: 你的 anon key

### 4.2 启用 GitHub Pages
1. 进入 **Settings** → **Pages**
2. **Source** 选择 **GitHub Actions**
3. 推送代码到 main 分支自动触发部署

### 4.3 访问部署站点
```
https://elaineWN.github.io/Timer/
```

---

## 5. 常见问题

### 连接失败
- 检查 `.env.local` 配置
- 验证 Supabase 项目状态为 Active
- 确认 RLS 策略已配置

### 计时器无法启动
- 确保已创建大类且状态为 ACTIVE
- 检查可用时间是否大于 0

### 部署后白屏
- 检查 GitHub Secrets 是否正确
- 查看 Actions 日志确认构建成功
- 打开浏览器控制台查看错误信息

### 测试失败
- 确认 `.env.local` 配置正确
- 验证数据库迁移已执行
- 重新运行 `npm install`
