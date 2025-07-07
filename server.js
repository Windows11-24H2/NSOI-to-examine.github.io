const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3000;

// 连接MongoDB
mongoose.connect('mongodb://localhost:27017/nsoi', { useNewUrlParser: true, useUnifiedTopology: true });

// 定义题目模型
const Question = mongoose.model('Question', new mongoose.Schema({
    ojName: String,
    uid: String,
    email: String,
    awards: String,
    questionTitle: String,
    questionAuthor: String,
    questionDifficulty: String,
    questionDescription: String,
    dataPackage: String
}));

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 提交题目
app.post('/submit', upload.single('dataPackage'), async (req, res) => {
    try {
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
        res.json({ message: '题目申请已提交！' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '提交失败，请稍后再试！' });
    }
});

// 查询结果
app.get('/query', async (req, res) => {
    try {
        const email = req.query.email;
        const questions = await Question.find({ email: email });

        if (questions.length === 0) {
            return res.json({ message: '未找到相关申请！' });
        }

        res.json({ message: '查询成功！', questions: questions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '查询失败，请稍后再试！' });
    }
});

app.listen(port, () => {
    console.log(`NSOI题目审核系统运行在 http://localhost:${port}`);
});
