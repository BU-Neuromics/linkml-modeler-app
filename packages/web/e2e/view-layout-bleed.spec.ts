/**
 * E2E reproduction for issue #105 regression:
 *   moving a node while a named view is active must NOT change the node's
 *   position in the base schema layout once the view is deactivated.
 */
import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __lme_e2e__: {
      loadSchema(yaml: string, opts?: { filePath?: string; rootPath?: string }): void;
      setSelection(nodeIds: string[]): void;
    };
  }
}

const MULTI_CLASS_YAML = `
id: https://example.org/multi
name: multi
default_prefix: ex
prefixes:
  ex: https://example.org/

classes:
  Alpha:
    attributes:
      label:
        range: string
  Beta:
    attributes:
      value:
        range: string
  Gamma:
    is_a: Alpha
`.trim();

async function waitForHelper(page: Page) {
  await page.waitForFunction(() => !!(window as Window).__lme_e2e__, { timeout: 15_000 });
}

async function nodeTranslate(page: Page, id: string): Promise<{ x: number; y: number }> {
  const el = page.locator(`.react-flow__node[data-id="${id}"]`);
  const transform = await el.evaluate((n) => (n as HTMLElement).style.transform);
  const m = /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/.exec(transform);
  if (!m) throw new Error(`no translate for ${id}: ${transform}`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

async function dragNode(page: Page, id: string, dx: number, dy: number) {
  const el = page.locator(`.react-flow__node[data-id="${id}"]`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`no bbox for ${id}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 5 });
  await page.mouse.move(cx + dx, cy + dy, { steps: 5 });
  await page.mouse.up();
}

test('view drag does not bleed into schema layout', async ({ page }) => {
  await page.goto('/');
  await waitForHelper(page);
  await page.evaluate((yaml) => window.__lme_e2e__.loadSchema(yaml), MULTI_CLASS_YAML);
  await expect(page.locator('#lme-canvas-wrapper')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.react-flow__node[data-id="Alpha"]')).toBeVisible({ timeout: 5_000 });

  // Give auto-layout a moment to settle.
  await page.waitForTimeout(800);

  const schemaBefore = await nodeTranslate(page, 'Alpha');

  // ── Plain schema-mode drag (the highest-traffic path through the handler) ──
  const betaBefore = await nodeTranslate(page, 'Beta');
  await dragNode(page, 'Beta', 180, 90);
  await page.waitForTimeout(300);
  const betaMoved = await nodeTranslate(page, 'Beta');
  // The schema drag must have persisted.
  expect(Math.abs(betaMoved.x - betaBefore.x)).toBeGreaterThan(50);

  // ── Create + activate a view containing Alpha (and others) ──
  await page.evaluate(() => window.__lme_e2e__.setSelection(['Alpha', 'Beta', 'Gamma']));
  await page.locator('#lme-focus-toolbar').getByText('+ Save View').click();
  await page.waitForTimeout(400);

  // ── Drag Alpha inside the view ──
  await dragNode(page, 'Alpha', 220, 140);
  await page.waitForTimeout(400);
  const viewAfter = await nodeTranslate(page, 'Alpha');
  // Sanity: the drag actually moved the node within the view.
  expect(Math.abs(viewAfter.x - schemaBefore.x)).toBeGreaterThan(50);

  // ── Deactivate the view (click its row in ProjectPanel) ──
  await page.locator('text=View 1').first().click();
  await page.waitForTimeout(500);

  // The schema position of Alpha must be unchanged by the in-view drag.
  const schemaAfter = await nodeTranslate(page, 'Alpha');
  expect(Math.abs(schemaAfter.x - schemaBefore.x)).toBeLessThan(5);
  expect(Math.abs(schemaAfter.y - schemaBefore.y)).toBeLessThan(5);

  // ── Re-activate the view: the drag must have persisted to the view layout. ──
  await page.locator('text=View 1').first().click();
  await page.waitForTimeout(500);
  const viewReopened = await nodeTranslate(page, 'Alpha');
  expect(Math.abs(viewReopened.x - viewAfter.x)).toBeLessThan(5);
  expect(Math.abs(viewReopened.y - viewAfter.y)).toBeLessThan(5);

  // The schema-mode drag of Beta must be undisturbed by all the view activity.
  await page.locator('text=View 1').first().click(); // back to schema
  await page.waitForTimeout(400);
  const betaFinal = await nodeTranslate(page, 'Beta');
  expect(Math.abs(betaFinal.x - betaMoved.x)).toBeLessThan(5);
  expect(Math.abs(betaFinal.y - betaMoved.y)).toBeLessThan(5);
});
