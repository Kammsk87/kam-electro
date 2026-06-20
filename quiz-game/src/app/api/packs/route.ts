import { NextResponse } from "next/server";
import { createPack, listPacks } from "@/lib/data";

export async function GET() {
  return NextResponse.json(listPacks());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name: string; questionIds: string[] };
  if (!body.name?.trim() || !body.questionIds?.length) {
    return NextResponse.json(
      { error: "name and questionIds are required" },
      { status: 400 }
    );
  }
  const pack = createPack(body.name.trim(), body.questionIds);
  return NextResponse.json(pack, { status: 201 });
}
