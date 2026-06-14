type HelperIntent =
  | "readiness_summary"
  | "text_intake_review"
  | "admin_review"
  | "correction_draft"
  | "export_guard";

interface HelperRequest {
  intent: HelperIntent;
  context?: Record<string, unknown>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const guardrails = [
  "AI suggests only.",
  "Deterministic validation remains the source of truth.",
  "A human operator makes all media and submission decisions.",
];

function safeResponse(intent: HelperIntent) {
  return {
    intent,
    title: "Helper draft",
    summary:
      "Backend helper stub is available. Configure a server-side model provider later to generate richer drafts.",
    suggestions: [
      "Use deterministic blockers before sending or exporting.",
      "Review the draft before showing it to an agent.",
    ],
    blockers: [],
    guardrails,
    source: "edge-stub",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Use POST with an AI helper intent." },
      { status: 405, headers: corsHeaders },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Partial<HelperRequest>;
  const intent = body.intent;

  if (
    intent !== "readiness_summary" &&
    intent !== "text_intake_review" &&
    intent !== "admin_review" &&
    intent !== "correction_draft" &&
    intent !== "export_guard"
  ) {
    return Response.json(
      { error: "Unsupported helper intent." },
      { status: 400, headers: corsHeaders },
    );
  }

  return Response.json(safeResponse(intent), { headers: corsHeaders });
});
