import { env } from "@personaos/config";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = typeof window === "undefined" ? env.NEXT_PUBLIC_API_URL : "";
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
