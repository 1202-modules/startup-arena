import type {
  ApiErrorResponse,
  HealthResponse,
  PublicEventResponse,
  SessionResponse,
  OrganizerOverview,
} from "@startup-game/shared";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "NETWORK_ERROR", "The game server could not be reached.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload as Partial<ApiErrorResponse> | null;
    throw new ApiClientError(
      response.status,
      error?.error?.code ?? "HTTP_ERROR",
      error?.error?.message ?? "The request failed.",
    );
  }
  return payload as T;
}

export const api = {
  health: (signal?: AbortSignal) => requestJson<HealthResponse>("/api/health", { signal }),
  event: (signal?: AbortSignal) => requestJson<PublicEventResponse>("/api/event", { signal }),
  session: (id: string, signal?: AbortSignal) => requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}`, { signal }),
  createSession: (name: string, language: "ru" | "en") => requestJson<SessionResponse>("/api/sessions", {
    method: "POST", body: JSON.stringify({ name, language }),
  }),
  updatePortfolio: (id: string, portfolio: SessionResponse["portfolio"]) => requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}/portfolio`, {
    method: "PUT", body: JSON.stringify(portfolio),
  }),
  confirmRound: (id: string, round: number) => requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}/rounds/${round}/confirm`, { method: "POST" }),
  nextRound: (id: string) => requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}/next`, { method: "POST" }),
  completeSession: (id: string) => requestJson<SessionResponse>(`/api/sessions/${encodeURIComponent(id)}/complete`, { method: "POST" }),
  finalizeEvent: (password: string) => requestJson<PublicEventResponse>("/api/event/finalize", { method: "POST", body: JSON.stringify({ password }) }),
  organizerLogin: (password: string) => requestJson<{ token: string }>("/api/organizer/login", { method: "POST", body: JSON.stringify({ password }) }),
  organizer: (token: string) => requestJson<OrganizerOverview>("/api/organizer", { headers: { authorization: `Bearer ${token}` } }),
  renameEvent: (token: string, title: string) => requestJson<OrganizerOverview>("/api/organizer/event", { method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ title }) }),
  newEvent: (token: string, title: string) => requestJson<OrganizerOverview>("/api/organizer/event/new", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ title }) }),
  download: async (token: string, type: "ranking.csv" | "backup.sqlite") => {
    const { path } = await requestJson<{ path: string }>("/api/organizer/downloads", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ type }) });
    const link = document.createElement("a"); link.href = path; link.download = type;
    document.body.append(link); link.click(); link.remove();
  },
};
