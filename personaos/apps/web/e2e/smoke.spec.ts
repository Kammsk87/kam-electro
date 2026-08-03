import { expect, test } from "@playwright/test";

test("protected dashboard redirects to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Sign in to PersonaOS" })).toBeVisible();
});

test("sign up page introduces PersonaOS setup", async ({ page }) => {
  await page.goto("/auth/sign-up");
  await expect(page.getByRole("heading", { name: "Создай PersonaOS" })).toBeVisible();
});
