import mongoose from "mongoose";
import {Category, Question} from "./types";
import {categorySchema, questionSchema} from "./schemas";

export const CategoryModel = mongoose.model<Category>('Category', categorySchema);
export const QuestionModel = mongoose.model<Question>('Question', questionSchema);
