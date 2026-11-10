// Render an HTML "video page" to MP4 by stepping time frame by frame.
//
// The page must define `window.render(seconds)` (draws the frame at that time)
// and `window.TOTAL` (length in seconds). Frames are deterministic, so the
// output never drops frames or stutters, however slow the machine is.
//
// Usage:
//   node render.mjs <page.html> <out.mp4> [--fps 30] [--stills 2.5,10,20]
//
// --stills writes still-<t>.png next to the page instead of a video. Use it to
// check layout before a full render.

import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const [pagePath, outPath] = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
if (!pagePath) {
  console.error('Usage: node render.mjs <page.html> <out.mp4> [--fps 30] [--stills 2.5,10]');
  process.exit(1);
}
const fps = Number(flag('fps', '30'));
const stills = flag('stills', null);

async function loadPlaywright() {
  const candidates = [process.cwd(), dirname(resolve(pagePath))];
  for (const base of candidates) {
    try {
      const require = createRequire(resolve(base, 'noop.js'));
      return await import(pathToFileURL(require.resolve('playwright')).href);
    } catch {}
  }
  try {
    return await import('playwright');
  } catch {
    console.error('Playwright not found. In the video folder run:\n  npm i playwright && npx playwright install chromium');
    process.exit(1);
  }
}

const playwright = await loadPlaywright();
const {chromium} = playwright.chromium ? playwright : playwright.default;
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
await page.goto(pathToFileURL(resolve(pagePath)).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

if (stills) {
  for (const second of stills.split(',')) {
    await page.evaluate((time) => window.render(time), Number(second));
    const stillPath = resolve(dirname(resolve(pagePath)), `still-${second}.png`);
    await page.screenshot({path: stillPath});
    console.log(stillPath);
  }
  await browser.close();
  process.exit(0);
}

if (!outPath) {
  console.error('Give an output path, e.g. release.mp4');
  process.exit(1);
}
const total = await page.evaluate(() => window.TOTAL);
const ffmpeg = spawn(
  'ffmpeg',
  ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-movflags', '+faststart', outPath],
  {stdio: ['pipe', 'inherit', 'inherit']},
);
const frameCount = Math.round(total * fps);
for (let frame = 0; frame < frameCount; frame++) {
  await page.evaluate((time) => window.render(time), frame / fps);
  const buffer = await page.screenshot({type: 'jpeg', quality: 95});
  if (!ffmpeg.stdin.write(buffer)) await new Promise((done) => ffmpeg.stdin.once('drain', done));
  if (frame % (fps * 10) === 0) console.log(`frame ${frame}/${frameCount}`);
}
ffmpeg.stdin.end();
const code = await new Promise((done) => ffmpeg.on('close', done));
await browser.close();
if (code !== 0) process.exit(code);
console.log(resolve(outPath));
