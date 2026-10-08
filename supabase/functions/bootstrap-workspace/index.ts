import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const userId = ctx.userClaims?.sub;
    if (!userId) {
      return Response.json(
        { error: "AUTH_REQUIRED" },
        { status: 401, headers: corsHeaders },
      );
    }

    const workspaceId = "workspace-" + userId;
    const membershipId = "membership-" + userId;
    const brandId = "brand-default-" + userId;

    const { error: workspaceError } = await ctx.supabaseAdmin
      .from("workspaces")
      .upsert(
        {
          id: workspaceId,
          name: "OrbitoOS Workspace",
          slug:
            "orbitoos-" + userId.replaceAll("-", "").slice(0, 12),
          timezone: "UTC",
          settings: { activeBrandId: brandId },
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (workspaceError) throw workspaceError;

    const { error: membershipError } = await ctx.supabaseAdmin
      .from("workspace_members")
      .upsert(
        {
          id: membershipId,
          workspace_id: workspaceId,
          user_id: userId,
          role: "owner",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (membershipError) throw membershipError;

    const { error: brandError } = await ctx.supabaseAdmin
      .from("brands")
      .upsert(
        {
          id: brandId,
          workspace_id: workspaceId,
          name: "OrbitoOS",
          voice: "Clear, direct, curious. Teach first; sell second.",
          audience: "Early-stage creators and small teams.",
          pillars: ["Education", "Systems", "Workflow"],
          prohibited: ["No invented facts or fake proof"],
          visual_direction: "Clean, focused, useful.",
          posting_goals: {},
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (brandError) throw brandError;

    return Response.json(
      {
        workspaceId,
        role: "owner",
        brandId,
        bootstrapped: true,
      },
      { headers: corsHeaders },
    );
  }),
);
