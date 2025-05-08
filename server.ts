import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import axiosRetry from "axios-retry";
import { decode } from 'html-entities';

const axiosInstance = axios.create({});

// Shared types
interface Category {
    id: number;
    name: string;
}

interface Question {
    _id?: mongoose.Types.ObjectId;
    category: number;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
}

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/trivia', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
} as mongoose.ConnectOptions);

// Define Schemas
const categorySchema = new mongoose.Schema<Category>({
    id: Number,
    name: String,
});

const questionSchema = new mongoose.Schema<Question>({
    category: Number,
    difficulty: String,
    question: String,
    correct_answer: String,
    incorrect_answers: [String],
});
const CategoryModel = mongoose.model<Category>('Category', categorySchema);
const QuestionModel = mongoose.model<Question>('Question', questionSchema);

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Seed Database from OpenTDB
async function seedDatabase(): Promise<void> {
    try {
        await CategoryModel.deleteMany({});
        await QuestionModel.deleteMany({});

        axiosRetry(axiosInstance, {
            retries: 3, // Number of retries
            retryDelay: (retryCount) => {
                console.log(`retry attempt: ${retryCount}`);
                return retryCount * 8000; // Time interval between retries in milliseconds
            },
            retryCondition: (error) => {
                return error.response?.status === 429;
            },
            onRetry: (retryCount, error, requestConfig) => {
                console.log(`Retrying request ${requestConfig.url}. Retry count: ${retryCount}`);
            },
        });

        const categoriesRes = await axios.get<{ trivia_categories: Category[] }>('https://opentdb.com/api_category.php');
        const categories = categoriesRes.data.trivia_categories;
        await CategoryModel.insertMany(categories);

        for (const category of categories) {
            for (const difficulty of ['easy', 'medium', 'hard']) {
                const url = `https://opentdb.com/api.php?amount=50&category=${category.id}&difficulty=${difficulty}&type=multiple`;
                const questionRes = await axiosInstance.get<{ response_code: number; results: Question[] }>(url);
                if (questionRes.data.response_code === 0) {
                    const questions = questionRes.data.results.map((q) => ({
                        category: category.id,
                        difficulty: q.difficulty,
                        question: decode(q.question),
                        correct_answer: decode(q.correct_answer),
                        incorrect_answers: q.incorrect_answers.map((a) => decode(a)),
                    }));

                    await QuestionModel.insertMany(questions);
                    const waitTime = Math.floor(Math.random() * (35000 - 15000 + 1));

                    // opentdb requires at least 5 seconds in between each request
                    await delay(waitTime);

                    console.log('waited...', waitTime);
                }
            }
        }

    } catch (error) {
        console.error('Seeding failed:', error);
    }
}

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
        if (questions.length < 5) {
            // return res.status(400).json({ error: 'Not enough questions available' });
        }
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

// Seed database and start server
app.listen(3001, () => console.log('Backend running on port 3001'));
