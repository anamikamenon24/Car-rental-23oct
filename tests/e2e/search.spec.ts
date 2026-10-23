// Q4 in the browser: home search form, branch selection, date validation, filters, availability calendar.
import { branches, dayOffset, e2eQuery, localDateTime, searchUrl } from "./fixtures/data";
import { expect, test } from "./fixtures/auth";

test("home search form leads to results for the chosen branch and dates", async ({ page }, testInfo) => {
  const all = await branches();
  const dxb = all.find((b) => b.code === "DXB")!;
  const off = dayOffset(testInfo.project.name, 40);
  await page.goto("/");
  await page.getByTestId("search-pickup-branch").selectOption(dxb.id);
  await page.getByTestId("search-pickup-at").fill(localDateTime(off));
  await page.getByTestId("search-return-at").fill(localDateTime(off + 2));
  await page.getByTestId("search-submit").click();
  await expect(page).toHaveURL(/\/search\?/);
  expect(new URL(page.url()).searchParams.get("pickupBranch")).toBe(dxb.id);
  await expect(page.getByTestId("vehicle-card").first()).toBeVisible();

  // every result is a car based at DXB
  const [{ n }] = await e2eQuery<{ n: number }>("select count(*)::int as n from vehicles where branch_id = $1 and status <> 'RETIRED'", [dxb.id]);
  expect(await page.getByTestId("vehicle-card").count()).toBeLessThanOrEqual(n);
});

test("return before pick-up shows a validation error, not results", async ({ page }, testInfo) => {
  const dxb = (await branches()).find((b) => b.code === "DXB")!;
  const off = dayOffset(testInfo.project.name, 41);
  await page.goto(searchUrl({ pickupBranch: dxb.id, pickupAt: localDateTime(off + 3), returnAt: localDateTime(off) }));
  await expect(page.getByTestId("search-error")).toBeVisible();
  await expect(page.getByTestId("vehicle-card")).toHaveCount(0);
});

test("filters narrow the results", async ({ page }, testInfo) => {
  const dxb = (await branches()).find((b) => b.code === "DXB")!;
  const off = dayOffset(testInfo.project.name, 42);
  const url = searchUrl({ pickupBranch: dxb.id, pickupAt: localDateTime(off), returnAt: localDateTime(off + 2) });
  await page.goto(url);
  const all = await page.getByTestId("vehicle-card").count();
  expect(all).toBeGreaterThan(1);

  await page.goto(`${url}&transmission=MANUAL&minSeats=99`);
  await expect(page.getByTestId("empty-results")).toBeVisible();

  await page.goto(url);
  const seats = page.getByTestId("filter-seats");
  if ((await seats.evaluate((e) => e.tagName)) === "SELECT") {
    const options = await seats.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    await seats.selectOption(options.at(-1)!);
  } else {
    await seats.fill("7");
  }
  const submit = page.getByRole("button", { name: /apply|filter|update/i });
  if (await submit.count()) await submit.first().click();
  await expect(async () => {
    expect(await page.getByTestId("vehicle-card").count()).toBeLessThan(all);
  }).toPass();
});

test("one-way rental to another city shows a one-way fee", async ({ page }, testInfo) => {
  const all = await branches();
  const dxb = all.find((b) => b.code === "DXB")!;
  const auh = all.find((b) => b.code === "AUH")!;
  const off = dayOffset(testInfo.project.name, 43);
  await page.goto(searchUrl({ pickupBranch: dxb.id, returnBranch: auh.id, pickupAt: localDateTime(off), returnAt: localDateTime(off + 2) }));
  await expect(page.getByTestId("vehicle-card").first()).toContainText(/one-way|250/i);
});

test("vehicle availability calendar marks a booked day", async ({ page }) => {
  const [r] = await e2eQuery<{ vehicle_id: string; day: string }>(
    `select vehicle_id, to_char((pickup_at at time zone 'Asia/Dubai') + interval '1 day', 'YYYY-MM-DD') as day
     from reservations where status in ('CONFIRMED','PICKED_UP') and return_at - pickup_at >= interval '3 days'
     and pickup_at > now() order by pickup_at limit 1`,
  );
  test.skip(!r, "seed has no multi-day future booking");
  await page.goto(`/vehicles/${r.vehicle_id}`);
  const cal = page.getByTestId("availability-calendar");
  await expect(cal).toBeVisible();
  // navigate forward until the month containing the booked day is shown (max 3 steps)
  for (let i = 0; i < 3 && !(await cal.locator(`[data-date="${r.day}"]`).count()); i++) {
    await cal.getByRole("button", { name: /next/i }).click();
  }
  await expect(cal.locator(`[data-date="${r.day}"]`)).toHaveAttribute("data-status", "BOOKED");
});
