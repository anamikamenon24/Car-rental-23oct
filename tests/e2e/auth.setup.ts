// Logs in once as each seeded role and saves the session for the browser projects.
import { test as setup } from "@playwright/test";
import { seedUsers } from "../helpers/credentials";
import { login, STORAGE_STATE } from "./fixtures/auth";

for (const role of ["customer", "admin"] as const) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const users = await seedUsers();
    await login(page, users[role]);
    await page.context().storageState({ path: STORAGE_STATE[role] });
  });
}
