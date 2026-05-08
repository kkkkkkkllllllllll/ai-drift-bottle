# AI漂流瓶 - 动态版

一个基于 Node.js + Express + MongoDB 的情感分享应用。

## 功能特性

- ✅ 用户系统（注册/登录/匿名登录）
- ✅ 情绪分析与 AI 温柔回信
- ✅ 漂流瓶投递与随机拾取
- ✅ 评论回复互动
- ✅ 个人漂流瓶历史
- ✅ 全局统计数据

## 技术栈

- **后端**: Node.js + Express
- **数据库**: MongoDB (Mongoose)
- **认证**: JWT
- **前端**: 原生 HTML/CSS/JS

## 安装运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件：

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/ai_drift_bottle
JWT_SECRET=your-super-secret-key
```

### 3. 启动 MongoDB

确保本地 MongoDB 服务已启动。

### 4. 运行应用

```bash
npm start
```

访问 http://localhost:3000

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/auth/register | POST | 用户注册 |
| /api/auth/login | POST | 用户登录 |
| /api/auth/anonymous | POST | 匿名登录 |
| /api/auth/me | GET | 获取当前用户 |
| /api/bottles | POST | 创建漂流瓶 |
| /api/bottles/random | GET | 随机拾取漂流瓶 |
| /api/bottles/:id/reply | POST | 回复漂流瓶 |
| /api/bottles/my-sent | GET | 我投递的漂流瓶 |
| /api/bottles/my-picked | GET | 我拾取的漂流瓶 |
| /api/bottles/stats | GET | 全局统计 |

## 项目结构

```
ai-drift-bottle/
├── models/           # 数据模型
│   ├── User.js
│   └── Bottle.js
├── routes/           # 路由
│   ├── auth.js
│   └── bottles.js
├── middleware/       # 中间件
│   └── auth.js
├── public/           # 前端文件
│   └── index.html
├── server.js         # 入口文件
├── .env              # 环境变量
└── package.json
```
