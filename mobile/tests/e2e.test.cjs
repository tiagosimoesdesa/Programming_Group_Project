const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright-core');

const origin = process.env.E2E_ORIGIN;
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const terms = (page) => page.getByLabel('Terms and Conditions document');
const password = 'Disposable-test-42!';
let browser;

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.E2E_BROWSER,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
});

after(async () => browser?.close());

async function openPage(t, options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return page;
}

async function acceptTerms(page) {
  await page.goto(origin);
  await terms(page).waitFor();
  assert.equal(await button(page, 'Accept').isDisabled(), true);
  await terms(page).evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await button(page, 'Accept').click();
  await tab(page, 'Log in').waitFor();
}

async function register(page) {
  const username = `qa_${randomUUID().slice(0, 8)}`;
  await acceptTerms(page);
  await tab(page, 'Sign up').click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  assert.equal(await button(page, 'Sign up').isDisabled(), true);
  const legalAge = page.getByRole('checkbox');
  assert.equal(await legalAge.getAttribute('aria-checked'), 'false');
  await legalAge.click();
  assert.equal(await legalAge.getAttribute('aria-checked'), 'true');
  await button(page, 'Sign up').click();
  await heading(page, 'Tonight').waitFor();
  if (await button(page, 'Later').isVisible()) await button(page, 'Later').click();
  return username;
}

async function createNight(page, mode) {
  await button(page, 'Start a night').first().click();
  await page.getByLabel('Competition name').fill(`E2E ${mode}`);
  await page.getByRole('radio', { name: new RegExp(`^${mode}`) }).click();
  const saved = page.waitForResponse((response) =>
    response.url() === `${origin}/competitions` && response.request().method() === 'POST',
  );
  await button(page, 'Start the night').click();
  const response = await saved;
  assert.equal(response.status(), 201);
  return (await response.json()).code;
}

async function joinNight(page, code) {
  await button(page, 'Join with a code').first().click();
  await page.getByLabel('Invitation code').fill(code);
  await button(page, 'Join the night').click();
}

test('Terms decline, reload, review and acceptance', async (t) => {
  const page = await openPage(t, { viewport: { width: 320, height: 480 } });
  await page.goto(origin);
  await button(page, 'Decline').click();
  await page.getByText('We Understand Your Decision', { exact: true }).waitFor();
  await page.reload();
  await button(page, 'Review Terms & Conditions').click();
  await terms(page).waitFor();
  assert.equal(await button(page, 'Accept').isDisabled(), true);
  assert.equal(await terms(page).getAttribute('tabindex'), '0');
  await terms(page).focus();
  await page.keyboard.press('End');
  await button(page, 'Accept').click();
  await tab(page, 'Log in').waitFor();
  await page.reload();
  await tab(page, 'Log in').waitFor();
});

test('Registration, interrupted session restore and sign-out', async (t) => {
  const page = await openPage(t);
  await register(page);
  const refreshCookie = (await page.context().cookies()).find(({ name }) => name === 'beerreal_refresh');
  assert.equal(refreshCookie?.httpOnly, true);
  assert.equal(await page.evaluate(() => document.cookie.includes('beerreal_refresh')), false);
  await page.route(`${origin}/auth/web/refresh`, (route) => route.abort('internetdisconnected'), { times: 1 });
  await page.reload();
  await button(page, 'Reconnect').click();
  await heading(page, 'Tonight').waitFor();
  await tab(page, 'Profile').click();
  await button(page, 'Settings').click();
  page.once('dialog', (dialog) => dialog.accept());
  await button(page, 'Sign out').click();
  await tab(page, 'Log in').waitFor();
  await page.reload();
  await tab(page, 'Log in').waitFor();
  assert.equal((await page.context().cookies()).some(({ name }) => name === 'beerreal_refresh'), false);
});

test('Classic shared camera check-in, live reaction and recap', async (t) => {
  const host = await openPage(t, { permissions: ['camera'] });
  const guest = await openPage(t, { permissions: ['camera'] });
  const hostName = await register(host);
  await register(guest);
  await joinNight(guest, await createNight(host, 'Classic'));
  await button(guest, 'Capture a moment').waitFor();
  await button(host, 'Capture a moment').click();
  await button(host, 'Take drink photo').click();
  await button(host, 'Take selfie').click();
  await host.getByRole('button', { name: /^Add one regular beer.*Current quantity: 0/ }).click();
  await button(host, 'Post to the night').click();
  await button(guest, `Open photo from ${hostName}`).click();
  await button(guest, 'Close photo').click();
  await button(guest, 'Like, 0 reactions').click();
  await button(host, 'Like, 1 reactions').waitFor();
  host.once('dialog', (dialog) => dialog.accept());
  await button(host, 'Close the night').click();
  await guest.getByText('End of the night', { exact: true }).waitFor();
  await button(guest, 'Night moments').click();
  await guest.getByText('First beer', { exact: true }).waitFor();
});

test('Party starts with two players and voting approves the challenge', async (t) => {
  const host = await openPage(t, { permissions: ['camera'] });
  const guest = await openPage(t, { permissions: ['camera'] });
  await register(host);
  await register(guest);
  const code = await createNight(host, 'Party');
  await tab(host, 'Party').click();
  await button(host, 'Waiting for another player').waitFor();
  await joinNight(guest, code);
  await tab(guest, 'Party').click();
  await button(host, 'Start Party Mode').click();
  await button(guest, 'Capture challenge').waitFor();
  await button(host, 'Capture challenge').click();
  await button(host, 'Take challenge photo').click();
  await button(host, 'Take selfie').click();
  await button(host, 'Post to the night').click();
  await button(guest, 'Approve').click();
  await host.getByText(/Approved · \+2 Jols/).waitFor();
});

test('Private Battle opens with two teams and keeps the opposing feed hidden', async (t) => {
  const host = await openPage(t, { permissions: ['camera'] });
  const guest = await openPage(t, { permissions: ['camera'] });
  const hostName = await register(host);
  await register(guest);
  await button(host, 'Start a night').first().click();
  await host.getByRole('button', { name: /Battle.*Two teams/ }).click();
  await button(host, 'Create Battle').click();
  await host.getByLabel('Team one').fill('Amber');
  await host.getByLabel('Team two').fill('Blue');
  await host.getByRole('radio', { name: '10 min', exact: true }).click();
  await host.getByRole('radio', { name: /Hide Jols/ }).click();
  const saved = host.waitForResponse((response) =>
    response.url() === `${origin}/competitions` && response.request().method() === 'POST',
  );
  await button(host, 'Create Battle').click();
  const response = await saved;
  assert.equal(response.status(), 201);
  await joinNight(guest, (await response.json()).code);
  await host.getByRole('radio', { name: 'Join Amber' }).click();
  await guest.getByRole('radio', { name: 'Join Blue' }).click();
  await button(host, 'Start Battle').click();
  await button(guest, 'Capture a moment').waitFor();
  await button(host, 'Capture a moment').click();
  await button(host, 'Take drink photo').click();
  await button(host, 'Take selfie').click();
  await host.getByRole('button', { name: /^Add one regular beer.*Current quantity: 0/ }).click();
  const submitted = host.waitForResponse((result) =>
    result.url().endsWith('/submissions') && result.request().method() === 'POST',
  );
  await button(host, 'Post to the night').click();
  assert.equal((await submitted).status(), 201);
  await tab(host, 'Photos').click();
  await button(host, `Open photo from ${hostName}`).waitFor();
  await tab(guest, 'Photos').click();
  await guest.getByText('Your story starts here', { exact: true }).waitFor();
  assert.equal(await button(guest, `Open photo from ${hostName}`).count(), 0);
});
