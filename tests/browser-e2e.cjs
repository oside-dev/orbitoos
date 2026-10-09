const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.ORBITOS_PLAYWRIGHT_MODULE || "playwright",
);

const MOCK_SUPABASE_SDK = `
window.__orbitBrowserE2E = { calls: [] };
export function createClient() {
  const mock = window.__orbitBrowserE2E;
  return {
    auth: {
      async getSession() {
        mock.calls.push({ op: "getSession" });
        return { data: { session: null }, error: null };
      },
      async getUser() {
        mock.calls.push({ op: "getUser" });
        return { data: { user: null }, error: { message: "Auth session missing" } };
      },
      async signUp({ email, password }) {
        mock.calls.push({ op: "signUp", email, passwordProvided: Boolean(password) });
        return {
          data: {
            user: {
              id: "browser-e2e-confirmation-user",
              email,
              app_metadata: { provider: "email", providers: ["email"] },
              user_metadata: {},
              identities: [],
            },
            session: null,
          },
          error: null,
        };
      },
      async resend(input) {
        mock.calls.push({ op: "resend", input });
        return { data: {}, error: null };
      },
      async signInWithPassword() {
        throw new Error("Sign-in is intentionally outside the signed-out browser test.");
      },
      async signOut() {
        return { data: {}, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    functions: {
      async invoke(name) {
        mock.calls.push({ op: "function", name });
        return { data: null, error: { message: "Unexpected function call in signed-out test" } };
      },
    },
    from(table) {
      mock.calls.push({ op: "from", table });
      throw new Error("Unexpected database access in signed-out browser test.");
    },
  };
}
`;

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
  const consoleErrors = [];

  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

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
    assert.match(await page.title(), /OrbitOS/);
    await page.waitForFunction(() => Boolean(window.orbitCore), null, {
      timeout: 15000,
    });

    const environment = await page.evaluate(() =>
      window.orbitCore.getEnvironment()
    );
    assert.equal(environment.mode, "local");
    assert.equal(environment.authenticated, false);

    const navigation = page.locator(".nav button");
    const navigationCount = await navigation.count();
    assert.equal(navigationCount, 9);
    for (let index = 0; index < navigationCount; index += 1) {
      const button = navigation.nth(index);
      await button.click();
      assert.equal(
        await button.evaluate((element) => element.classList.contains("active")),
        true,
        `Navigation item ${index} should become active`,
      );
      assert.ok((await page.locator("#root").innerText()).length > 30);
    }

    await page.locator(".nav button").filter({ hasText: "Settings" }).click();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.locator("#authEmail").fill("browser-e2e@example.invalid");
    await page.locator("#authPassword").fill("non-production-test-password");
    await page.locator("#modalRoot")
      .getByRole("button", { name: "Create account", exact: true })
      .click();

    await page.getByText("Confirm your email", { exact: true }).waitFor({
      timeout: 5000,
    });
    assert.match(
      await page.locator("#modalRoot").innerText(),
      /Check your inbox for a confirmation link/,
    );

    await page.locator("#modalRoot")
      .getByRole("button", { name: "Resend confirmation email", exact: true })
      .click();
    await page.getByText(
      /If an eligible account exists, a confirmation email has been sent/,
    ).waitFor({ timeout: 5000 });

    const authCalls = await page.evaluate(() => window.__orbitBrowserE2E.calls);
    assert.equal(authCalls.filter((call) => call.op === "signUp").length, 1);
    assert.deepEqual(
      authCalls.filter((call) => call.op === "resend").map((call) => call.input),
      [{ type: "signup", email: "browser-e2e@example.invalid" }],
    );
    assert.equal(
      authCalls.some((call) => call.op === "getUser" || call.op === "from" || call.op === "function"),
      false,
      "confirmation-required signup must not bootstrap or query a workspace without a session",
    );

    await page.locator("#modalRoot")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.locator(".nav button").first().click();
    await page.getByRole("button", { name: /New idea/i }).first().click();

    await page.locator("#newTitle").fill("CI browser e2e persistence check");
    await page.locator("#newPillar").fill("Systems");
    await page.locator("#newAudience").fill("OrbitOS test suite");
    await page.locator("#newBrief").fill("Validate browser-created data persists locally.");
    await page.locator("#modalRoot")
      .getByRole("button", { name: /Create & research/i })
      .click();

    let snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    assert.ok(snapshot.ideas.some((idea) =>
      idea.title === "CI browser e2e persistence check"
    ));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.orbitCore), null, {
      timeout: 15000,
    });
    snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    assert.ok(snapshot.ideas.some((idea) =>
      idea.title === "CI browser e2e persistence check"
    ), "new idea should persist across a browser reload");

    await page.locator(".nav button").filter({ hasText: "Settings" }).click();
    await page.getByRole("button", { name: "Restore demo workspace", exact: true }).waitFor({ timeout: 5000 });
    await page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Restore demo workspace", exact: true }).click();
    await page.getByText("Demo workspace restored", { exact: true }).waitFor({ timeout: 5000 });
    snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    assert.ok(snapshot.ideas.some((idea) =>
      idea.title === "Why most content hooks fail in the first 2 seconds"
    ), "restoring demo should reintroduce the seeded idea");
    assert.ok(!snapshot.ideas.some((idea) =>
      idea.title === "CI browser e2e persistence check"
    ), "restoring demo should replace only the local browser data");

    await page.locator(".nav button").filter({ hasText: "Analytics" }).click();
    await page.locator("#analyticsFileInput").setInputFiles({
      name: "browser-e2e-report.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "platform,date,views,reach,engagements,follower_delta\n" +
        "TikTok,2026-10-01,1000,900,90,12\n" +
        "LinkedIn,2026-10-01,500,450,25,4",
      ),
    });
    await page.getByText("Analytics report imported", { exact: true }).waitFor({
      timeout: 10000,
    });
    snapshot = await page.evaluate(() => window.orbitCore.snapshot());
    const metrics = snapshot.metrics.filter((metric) =>
      metric.source === "browser-e2e-report.csv"
    );
    assert.equal(metrics.length, 2);
    assert.deepEqual(metrics.map((metric) => metric.followerDelta), [12, 4]);
    assert.equal(metrics.every((metric) => metric.isDemo === false), true);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);

    console.log(
      "OrbitOS browser E2E passed: clean startup, navigation, signup confirmation/resend, local persistence, demo recovery and CSV import.",
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
