const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.ORBITOS_PLAYWRIGHT_MODULE || "playwright",
);

const MOCK_SUPABASE_SDK = "\nwindow.__orbitAuthenticatedE2E = { calls: [], rows: null };\nconst user = {\n  id: \"11111111-1111-4111-8111-111111111111\",\n  email: \"owner@example.invalid\",\n  app_metadata: { provider: \"email\", providers: [\"email\"] },\n  user_metadata: {},\n  identities: [],\n};\nconst workspaceId = \"workspace-browser-\" + user.id;\nconst brandId = \"brand-browser-\" + user.id;\nconst session = {\n  user,\n  access_token: \"mock-browser-e2e-access-token\",\n  refresh_token: \"mock-browser-e2e-refresh-token\",\n  expires_at: 1900000000,\n  token_type: \"bearer\",\n};\nconst initialRows = {\n  workspace_members: [{\n    id: \"membership-browser-e2e\",\n    user_id: user.id,\n    workspace_id: workspaceId,\n    role: \"owner\",\n  }],\n  workspaces: [{\n    id: workspaceId,\n    name: \"Authenticated Browser QA Workspace\",\n    slug: \"authenticated-browser-qa\",\n    timezone: \"UTC\",\n    settings: { activeBrandId: brandId },\n  }],\n  brands: [{\n    id: brandId,\n    workspace_id: workspaceId,\n    name: \"OrbitoOS Browser QA\",\n    voice: \"Clear and useful.\",\n    audience: \"Browser QA operators.\",\n    pillars: [\"Education\"],\n    prohibited: [\"No fabricated claims\"],\n    visual_direction: \"Simple and clear.\",\n    posting_goals: {},\n  }],\n  ideas: [],\n  research_items: [],\n  content_items: [],\n  content_variants: [],\n  schedules: [],\n  social_accounts: [],\n  publishing_jobs: [],\n  analytics_snapshots: [],\n  agent_runs: [],\n  learning_insights: [],\n};\nlet storedRows = null;\ntry {\n  storedRows = JSON.parse(localStorage.getItem(\"__orbit_authenticated_browser_e2e_db\") || \"null\");\n} catch {}\nconst rows = new Map(Object.entries(storedRows || initialRows));\nfunction persistRows() {\n  localStorage.setItem(\"__orbit_authenticated_browser_e2e_db\", JSON.stringify(Object.fromEntries(rows.entries())));\n  window.__orbitAuthenticatedE2E.rows = rows;\n}\npersistRows();\n\nfunction query(table) {\n  const filters = [];\n  const q = {\n    select() { return q; },\n    eq(column, value) {\n      filters.push([column, value]);\n      return q;\n    },\n    upsert(payload) {\n      const incoming = Array.isArray(payload) ? payload : [payload];\n      const byId = new Map((rows.get(table) || []).map((row) => [row.id, row]));\n      for (const row of incoming) byId.set(row.id, structuredClone(row));\n      rows.set(table, [...byId.values()]);\n      persistRows();\n      return Promise.resolve({ data: structuredClone(incoming), error: null });\n    },\n    delete() {\n      return {\n        async eq(column, value) {\n          rows.set(table, (rows.get(table) || []).filter((row) => row[column] !== value));\n          persistRows();\n          return { data: [], error: null };\n        },\n      };\n    },\n    then(resolve, reject) {\n      try {\n        let result = rows.get(table) || [];\n        for (const [column, value] of filters) {\n          result = result.filter((row) => row[column] === value);\n        }\n        return Promise.resolve({ data: structuredClone(result), error: null }).then(resolve, reject);\n      } catch (error) {\n        return Promise.reject(error).then(resolve, reject);\n      }\n    },\n  };\n  return q;\n}\n\nexport function createClient() {\n  const mock = window.__orbitAuthenticatedE2E;\n  return {\n    auth: {\n      async getSession() {\n        mock.calls.push({ op: \"getSession\" });\n        return { data: { session }, error: null };\n      },\n      async getUser() {\n        mock.calls.push({ op: \"getUser\" });\n        return { data: { user }, error: null };\n      },\n      async signOut() {\n        return { data: {}, error: null };\n      },\n      onAuthStateChange() {\n        return { data: { subscription: { unsubscribe() {} } } };\n      },\n    },\n    functions: {\n      async invoke(name, input) {\n        mock.calls.push({ op: \"function\", name, input });\n        if (name !== \"bootstrap-workspace\") {\n          throw new Error(\"Unexpected function call in authenticated browser E2E: \" + name);\n        }\n        return {\n          data: {\n            workspaceId,\n            membershipId: \"membership-browser-e2e\",\n            role: \"owner\",\n            brandId,\n            bootstrapped: true,\n          },\n          error: null,\n        };\n      },\n    },\n    from(table) {\n      mock.calls.push({ op: \"from\", table });\n      return query(table);\n    },\n  };\n}\n";

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.route(
    "**/npm/@supabase/supabase-js@2.117.3/+esm",
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
        body: MOCK_SUPABASE_SDK,
      });
    },
  );

  try {
    const response = await page.goto("http://127.0.0.1:4173/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    assert.equal(response?.status(), 200);
    await page.getByRole("heading", { name: "Activity", exact: true }).waitFor({
      timeout: 15000,
    });

    const environment = await page.evaluate(() => window.orbitCore.getEnvironment());
    assert.deepEqual(environment, {
      mode: "authenticated-persistent",
      provider: "supabase",
      workspaceId: "workspace-browser-11111111-1111-4111-8111-111111111111",
      userId: "11111111-1111-4111-8111-111111111111",
      persistent: true,
      authenticated: true,
    });

    const bootText = await page.locator("#root").innerText();
    assert.match(bootText, /AUTHENTICATED/);
    assert.match(bootText, /Authenticated Browser QA Workspace/);
    assert.equal(
      pageErrors.some((message) => message.includes("reading 'slice'")),
      false,
      "authenticated overview must not crash with empty activity history",
    );

    await page.locator(".nav button").filter({ hasText: "Ideas" }).click();
    await page.getByRole("button", { name: /New idea/i }).first().click();
    const title = "Authenticated browser persistence check";
    await page.locator("#newTitle").fill(title);
    await page.locator("#newPillar").fill("Systems");
    await page.locator("#newAudience").fill("Authenticated browser E2E");
    await page.locator("#newBrief").fill(
      "Create a draft, edit a platform variant, and confirm it survives reload.",
    );
    await page.locator("#modalRoot")
      .getByRole("button", { name: /Create & research/i })
      .click();

    let snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    assert.ok(snapshot.ideas.some((idea) => idea.title === title));
    assert.equal(snapshot.contentVariants.length, 6);
    const ideaId = snapshot.ideas.find((idea) => idea.title === title).id;
    const hook = "This authenticated variant edit must survive reload.";
    await page.evaluate(async ({ ideaId, hook }) => {
      await window.orbitCore.updateContentVariant({
        ideaId,
        platform: "TikTok",
        changes: { hook },
      });
    }, { ideaId, hook });

    const rowsBeforeReload = await page.evaluate(() => ({
      ideaCount: (window.__orbitAuthenticatedE2E.rows.get("ideas") || []).length,
      contentItemCount: (window.__orbitAuthenticatedE2E.rows.get("content_items") || []).length,
      variantHooks: (window.__orbitAuthenticatedE2E.rows.get("content_variants") || [])
        .filter((row) => row.platform === "TikTok")
        .map((row) => row.hook),
      publishingJobs: (window.__orbitAuthenticatedE2E.rows.get("publishing_jobs") || []).length,
    }));
    assert.ok(rowsBeforeReload.ideaCount >= 1);
    assert.ok(rowsBeforeReload.contentItemCount >= 1);
    assert.ok(rowsBeforeReload.variantHooks.includes(hook));
    assert.equal(rowsBeforeReload.publishingJobs, 0, "content authoring must not create publishing jobs");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Activity", exact: true }).waitFor({
      timeout: 15000,
    });
    snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    assert.ok(snapshot.ideas.some((idea) => idea.id === ideaId && idea.title === title));
    const expectedContentItemId = snapshot.contentItems.find((item) => item.ideaId === ideaId)?.id;
    assert.equal(
      snapshot.contentVariants.find((variant) =>
        variant.platform === "TikTok" && variant.contentItemId === expectedContentItemId
      )?.hook,
      hook,
      "authenticated content edits must survive a full browser reload",
    );
    assert.equal(pageErrors.length, 0, "authenticated browser flow must not throw page errors");
    console.log("OrbitOS authenticated browser end-to-end tests passed.");
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
