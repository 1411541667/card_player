import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function startRun(page: Page, testInfo?: TestInfo): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('menu')).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('menu.png'), fullPage: true });
  await page.getByTestId('new-run').click();
  await expect(page.getByTestId('character-select')).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('character.png'), fullPage: true });
  await page.getByTestId('character-select').locator('.selection-card.available').click();
  await expect(page.getByTestId('boon-select')).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('boon.png'), fullPage: true });
  await page.getByTestId('boon-select').locator('.selection-card.available').filter({ hasNotText: /意外横财|轻装上路/ }).first().click();
  await expect(page.getByTestId('theme-select')).toBeVisible();
  if (testInfo) await page.screenshot({ path: testInfo.outputPath('theme.png'), fullPage: true });
  await page.getByTestId('theme-select').locator('.selection-card.available').click();
  await expect(page.getByTestId('map-panel')).toBeVisible();
}

test('boots, completes setup, and enters a node', async ({ page }, testInfo) => {
  await startRun(page, testInfo);
  await page.screenshot({ path: testInfo.outputPath('map.png'), fullPage: true });
  await page.locator('.node-list button').first().click();
  await expect(page.locator('[data-testid="combat"], [data-testid="shop"], [data-testid="event"], [data-testid="reward"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('node.png'), fullPage: true });
  await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('settings, encyclopedia, and statistics are available from the main menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByText('手牌 10')).toBeVisible();
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: '百科' }).click();
  await expect(page.getByTestId('encyclopedia')).toBeVisible();
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: '统计' }).click();
  await expect(page.getByTestId('stats')).toBeVisible();
});

test('developer panel can export a versioned save', async ({ page }) => {
  await startRun(page);
  await page.getByRole('button', { name: '开发面板' }).click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
  await page.getByText('存档导入导出').click();
  await page.getByRole('button', { name: '导出到文本框' }).click();
  await expect(page.locator('.debug-panel textarea')).toHaveValue(/"schemaVersion": 2/);
});

test('combat presentation exposes hand, intent, and turn controls', async ({ page }, testInfo) => {
  await startRun(page);
  await page.getByRole('button', { name: '开发面板' }).click();
  await page.getByText('跳转节点').click();
  await page.locator('.debug-node-grid button').filter({ hasText: 'core.combat' }).first().click();
  await page.getByTestId('debug-panel').getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('combat')).toBeVisible();
  await expect(page.locator('.hand .card')).not.toHaveCount(0);
  await expect(page.getByTestId('end-turn')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('combat.png'), fullPage: true });
});

test('shop and event handlers expose their authored content', async ({ page }) => {
  await startRun(page);
  await page.getByRole('button', { name: '开发面板' }).click();
  await page.getByText('跳转节点').click();
  await page.locator('.debug-node-grid button').filter({ hasText: 'core.shop' }).first().click();
  await page.getByTestId('debug-panel').getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await expect(page.locator('.shop-offer')).toHaveCount(7);

  await page.getByRole('button', { name: '开发面板' }).click();
  await page.getByText('启动事件').click();
  await page.locator('.debug-node-grid button').filter({ hasText: '风沙渐起' }).first().click();
  await page.getByTestId('debug-panel').getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('event')).toBeVisible();
  await expect(page.getByTestId('event').locator('button')).toHaveCount(3);
});
