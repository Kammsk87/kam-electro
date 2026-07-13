import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Client = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<Client>();
let lastMessage = JSON.stringify({ type: "idle" });

function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function GET(request: NextRequest) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clients.add(controller);
      controller.enqueue(encode(JSON.parse(lastMessage)));
      request.signal.addEventListener("abort", () => {
        clients.delete(controller);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  const message: unknown = await request.json();
  lastMessage = JSON.stringify(message);
  const data = encode(message);
  for (const client of clients) {
    try {
      client.enqueue(data);
    } catch {
      clients.delete(client);
    }
  }
  return Response.json({ ok: true });
}
