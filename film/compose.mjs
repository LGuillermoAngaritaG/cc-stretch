// Renders the film frame by frame from film.html and the recorded take, then muxes the music.
//   node film/compose.mjs --stills=1,9,20     one JPEG per time, in out/stills/
//   node film/compose.mjs --audio             the soundtrack alone, out/soundtrack.wav
//   node film/compose.mjs --mux               new sound over the frames already rendered
//   node film/compose.mjs --fress             the cut with the 1976 Brown film, out/cc-stretch-fress.mp4
//   node film/compose.mjs                     every frame, the soundtrack, out/cc-stretch.mp4
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { parseScreen } from './screen.mjs';

const FILM = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const OUT = `${FILM}/out`;
const FPS = 30;
const stills = process.argv.find((a) => a.startsWith('--stills='))?.slice(9).split(',').map(Number);

execFileSync('npx', ['-y', 'esbuild@0.25', `${FILM}/grow-entry.ts`, '--bundle', '--format=iife', '--global-name=Grow', `--outfile=${OUT}/grow.js`], { stdio: 'ignore' });
// A row that reports the account's usage limits is personal, not part of the feature: it is blanked.
const PRIVATE = /weekly limit|usage limit|resets .* at \d|\/usage/i;
const frames = readFileSync(`${OUT}/take/frames.jsonl`, 'utf8').trim().split('\n').map((line) => {
	const f = JSON.parse(line);
	const rows = parseScreen(f.screen).map((runs) => (PRIVATE.test(runs.map((r) => r.text).join('')) ? [] : runs));
	return { t: f.t, rows };
});
const marks = JSON.parse(readFileSync(`${OUT}/take/marks.json`, 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${FILM}/film.html`);
await page.addScriptTag({ content: readFileSync(`${OUT}/grow.js`, 'utf8') });
await page.evaluate((take) => { window.TAKE = take; }, { frames, marks });

// Archive pictures live in out/assets (git-ignored; see out/assets/CREDITS.md). Without them the
// film falls back to a plain card. --fress swaps the 1969 close-up for the 1976 Brown film.
const ASSETS = `${OUT}/assets`;
const withFress = process.argv.includes('--fress');
const archive = existsSync(`${ASSETS}/hes-1969-ibm2250-console-1920.png`) ? {
	console: `file://${ASSETS}/hes-1969-ibm2250-console-1920.png`,
	closeup: `file://${ASSETS}/hes-1969-ibm2250-lightpen-closeup-1920.png`,
	nelson: `file://${ASSETS}/ted-nelson-2010-murch-1920.jpg`,
	fress: null,
} : null;
if (archive && withFress) {
	mkdirSync(`${ASSETS}/fress-frames`, { recursive: true });
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '16.3', '-t', '2.0', '-i', `${ASSETS}/fress-1976-lightpen-opens-text.mp4`, '-vf', 'fps=30,scale=1920:-2', `${ASSETS}/fress-frames/%03d.jpg`]);
	archive.fress = Array.from({ length: 60 }, (_, i) => `file://${ASSETS}/fress-frames/${String(i + 1).padStart(3, '0')}.jpg`);
}
await page.evaluate((a) => { window.ARCHIVE = a; }, archive);
const FINAL = `${OUT}/${withFress ? 'cc-stretch-fress' : 'cc-stretch'}.mp4`;
await page.evaluate(() => window.setState({ t: 0 }));
const total = await page.evaluate(() => window.TOTAL);

async function shoot(t, path) {
	await page.evaluate((s) => window.setState(s), { t });
	await page.screenshot({ path, type: 'jpeg', quality: 92 });
}

async function soundtrack() {
	const cues = await page.evaluate(() => ({ total: window.TOTAL, clicks: window.CLICKS, typing: window.TYPING, ...window.CUES }));
	await page.addScriptTag({ path: `${FILM}/music.js` });
	const wav = await page.evaluate((c) => window.renderMusic(c), cues);
	writeFileSync(`${OUT}/soundtrack.wav`, Buffer.from(wav, 'base64'));
}

if (process.argv.includes('--audio')) {
	await soundtrack();
	await browser.close();
	console.log('soundtrack', total.toFixed(2), 's ->', `${OUT}/soundtrack.wav`);
	process.exit(0);
}

if (stills) {
	mkdirSync(`${OUT}/stills`, { recursive: true });
	for (const t of stills) await shoot(t, `${OUT}/stills/t_${t}.jpg`);
	console.log('total', total.toFixed(2), 's; stills', stills.join(' '));
	await browser.close();
	process.exit(0);
}

// --mux reuses the frames already in out/frames and renders only the sound.
if (!process.argv.includes('--mux')) {
	rmSync(`${OUT}/frames`, { recursive: true, force: true });
	mkdirSync(`${OUT}/frames`, { recursive: true });
	const count = Math.round(total * FPS);
	for (let i = 0; i < count; i++) {
		await shoot(i / FPS, `${OUT}/frames/${String(i).padStart(5, '0')}.jpg`);
		if (i % 150 === 0) console.log('frame', i, 'of', count);
	}
}
await soundtrack();
await browser.close();

// One fixed gain to -16 LUFS, measured first, so the level never rides up and down with the music.
// ffmpeg prints the ebur128 summary on stderr.
const measured = spawnSync('ffmpeg', ['-hide_banner', '-i', `${OUT}/soundtrack.wav`, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const loudness = Number(/I:\s+(-?[\d.]+) LUFS/.exec(measured.split('Summary').at(-1) ?? '')?.[1]);
if (!Number.isFinite(loudness)) throw new Error('could not measure the soundtrack loudness');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${OUT}/frames/%05d.jpg`, '-i', `${OUT}/soundtrack.wav`,
	'-filter_complex', `[1:a]volume=${(-16 - loudness).toFixed(2)}dB,alimiter=limit=0.89:level=false,afade=t=in:d=0.2,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`, '-map', '0:v', '-map', '[a]',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', FINAL]);
console.log('done', total.toFixed(2), 's ->', FINAL);
