// Q9: full rental in the browser: search → vehicle → dates/extras → driver + licence → checkout
// (declined, then retry) → voucher → admin check-out → admin check-in.
import path from "node:path";
import { branches, dayOffset, localDateTime, reservationByReference, searchUrl } from "./fixtures/data";
import { expect, test } from "./fixtures/auth";

const licenceFile = path.resolve(process.cwd(), "tests/e2e/fixtures/licence.png");

test("complete rental: search → pay (after a decline) → voucher → check-out → check-in", async ({ customerPage: page, adminPage: admin }, testInfo) => {
  test.slow();
  const dxb = (await branches()).find((b) => b.code === "DXB")!;
  const off = dayOffset(testInfo.project.name, 0);

  // Search
  await page.goto(searchUrl({ pickupBranch: dxb.id, pickupAt: localDateTime(off), returnAt: localDateTime(off + 3) }));
  const card = page.getByTestId("vehicle-card").first();
  await expect(card).toBeVisible();
  await card.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/vehicles\//);
  await expect(page.getByTestId("availability-calendar")).toBeVisible();
  await page.getByTestId("book-now").click();

  // Dates step (prefilled from search) → extras
  await expect(page).toHaveURL(/\/book\//);
  if (await page.getByTestId("search-pickup-at").first().isVisible()) {
    await page.getByTestId("search-pickup-at").first().fill(localDateTime(off));
    await page.getByTestId("search-return-at").first().fill(localDateTime(off + 3));
  }
  await page.getByRole("button", { name: "Continue to extras" }).click();
  await expect(page).toHaveURL(/\/extras/);
  await page.getByTestId("extra-GPS").check();
  await expect(page.getByTestId("price-days")).toContainText("3");
  await expect(page.getByTestId("price-vat")).toContainText("AED");
  await expect(page.getByTestId("price-deposit")).toContainText("AED");
  const toDriver = page.getByRole("button", { name: "Continue to driver details" });
  await expect(toDriver).toBeEnabled();
  await toDriver.click();

  // Driver + licence
  await expect(page).toHaveURL(/\/driver/);
  const fillIfEmpty = async (id: string, v: string) => {
    const f = page.getByTestId(id);
    if ((await f.count()) && !(await f.inputValue())) await f.fill(v);
  };
  await fillIfEmpty("driver-full-name", "E2E Driver");
  await fillIfEmpty("driver-phone", "+971501234567");
  await fillIfEmpty("driver-dob", "1990-01-15");
  await fillIfEmpty("driver-licence-number", "DXB-123456");
  await fillIfEmpty("driver-licence-expires", "2032-01-01");
  const country = page.getByTestId("driver-licence-country");
  if (await country.count()) {
    if ((await country.evaluate((e) => e.tagName)) === "SELECT") await country.selectOption("AE");
    else if (!(await country.inputValue())) await country.fill("AE");
  }
  await page.getByTestId("licence-upload").setInputFiles(licenceFile);
  await expect(page.getByTestId("licence-upload-done")).toBeVisible();
  const toCheckout = page.getByRole("button", { name: "Reserve and continue to payment" });
  await expect(toCheckout).toBeEnabled();
  await toCheckout.click();

  // Checkout: declined first, then retry with a good card
  await expect(page).toHaveURL(/\/checkout\//);
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  const total = await page.getByTestId("price-total").first().innerText();
  await page.getByTestId("payment-method").selectOption("pm_fake_declined");
  await page.getByTestId("pay-submit").click();
  await expect(page.getByTestId("payment-error")).toBeVisible();
  await page.getByTestId("payment-method").selectOption("pm_fake_success");
  const retry = page.getByTestId("payment-retry");
  if (await retry.isVisible()) {
    await retry.click();
  } else {
    await page.getByTestId("pay-submit").click();
  }

  // Voucher
  await expect(page).toHaveURL(/\/voucher/);
  const reference = (await page.getByTestId("voucher-reference").innerText()).trim();
  await expect(page.getByTestId("voucher-qr")).toBeVisible();
  const row = await reservationByReference(reference);
  expect(row.status).toBe("CONFIRMED");
  expect(total.replace(/[^\d.]/g, "")).toBe((row.total_fils / 100).toFixed(2));

  // Admin check-out
  await admin.goto(`/admin/reservations/${row.id}`);
  await admin.getByTestId("checkout-mileage").fill("12000");
  await selectOrFill(admin.getByTestId("checkout-fuel"), "8");
  await admin.getByTestId("checkout-submit").click();
  await expect(admin.getByTestId("reservation-status").first()).toHaveAttribute("data-status", "PICKED_UP");
  expect((await reservationByReference(reference)).status).toBe("PICKED_UP");

  // Admin check-in (early return: no late fee; 2 eighths of fuel missing)
  await admin.getByTestId("checkin-mileage").fill("12350");
  await selectOrFill(admin.getByTestId("checkin-fuel"), "6");
  await admin.getByTestId("checkin-submit").click();
  await expect(admin.getByTestId("reservation-status").first()).toHaveAttribute("data-status", "RETURNED");
  expect((await reservationByReference(reference)).status).toBe("RETURNED");

  // Customer sees it as returned
  await page.goto(`/account/rentals/${row.id}`);
  await expect(page.getByTestId("reservation-status").first()).toHaveAttribute("data-status", "RETURNED");
});

async function selectOrFill(loc: import("@playwright/test").Locator, value: string) {
  if ((await loc.evaluate((e) => e.tagName)) === "SELECT") await loc.selectOption(value);
  else await loc.fill(value);
}
