// Existing gameplay checks start after portal completion, without unlocking audio.
export async function openVRPractice(page, url, options) {
  await page.addInitScript(() => sessionStorage.setItem('drumup.vr.entrance-seen', '1'));
  return page.goto(url, options);
}
