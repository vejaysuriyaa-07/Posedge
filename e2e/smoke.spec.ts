import { expect, test, type Page } from '@playwright/test';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function dayColumnWithTask(page: Page) {
  // Wait for the live query to render the week before scanning the columns.
  await expect
    .poll(async () => {
      let n = 0;
      for (const day of DAYS)
        n += await page.getByLabel(day, { exact: true }).locator('[data-task-id]').count();
      return n;
    })
    .toBeGreaterThan(0);
  for (const [i, day] of DAYS.entries()) {
    const col = page.getByLabel(day, { exact: true });
    if ((await col.locator('[data-task-id]').count()) > 0) return { i, day, col };
  }
  throw new Error('No planned tasks in this week');
}

test('Posedge smoke: template, quick add + card, review, keyboard drag, export', async ({
  page,
}) => {
  // 1. Open the app and choose the template.
  await page.goto('./');
  await page.getByRole('button', { name: "Start with VJ's template" }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Posedge' })).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Projects' }).getByText('DV Interview Prep'),
  ).toBeVisible();

  // 2. Quick-add a #learn task for today, complete it, and lock in a card.
  await page.keyboard.press('n');
  const quick = page.getByRole('dialog', { name: 'Quick add' });
  await quick.getByLabel('Quick add task').fill('Read SVA sequences chapter ~30m #learn @today');
  await expect(quick.getByText('Learn', { exact: true })).toBeVisible();
  await quick.getByLabel('Quick add task').press('Enter');
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Complete: Read SVA sequences chapter' }).click();
  const lock = page.getByRole('dialog', { name: 'What should future-you be able to recall?' });
  await expect(lock).toBeVisible();
  await lock.getByLabel('Prompt').fill('What does |-> mean in an SVA property?');
  await lock
    .getByLabel('Answer / your notes')
    .fill('Overlapping implication: the consequent is checked in the same cycle.');
  await lock.getByRole('button', { name: /Save card/ }).click();
  await expect(lock).toBeHidden();

  // 3. Review: the new card is not due today (first review is tomorrow at 04:00).
  await page.goto('./#/review');
  await expect(page.getByText('All caught up.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Cards', exact: true }).click();
  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'What does |-> mean in an SVA property?' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/due in/);
  await expect(row).toContainText('New');

  // 4. Keyboard-drag a task to the neighbouring day.
  await page.goto('./#/week');
  const { i, col } = await dayColumnWithTask(page);
  const targetDay = DAYS[i === 6 ? 5 : i + 1]!;
  const card = col.locator('[data-task-id]').first();
  const taskId = await card.getAttribute('data-task-id');
  const handle = card.getByRole('button', { name: /^Move / });
  await handle.focus();
  // Human-speed key presses: dnd-kit measures drop targets right after pick-up.
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press(i === 6 ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await expect(
    page.getByLabel(targetDay, { exact: true }).locator(`[data-task-id="${taskId}"]`),
  ).toBeVisible();

  // 5. Export a backup and confirm a file downloads.
  await page.goto('./#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^posedge-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // 6. The Brain: G then B opens it; the graph shows the projects; asking needs an API key.
  await page.keyboard.press('g');
  await page.keyboard.press('b');
  await expect(page.getByRole('heading', { name: 'Ask your brain' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Focus a project' }).getByText('DV Interview Prep'),
  ).toBeVisible();
  await expect(page.getByText('Connect an Anthropic API key to ask questions')).toBeVisible();
});

test('deep link survives a hard refresh', async ({ page }) => {
  await page.goto('./#/week');
  await page.getByRole('button', { name: 'Start empty' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Posedge' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
});
