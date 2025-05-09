import mongoose from "mongoose";
import {Category, Question} from "./types";

export const categorySchema = new mongoose.Schema<Category>({
    id: Number,
    name: String,
});

export const questionSchema = new mongoose.Schema<Question>({
    category: Number,
    difficulty: String,
    question: String,
    correct_answer: String,
    incorrect_answers: [String],
});
