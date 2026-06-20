import { NextResponse } from "next/server";
import { createQuestion, listQuestions } from "@/lib/data";
import type { Question } from "@/lib/types";

export async function GET() {
  return NextResponse.json(listQuestions());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Omit<Question, "id">;
  const question = createQuestion(body);
  return NextResponse.json(question, { status: 201 });
}
