const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const db = require('./db');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 工具函数 ====================

// 生成 JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// 认证中间件
const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未提供认证令牌' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: '用户不存在' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: '无效的令牌' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '令牌已过期' });
    }
    res.status(401).json({ message: '认证失败', error: error.message });
  }
};

// 格式化用户对象（将数据库行转为前端需要的格式）
const formatUser = (user) => ({
  id: user.id,
  username: user.username,
  isAnonymous: !!user.is_anonymous,
  stats: {
    bottlesSent: user.bottles_sent,
    bottlesPicked: user.bottles_picked,
    repliesGiven: user.replies_given,
    healCount: user.heal_count,
    healingPoint: user.healing_point,
    streak: user.streak,
    lastCheckinDate: user.last_checkin_date,
    badges: JSON.parse(user.badges)
  },
  createdAt: user.created_at
});

// 格式化漂流瓶对象
const formatBottle = (bottle) => {
  if (!bottle) return null;
  return {
    id: bottle.id,
    content: bottle.content,
    contentType: bottle.content_type,
    emotion: bottle.emotion,
    emotionAnalysis: JSON.parse(bottle.emotion_analysis || '{}'),
    healingReply: bottle.healing_reply,
    challenges: JSON.parse(bottle.challenges || '[]'),
    challengeResults: JSON.parse(bottle.challenge_results || '[]'),
    authorName: bottle.author_name,
    status: bottle.status,
    isPublic: !!bottle.is_public,
    replyCount: bottle.reply_count,
    createdAt: bottle.created_at
  };
};

// 格式化漂流瓶（含回复）
const formatBottleWithReplies = (bottle, replies) => {
  const formatted = formatBottle(bottle);
  if (formatted) {
    formatted.replies = replies.map(r => ({
      content: r.content,
      authorName: r.author_name,
      createdAt: r.created_at
    }));
  }
  return formatted;
};

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 获取昨天的日期字符串
function getYesterdayStr() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==================== 认证路由 ====================

// POST /api/auth/register - 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ message: '用户名长度应在2-20个字符之间' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: '密码长度至少6个字符' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const result = db.prepare(
      'INSERT INTO users (username, password) VALUES (?, ?)'
    ).run(username, hashedPassword);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    const token = generateToken(user.id);
    res.status(201).json({
      message: '注册成功',
      token,
      user: formatUser(user)
    });
  } catch (error) {
    res.status(500).json({ message: '注册失败', error: error.message });
  }
});

// POST /api/auth/login - 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const token = generateToken(user.id);
    res.json({
      message: '登录成功',
      token,
      user: formatUser(user)
    });
  } catch (error) {
    res.status(500).json({ message: '登录失败', error: error.message });
  }
});

// POST /api/auth/anonymous - 匿名登录
app.post('/api/auth/anonymous', async (req, res) => {
  try {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const username = `漂流者${randomSuffix}`;
    const randomPassword = crypto.randomBytes(16).toString('hex');

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(randomPassword, salt);

    const result = db.prepare(
      'INSERT INTO users (username, password, is_anonymous) VALUES (?, ?, 1)'
    ).run(username, hashedPassword);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    const token = generateToken(user.id);
    res.status(201).json({
      message: '匿名登录成功',
      token,
      user: formatUser(user)
    });
  } catch (error) {
    res.status(500).json({ message: '匿名登录失败', error: error.message });
  }
});

// GET /api/auth/me - 获取当前用户信息
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    res.json({ user: formatUser(req.user) });
  } catch (error) {
    res.status(500).json({ message: '获取用户信息失败', error: error.message });
  }
});

// ==================== 漂流瓶路由 ====================

// POST /api/bottles - 创建漂流瓶
app.post('/api/bottles', auth, async (req, res) => {
  try {
    const { content, contentType, emotion, emotionAnalysis, healingReply, challenges } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: '漂流瓶内容不能为空' });
    }

    if (content.length > 300) {
      return res.status(400).json({ message: '内容不能超过300个字符' });
    }

    const defaultAnalysis = {
      primary_emotion: '平静',
      intensity: 3,
      keywords: [],
      risk_level: 'low',
      support_style: '',
      confidence: 0.5
    };

    const result = db.prepare(`
      INSERT INTO bottles (content, content_type, emotion, emotion_analysis, healing_reply, challenges, author_id, author_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
    `).run(
      content.trim(),
      contentType || 'free',
      emotion || '平静',
      JSON.stringify(emotionAnalysis || defaultAnalysis),
      healingReply || '',
      JSON.stringify(challenges || []),
      req.user.id,
      req.user.username
    );

    // 更新用户统计
    db.prepare('UPDATE users SET bottles_sent = bottles_sent + 1 WHERE id = ?').run(req.user.id);

    const bottle = db.prepare('SELECT * FROM bottles WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: '漂流瓶创建成功',
      bottle: formatBottle(bottle)
    });
  } catch (error) {
    res.status(500).json({ message: '创建漂流瓶失败', error: error.message });
  }
});

// GET /api/bottles/random - 随机拾取一个漂流瓶
app.get('/api/bottles/random', auth, async (req, res) => {
  try {
    // 随机获取一个 status=delivered 且不是自己的漂流瓶
    const bottle = db.prepare(`
      SELECT * FROM bottles
      WHERE author_id != ? AND status = 'delivered'
      ORDER BY RANDOM()
      LIMIT 1
    `).get(req.user.id);

    if (!bottle) {
      return res.json({ message: '暂时没有新的漂流瓶，稍后再来吧', bottle: null });
    }

    // 更新状态为 picked
    db.prepare("UPDATE bottles SET status = 'picked', picked_by = ? WHERE id = ?").run(req.user.id, bottle.id);

    // 更新用户统计
    db.prepare('UPDATE users SET bottles_picked = bottles_picked + 1 WHERE id = ?').run(req.user.id);

    // 获取回复
    const replies = db.prepare('SELECT * FROM replies WHERE bottle_id = ? ORDER BY created_at ASC').all(bottle.id);

    res.json({
      message: '拾取成功',
      bottle: formatBottleWithReplies(bottle, replies)
    });
  } catch (error) {
    res.status(500).json({ message: '拾取漂流瓶失败', error: error.message });
  }
});

// POST /api/bottles/:id/reply - 回复漂流瓶
app.post('/api/bottles/:id/reply', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const bottleId = req.params.id;

    if (!content || content.trim().length < 6) {
      return res.status(400).json({ message: '回复内容至少需要6个字符' });
    }

    const bottle = db.prepare('SELECT * FROM bottles WHERE id = ?').get(bottleId);
    if (!bottle) {
      return res.status(404).json({ message: '漂流瓶不存在' });
    }

    const now = new Date().toISOString();

    // 插入回复
    db.prepare(`
      INSERT INTO replies (bottle_id, content, author_id, author_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(bottleId, content.trim(), req.user.id, req.user.username, now);

    // 更新漂流瓶回复计数和状态
    const replyCount = db.prepare('SELECT COUNT(*) as count FROM replies WHERE bottle_id = ?').get(bottleId).count;
    db.prepare("UPDATE bottles SET reply_count = ?, status = 'replied' WHERE id = ?").run(replyCount, bottleId);

    // 更新用户统计
    db.prepare('UPDATE users SET replies_given = replies_given + 1 WHERE id = ?').run(req.user.id);

    // 自动创建故事
    try {
      const excerpt = bottle.content.length > 50 ? bottle.content.substring(0, 50) + '...' : bottle.content;
      const replyExcerpt = content.trim().length > 50 ? content.trim().substring(0, 50) + '...' : content.trim();

      db.prepare(`
        INSERT INTO stories (bottle_id, emotion_tag, excerpt, reply_excerpt)
        VALUES (?, ?, ?, ?)
      `).run(String(bottleId), bottle.emotion, excerpt, replyExcerpt);
    } catch (storyErr) {
      console.error('创建故事失败:', storyErr.message);
    }

    res.status(201).json({
      message: '回复成功',
      reply: {
        content: content.trim(),
        authorName: req.user.username,
        createdAt: now
      }
    });
  } catch (error) {
    res.status(500).json({ message: '回复失败', error: error.message });
  }
});

// POST /api/bottles/:id/challenge - 更新闯关结果
app.post('/api/bottles/:id/challenge', auth, async (req, res) => {
  try {
    const { challengeId, passed } = req.body;
    const bottleId = req.params.id;

    if (!challengeId || passed === undefined) {
      return res.status(400).json({ message: '缺少 challengeId 或 passed 参数' });
    }

    const bottle = db.prepare('SELECT * FROM bottles WHERE id = ?').get(bottleId);
    if (!bottle) {
      return res.status(404).json({ message: '漂流瓶不存在' });
    }

    let results = JSON.parse(bottle.challenge_results || '[]');
    const existingIndex = results.findIndex(r => r.challengeId === challengeId);

    if (existingIndex >= 0) {
      results[existingIndex].passed = passed;
    } else {
      results.push({ challengeId, passed });
    }

    db.prepare('UPDATE bottles SET challenge_results = ? WHERE id = ?').run(JSON.stringify(results), bottleId);

    // 如果通过，更新用户治愈统计
    if (passed) {
      db.prepare('UPDATE users SET heal_count = heal_count + 1 WHERE id = ?').run(req.user.id);
    }

    res.json({
      message: passed ? '闯关成功' : '闯关未通过',
      challengeResults: results
    });
  } catch (error) {
    res.status(500).json({ message: '更新闯关结果失败', error: error.message });
  }
});

// POST /api/bottles/:id/release - 确认放飞漂流瓶
app.post('/api/bottles/:id/release', auth, async (req, res) => {
  try {
    const bottleId = req.params.id;

    const bottle = db.prepare('SELECT * FROM bottles WHERE id = ?').get(bottleId);
    if (!bottle) {
      return res.status(404).json({ message: '漂流瓶不存在' });
    }

    if (bottle.author_id !== req.user.id) {
      return res.status(403).json({ message: '只能放飞自己创建的漂流瓶' });
    }

    if (bottle.status !== 'submitted') {
      return res.status(400).json({ message: '该漂流瓶已放飞' });
    }

    db.prepare("UPDATE bottles SET status = 'delivered' WHERE id = ?").run(bottleId);

    res.json({
      message: '漂流瓶已放飞到大海',
      bottle: {
        id: bottle.id,
        status: 'delivered'
      }
    });
  } catch (error) {
    res.status(500).json({ message: '放飞漂流瓶失败', error: error.message });
  }
});

// GET /api/bottles/my-sent - 获取我投递的漂流瓶
app.get('/api/bottles/my-sent', auth, async (req, res) => {
  try {
    const bottles = db.prepare(`
      SELECT id, content, content_type, emotion, status, reply_count, created_at
      FROM bottles WHERE author_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    const formatted = bottles.map(b => formatBottle(b));
    res.json({ bottles: formatted });
  } catch (error) {
    res.status(500).json({ message: '获取失败', error: error.message });
  }
});

// GET /api/bottles/my-picked - 获取我拾取的漂流瓶
app.get('/api/bottles/my-picked', auth, async (req, res) => {
  try {
    const bottles = db.prepare(`
      SELECT * FROM bottles WHERE picked_by = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    const formatted = bottles.map(b => {
      const replies = db.prepare('SELECT * FROM replies WHERE bottle_id = ? ORDER BY created_at ASC').all(b.id);
      return formatBottleWithReplies(b, replies);
    });

    res.json({ bottles: formatted });
  } catch (error) {
    res.status(500).json({ message: '获取失败', error: error.message });
  }
});

// GET /api/bottles/my-replies - 获取我回复过的漂流瓶
app.get('/api/bottles/my-replies', auth, async (req, res) => {
  try {
    // 获取用户回复过的漂流瓶 ID（去重）
    const bottleIds = db.prepare(`
      SELECT DISTINCT bottle_id FROM replies WHERE author_id = ?
    `).all(req.user.id).map(r => r.bottle_id);

    const bottles = [];
    for (const bid of bottleIds) {
      const bottle = db.prepare('SELECT * FROM bottles WHERE id = ?').get(bid);
      if (bottle) {
        const replies = db.prepare('SELECT * FROM replies WHERE bottle_id = ? ORDER BY created_at ASC').all(bid);
        bottles.push(formatBottleWithReplies(bottle, replies));
      }
    }

    // 按 created_at 降序排序
    bottles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ bottles });
  } catch (error) {
    res.status(500).json({ message: '获取失败', error: error.message });
  }
});

// GET /api/bottles/stats - 获取全局统计
app.get('/api/bottles/stats', async (req, res) => {
  try {
    const totalBottles = db.prepare('SELECT COUNT(*) as count FROM bottles').get().count;
    const totalReplies = db.prepare('SELECT COALESCE(SUM(reply_count), 0) as total FROM bottles').get().total;

    const todayStr = getTodayStr();
    const todayBottles = db.prepare("SELECT COUNT(*) as count FROM bottles WHERE created_at >= ?").get(todayStr).count;

    res.json({
      totalBottles,
      totalReplies,
      todayBottles
    });
  } catch (error) {
    res.status(500).json({ message: '获取统计失败', error: error.message });
  }
});

// ==================== 故事路由 ====================

// GET /api/stories - 获取故事流
app.get('/api/stories', async (req, res) => {
  try {
    const stories = db.prepare(`
      SELECT id, bottle_id, emotion_tag, excerpt, reply_excerpt, created_at
      FROM stories ORDER BY created_at DESC LIMIT 20
    `).all();

    const sanitizedStories = stories.map(s => ({
      id: s.id,
      bottleId: s.bottle_id,
      emotionTag: s.emotion_tag,
      excerpt: s.excerpt,
      replyExcerpt: s.reply_excerpt,
      createdAt: s.created_at
    }));

    res.json({ stories: sanitizedStories });
  } catch (error) {
    res.status(500).json({ message: '获取故事流失败', error: error.message });
  }
});

// POST /api/stories - 创建故事
app.post('/api/stories', async (req, res) => {
  try {
    const { bottleId, emotionTag, excerpt, replyExcerpt } = req.body;

    if (!bottleId) {
      return res.status(400).json({ message: 'bottleId 不能为空' });
    }

    const result = db.prepare(`
      INSERT INTO stories (bottle_id, emotion_tag, excerpt, reply_excerpt)
      VALUES (?, ?, ?, ?)
    `).run(bottleId, emotionTag || '', excerpt || '', replyExcerpt || '');

    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      message: '故事创建成功',
      story: {
        id: story.id,
        bottleId: story.bottle_id,
        emotionTag: story.emotion_tag,
        excerpt: story.excerpt,
        replyExcerpt: story.reply_excerpt,
        createdAt: story.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ message: '创建故事失败', error: error.message });
  }
});

// ==================== 用户路由 ====================

// POST /api/user/checkin - 每日签到
app.post('/api/user/checkin', auth, async (req, res) => {
  try {
    const today = getTodayStr();
    const yesterday = getYesterdayStr();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查今天是否已签到
    if (user.last_checkin_date === today) {
      return res.status(400).json({ message: '今天已经签到过了' });
    }

    // 检查连续签到
    let newStreak = 1;
    if (user.last_checkin_date === yesterday) {
      newStreak = user.streak + 1;
    }

    // 更新签到信息
    let badges = JSON.parse(user.badges);
    if (!badges.includes('first_checkin')) {
      badges.push('first_checkin');
    }
    if (newStreak >= 7 && !badges.includes('week_streak')) {
      badges.push('week_streak');
    }
    if (newStreak >= 30 && !badges.includes('month_streak')) {
      badges.push('month_streak');
    }

    db.prepare(`
      UPDATE users SET
        last_checkin_date = ?,
        streak = ?,
        healing_point = healing_point + 1,
        badges = ?
      WHERE id = ?
    `).run(today, newStreak, JSON.stringify(badges), req.user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    res.json({
      message: '签到成功',
      stats: formatUser(updatedUser).stats
    });
  } catch (error) {
    res.status(500).json({ message: '签到失败', error: error.message });
  }
});

// GET /api/user/tasks - 获取今日任务完成情况
app.get('/api/user/tasks', auth, async (req, res) => {
  try {
    const today = getTodayStr();
    const todayStart = today + 'T00:00:00';

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 今日是否已签到
    const checkedIn = user.last_checkin_date === today;

    // 今日投递漂流瓶数
    const todaySent = db.prepare("SELECT COUNT(*) as count FROM bottles WHERE author_id = ? AND created_at >= ?")
      .get(req.user.id, todayStart).count;

    // 今日拾取漂流瓶数
    const todayPicked = db.prepare("SELECT COUNT(*) as count FROM bottles WHERE picked_by = ? AND created_at >= ?")
      .get(req.user.id, todayStart).count;

    // 今日回复数
    const todayReplied = db.prepare("SELECT COUNT(*) as count FROM replies WHERE author_id = ? AND created_at >= ?")
      .get(req.user.id, todayStart).count;

    const tasks = [
      {
        id: 'checkin',
        name: '每日签到',
        description: '每天签到获得治愈点数',
        completed: checkedIn,
        reward: '1 治愈点'
      },
      {
        id: 'send_bottle',
        name: '投递漂流瓶',
        description: '今天投递一个漂流瓶',
        completed: todaySent > 0,
        progress: todaySent,
        target: 1,
        reward: '获得治愈力量'
      },
      {
        id: 'pick_bottle',
        name: '拾取漂流瓶',
        description: '今天拾取一个漂流瓶',
        completed: todayPicked > 0,
        progress: todayPicked,
        target: 1,
        reward: '帮助他人'
      },
      {
        id: 'reply_bottle',
        name: '回复漂流瓶',
        description: '今天回复一个漂流瓶',
        completed: todayReplied > 0,
        progress: todayReplied,
        target: 1,
        reward: '传递温暖'
      }
    ];

    res.json({
      tasks,
      stats: formatUser(user).stats
    });
  } catch (error) {
    res.status(500).json({ message: '获取任务失败', error: error.message });
  }
});

// POST /api/user/reset - 重置数据
app.post('/api/user/reset', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 获取用户拾取过的漂流瓶 ID
    const pickedBottles = db.prepare('SELECT id FROM bottles WHERE picked_by = ?').all(userId);

    // 删除用户创建的所有漂流瓶的回复
    const userBottles = db.prepare('SELECT id FROM bottles WHERE author_id = ?').all(userId);
    for (const b of userBottles) {
      db.prepare('DELETE FROM replies WHERE bottle_id = ?').run(b.id);
    }

    // 删除用户创建的所有漂流瓶
    db.prepare('DELETE FROM bottles WHERE author_id = ?').run(userId);

    // 清除用户拾取记录（将状态恢复为 delivered）
    db.prepare("UPDATE bottles SET picked_by = NULL, status = 'delivered' WHERE picked_by = ?").run(userId);

    // 删除用户的所有回复
    db.prepare('DELETE FROM replies WHERE author_id = ?').run(userId);

    // 重新计算所有剩余瓶子的回复计数
    const allBottles = db.prepare('SELECT id FROM bottles').all();
    for (const b of allBottles) {
      const count = db.prepare('SELECT COUNT(*) as count FROM replies WHERE bottle_id = ?').get(b.id).count;
      db.prepare('UPDATE bottles SET reply_count = ? WHERE id = ?').run(count, b.id);
    }

    // 重置用户统计
    db.prepare(`
      UPDATE users SET
        bottles_sent = 0,
        bottles_picked = 0,
        replies_given = 0,
        heal_count = 0,
        healing_point = 0,
        streak = 0,
        last_checkin_date = '',
        badges = '[]'
      WHERE id = ?
    `).run(userId);

    res.json({ message: '数据重置成功' });
  } catch (error) {
    res.status(500).json({ message: '重置数据失败', error: error.message });
  }
});

// ==================== 根路由 ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    });
}

module.exports = app;
