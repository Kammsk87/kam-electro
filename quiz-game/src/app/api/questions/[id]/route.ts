import { NextResponse } from "next/server";
import { deleteQuestion, updateQuestion } from "@/lib/data";
import type { Question } from "@/lib/types";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as Omit<Question, "id">;
  updateQuestion(id, body);
  return NextResponse.json({ id, ...body });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteQuestion(id);
  return NextResponse.json({ ok: true });
}
