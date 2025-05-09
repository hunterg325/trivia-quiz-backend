import express, { Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import axios from 'axios';

import { Question } from "./src/types";
import { CategoryModel, QuestionModel } from "./src/models";

const axiosInstance = axios.create({});

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/trivia', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
} as mongoose.ConnectOptions);

// API Endpoints
app.get('/api/categories', async (req: Request, res: Response) => {
    try {
        const categories = await CategoryModel.find({}, 'id name');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
app.get('/', (req, res) => {
    res.send('hello world')
})

app.get('/api/quiz', async (req: Request, res: Response) => {
    const category = req.query.category;
    const difficulty = req.query.difficulty;
    try {
        const questions = await QuestionModel.aggregate<Question>([
            { $match: { category: Number(category), difficulty } },
            { $sample: { size: 5 } },
        ]);

        const quizQuestions = questions.map((q) => {
            const options = [q.correct_answer, ...q.incorrect_answers].sort(() => Math.random() - 0.5);
            return { _id: q._id, question: q.question, options };
        });

        res.json(quizQuestions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quiz questions' });
    }
});

app.post('/api/quiz/score', async (req: Request, res: Response) => {
    const { answers } = req.body as { answers: { questionId: string; selectedAnswer: string }[] };
    try {
        const questionIds = answers.map((a) => new mongoose.Types.ObjectId(a.questionId));
        const questions = await QuestionModel.find({ _id: { $in: questionIds } });
        const questionMap = questions.reduce((map, q) => {
            map[q._id!.toString()] = q;
            return map;
        }, {} as Record<string, Question>);

        const results = answers.map((a) => {
            const question = questionMap[a.questionId];
            const isCorrect = question && a.selectedAnswer === question.correct_answer;
            return {
                questionId: a.questionId,
                correctAnswer: question ? question.correct_answer : null,
                isCorrect: !!isCorrect,
            };
        });
        const score = results.filter((r) => r.isCorrect).length;
        res.json({ score, results });
    } catch (error) {
        res.status(500).json({ error: 'Failed to score quiz' });
    }
});

// Start server
app.listen(3001, () => console.log('Backend running on port 3001'));
