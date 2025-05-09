import {CategoryModel, QuestionModel} from "./src/models";
import axiosRetry from "axios-retry";
import axios from "axios";
import {Category, Question} from "./src/types";
import {decode} from "html-entities";

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const axiosInstance = axios.create({});

// Seed Database from opentdb
async function seedDatabase(): Promise<void> {
    try {
        // Clear DB if not already
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

seedDatabase().then(() => {
    console.log("Seeding complete");
}, (error) => {
    console.error('Seeding failed:', error.message);
})
