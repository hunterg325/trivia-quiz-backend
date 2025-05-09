import mongoose from "mongoose";

export interface Category {
    id: number;
    name: string;
}

export interface Question {
    _id?: mongoose.Types.ObjectId;
    category: number;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
}
