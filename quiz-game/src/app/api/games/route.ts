import { NextResponse } from "next/server";
import { listGames, saveGameResult } from "@/lib/data";
import type { TeamScore } from "@/lib/types";

export async function GET() {
  return NextResponse.json(listGames());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    packId: string;
    packName: string;
    teams: TeamScore[];
  };
  if (!body.packId || !body.teams?.length) {
    return NextResponse.json(
      { error: "packId and teams are required" },
      { status: 400 }
    );
  }
  const game = saveGameResult(body.packId, body.packName, body.teams);
  return NextResponse.json(game, { status: 201 });
}
