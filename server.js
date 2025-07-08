require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// 创建上传目录
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 启用 CORS
app.use(cors({
  origin: 'https://windows11-24h2.github.io',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 解析 JSON 和表单数据
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 连接 MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nsoi', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB 连接成功'))
.catch(err => {
  console.error('❌ MongoDB 连接失败:', err);
  process.exit(1);
});

// 定义题目模型
const questionSchema = new mongoose.Schema({
  ojName: { type: String, required: true },
  uid: { type: String, required: true },
  email: { type: String, required: true },
  awards: String,
  questionTitle: { type: String, required: true },
  questionAuthor: { type: String, required: true },
  questionDifficulty: { type: String, required: true },
  questionDescription: { type: String, required: true },
  dataPackage: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  createdAt: { type: Date, default: Date.now }
});
const Question = mongoose.model('Question', questionSchema);

// 定义管理员模型
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 提供上传文件访问
app.use('/uploads', express.static(uploadDir));

// JWT 认证中间件
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
      if (err) {
        return res.status(403).json({ success: false, message: '无效的令牌' });
      }
      
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ success: false, message: '未提供认证令牌' });
  }
};

// 初始化管理员账户（仅首次运行）
const initAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new Admin({
        email: 'admin@nsoi.org',
        password: hashedPassword
      });
      
      await admin.save();
      console.log('👑 管理员账户已创建');
      console.log('📧 邮箱: admin@nsoi.org');
      console.log('🔑 密码: admin123');
    }
  } catch (error) {
    console.error('初始化管理员失败:', error);
  }
};

// 提交题目
app.post('/api/submit', upload.single('dataPackage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传数据包文件' });
    }

    const question = new Question({
      ojName: req.body.ojName,
      uid: req.body.uid,
      email: req.body.email,
      awards: req.body.awards,
      questionTitle: req.body.questionTitle,
      questionAuthor: req.body.questionAuthor,
      questionDifficulty: req.body.questionDifficulty,
      questionDescription: req.body.questionDescription,
      dataPackage: req.file.filename
    });

    await question.save();
    res.json({ 
      success: true, 
      message: '题目申请已提交！',
      id: question._id
    });
  } catch (error) {
    console.error('提交错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '提交失败: ' + error.message 
    });
  }
});

// 查询结果
app.get('/api/query', async (req, res) => {
  try {
    const { email, uid } = req.query;
    
    if (!email && !uid) {
      return res.status(400).json({ 
        success: false, 
        message: '请提供邮箱或UID' 
      });
    }

    const query = {};
    if (email) query.email = email;
    if (uid) query.uid = uid;

    const questions = await Question.find(query).sort({ createdAt: -1 });

    if (questions.length === 0) {
      return res.json({ 
        success: true, 
        message: '未找到相关申请记录' 
      });
    }

    res.json({ 
      success: true, 
      message: '查询成功',
      data: questions 
    });
  } catch (error) {
    console.error('查询错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '查询失败: ' + error.message 
    });
  }
});

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱和密码不能为空' 
      });
    }

    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: '邮箱或密码错误' 
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: '邮箱或密码错误' 
      });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' }
    );

    res.json({ 
      success: true, 
      message: '登录成功',
      token 
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '登录失败: ' + error.message 
    });
  }
});

// 加载待审核题目
app.get('/api/admin/questions', authenticateJWT, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : { status: 'pending' };
    
    const questions = await Question.find(filter).sort({ createdAt: 1 });
    
    res.json({ 
      success: true, 
      data: questions 
    });
  } catch (error) {
    console.error('加载题目错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '加载失败: ' + error.message 
    });
  }
});

// 审核题目
app.put('/api/admin/review/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;
    
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: '无效的审核状态' 
      });
    }

    const question = await Question.findById(id);
    
    if (!question) {
      return res.status(404).json({ 
        success: false, 
        message: '题目不存在' 
      });
    }

    question.status = status;
    if (feedback) question.feedback = feedback;
    question.reviewedAt = new Date();
    
    await question.save();
    
    res.json({ 
      success: true, 
      message: `题目已${status === 'approved' ? '通过' : '拒绝'}审核`
    });
  } catch (error) {
    console.error('审核错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '审核失败: ' + error.message 
    });
  }
});

// 启动服务器
app.listen(port, async () => {
  console.log(`🚀 NSOI题目审核系统运行在 http://localhost:${port}`);
  await initAdmin();
});