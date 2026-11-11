// Existing gameplay checks start after portal completion, without unlocking audio.
export async function openVRPractice(page, url, { firstTutorial = false, ...options } = {}) {
  await page.addInitScript(first => {
    sessionStorage.setItem('drumup.vr.entrance-seen', '1');
    if (!first) localStorage.setItem('drumup.vr.tutorial-seen.v1', '1');
  }, firstTutorial);
  return page.goto(url, options);
}
