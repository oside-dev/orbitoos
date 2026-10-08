import { assertWorkspaceContextAdapter } from "../contracts/auth.mjs";

export function createSupabaseWorkspaceContextAdapter({
  client,
} = {}) {
  if (!client || typeof client.from !== "function") {
    throw new Error(
      "OrbitOS workspace context adapter requires a Supabase-compatible client.",
    );
  }

  async function listForUser({ userId } = {}) {
    const id = String(userId ?? "").trim();
    if (!id) throw new Error("OrbitOS workspace context requires a userId.");

    const result = await client
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("user_id", id);

    if (result?.error) {
      throw new Error(
        "OrbitOS workspace membership lookup failed: " +
          result.error.message,
      );
    }

    return (result?.data ?? []).map((row) => ({
      workspaceId: String(row.workspace_id),
      role: String(row.role ?? "viewer"),
    }));
  }

  return assertWorkspaceContextAdapter(
    Object.freeze({
      provider: "supabase",
      listForUser,
    }),
  );
}
