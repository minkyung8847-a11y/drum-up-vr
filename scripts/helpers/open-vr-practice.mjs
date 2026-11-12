// Existing gameplay checks start after portal completion, without unlocking audio.
export async function openVRPractice(page, url, { firstTutorial = false, ...options } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem('drumup.vr.entrance-seen', '1');
  });
  const response = await page.goto(url, options);
  if (!firstTutorial) {
    const dialog = page.getByRole('dialog', { name: 'DRUM UP TUTORIAL' });
    await dialog.getByRole('button', { name: '건너뛰기' }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  return response;
}
