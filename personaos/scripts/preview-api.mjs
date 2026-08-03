import http from "node:http";

const port = Number(process.env.API_PORT || 4000);
const sessionCookie = "personaos_session=preview-session; Path=/; SameSite=Lax";

const state = {
  user: {
    id: "preview-user",
    email: "preview@personaos.local",
    name: "Александр",
    role: "USER",
    onboardingDone: false
  },
  workspace: {
    id: "preview-workspace",
    name: "Стенгазета",
    description: "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм.",
    authorProfile: null,
    socialAccounts: [
      platform("TELEGRAM", "PRIMARY", true),
      platform("INSTAGRAM", "PRIMARY", true),
      platform("THREADS", "SECONDARY", true),
      platform("VK", "LOW", false)
    ]
  },
  captures: []
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const body = await readJson(request);
    const payload = route(request.method || "GET", url, body, response);
    sendJson(response, payload);
  } catch (error) {
    sendJson(response, { message: error instanceof Error ? error.message : "Preview API error" }, 500);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PersonaOS preview API running at http://127.0.0.1:${port}`);
});

function route(method, url, body, response) {
  const path = url.pathname;

  if (path === "/api/health") return { ok: true, mode: "preview" };

  if (path === "/api/auth/providers") return { email: true, oauth: ["telegram", "instagram", "threads", "vk"] };

  if ((path === "/api/auth/register" || path === "/api/auth/login") && method === "POST") {
    state.user.email = body.email || state.user.email;
    state.user.name = body.name || state.user.name;
    response.setHeader("Set-Cookie", sessionCookie);
    return { user: state.user };
  }

  if (path === "/api/auth/logout" && method === "POST") {
    response.setHeader("Set-Cookie", "personaos_session=; Path=/; Max-Age=0; SameSite=Lax");
    return { ok: true };
  }

  if (path === "/api/auth/me" || path === "/api/users/me") return { user: state.user };

  if (path === "/api/onboarding/status") return { onboardingDone: state.user.onboardingDone };

  if (path === "/api/onboarding/complete" && method === "POST") {
    state.user.name = body.user?.name || state.user.name;
    state.user.onboardingDone = true;
    state.workspace.name = body.workspace?.name || state.workspace.name;
    state.workspace.description = body.workspace?.description || state.workspace.description;
    state.workspace.authorProfile = body.authorProfile;
    state.workspace.socialAccounts = (body.socialAccounts || state.workspace.socialAccounts).map((account, index) => ({
      id: `social-${index}`,
      ...account
    }));
    return state.workspace;
  }

  if (path === "/api/workspaces/active") {
    ensureProfile();
    return state.workspace;
  }

  if (path === "/api/author-profile") {
    ensureProfile();
    return state.workspace.authorProfile;
  }

  if (path === "/api/social-accounts") return state.workspace.socialAccounts;

  if (path === "/api/captures" && method === "GET") {
    return { items: state.captures, total: state.captures.length, hasMore: false };
  }

  if (path === "/api/captures" && method === "POST") {
    const capture = {
      id: `capture-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: body.sourceType || "TEXT",
      title: body.title || "Preview capture",
      description: body.description || "",
      transcript: body.transcript || null,
      media: body.media || null,
      tags: body.tags || [],
      status: "NEW",
      emotion: body.emotion || "UNKNOWN",
      importance: body.importance || "MEDIUM",
      isFavorite: false
    };
    state.captures.unshift(capture);
    return capture;
  }

  if (path.endsWith("/summary")) return summaryFor(path);

  if (path === "/api/analytics/heatmap") return [];
  if (path === "/api/analytics/weekly-report" || path === "/api/analytics/monthly-report") {
    return { activeDays: 0, totalActivity: 0, totals: {}, highlights: ["Preview mode: подключи PostgreSQL для реальных данных."] };
  }

  if (path === "/api/planner/today") return { tasks: [], weeklyGoals: [], streak: { current: 0, longest: 0 }, completionHistory: [] };
  if (path === "/api/stories" || path === "/api/drafts" || path === "/api/publications" || path === "/api/memory") return [];
  if (path === "/api/interviews") return [];
  if (path === "/api/social-integrations") return [];
  if (path === "/api/social-integrations/jobs") return [];
  if (path === "/api/research") return [];
  if (path === "/api/beta/feature-flags" || path === "/api/beta/feedback" || path === "/api/beta/exports") return [];
  if (path === "/api/beta/readiness") {
    return {
      workspace: state.workspace.name,
      checks: { preview: "running", database: "not connected", api: "mock preview" },
      counters: { feedback: 0, exportJobs: 0, aiJobsQueued: 0, connectedSocials: 0, memories: 0, publications: 0 }
    };
  }
  if (path === "/api/ai-memory/summary") return { memories: 0, embeddings: 0, coverage: 0, provider: "LOCAL" };
  if (path === "/api/ai-memory/search" || path === "/api/ai-memory/context") return [];
  if (path === "/api/ai-planner/summary") return { open: 0, generated: 0 };
  if (path === "/api/ai-planner/recommendations") return [];
  if (path === "/api/orchestrator/summary") return { QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, CANCELLED: 0 };
  if (path === "/api/orchestrator/jobs") return [];

  return { ok: true, preview: true };
}

function summaryFor(path) {
  if (path.includes("/captures")) return { total: state.captures.length };
  if (path.includes("/persona")) return { completeness: 75, signals: 0, lastVersion: null };
  if (path.includes("/stories")) return { ready: 0, draft: 0 };
  if (path.includes("/drafts")) return { ready: 0, inProgress: 0 };
  if (path.includes("/publications")) return { planned: 0, ready: 0, publishedThisWeek: 0 };
  if (path.includes("/memory")) return { count: 0, recent: [] };
  if (path.includes("/planner")) return { tasksToday: 0, doneToday: 0, openToday: 0, weeklyGoals: 0, streak: 0 };
  if (path.includes("/analytics")) {
    return {
      captures: state.captures.length,
      reflections: 0,
      stories: 0,
      drafts: 0,
      publications: 0,
      streak: 0,
      weeklyActivity: state.captures.length,
      monthlyActivity: state.captures.length
    };
  }
  return {};
}

function ensureProfile() {
  if (state.workspace.authorProfile) return;
  state.workspace.authorProfile = {
    displayName: state.user.name,
    bio: "Предприниматель, который пишет из жизни и бизнеса.",
    positioning: "Бизнес, жизнь, психология, отношения, сарказм.",
    mainTopics: ["бизнес", "жизнь", "психология", "отношения", "сарказм"],
    forbiddenTopics: ["инфоцыганство"],
    toneOfVoice: ["честный", "саркастичный", "глубокий", "без пафоса"],
    sarcasmLevel: 3,
    depthLevel: 4,
    preferredPostLength: "MIXED"
  };
}

function platform(platform, priority, isActive) {
  return {
    id: `social-${platform.toLowerCase()}`,
    platform,
    accountName: null,
    accountUrl: null,
    priority,
    isActive,
    publishingEnabled: false,
    analyticsEnabled: false,
    notes: null
  };
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3000");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
