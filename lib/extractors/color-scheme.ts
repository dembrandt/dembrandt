import type { Page } from 'playwright';

function surface() {
  return getComputedStyle(document.body || document.documentElement).backgroundColor + '|' +
    getComputedStyle(document.documentElement).backgroundColor;
}

export async function switchToDark(page: Page, capMs: number, settleMs: number) {
  const before = await page.evaluate(surface);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-mode', 'dark');
    document.body.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark', 'dark-mode', 'theme-dark');
    document.body.classList.add('dark', 'dark-mode', 'theme-dark');
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction((b) => {
    const now = getComputedStyle(document.body || document.documentElement).backgroundColor + '|' +
      getComputedStyle(document.documentElement).backgroundColor;
    return now !== b;
  }, before, { timeout: capMs }).catch(() => {});
  await page.waitForTimeout(settleMs);
}
