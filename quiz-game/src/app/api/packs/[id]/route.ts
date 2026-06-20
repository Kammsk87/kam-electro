import { NextResponse } from "next/server";
import { deletePack, getPackDetail } from "@/lib/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = getPackDetail(id);
  if (!pack) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(pack);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deletePack(id);
  return NextResponse.json({ ok: true });
}
