// Records a take of Claude Code running cc-stretch: drives a real session in a WezTerm pane sized
// for the film, clicks the stretch links it finds on screen, and saves every change of the screen,
// colours and links included, with the second it happened. Writes out/take/frames.jsonl and
// out/take/marks.json beside this file. Needs WezTerm and a signed-in `claude`.
//   node film/take.mjs
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { linksOn, parseScreen, plainRows } from './screen.mjs';

const run = promisify(execFile);
const FILM = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const REPO = FILM.replace(/\/film$/, '');
const OUT = `${FILM}/out/take`;
const COLS = 100, ROWS = 30;
const QUESTIONS = ["What's a monad, really?", 'Which parts did I skip?'];
// The demo session reads the person's own instructions too; these keep the take to the feature.
const APPEND = 'This session is a recorded product demo for a general audience. Write in English only, and do not end replies with a status block or any closing summary. Use a few stretches. Make the long form of your first stretch add words before and between the words of its short form, not only after them, and put one more stretch inside that long form.';

const wez = (...args) => execFileSync('wezterm', ['cli', ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const claude = execFileSync('zsh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();

mkdirSync(OUT, { recursive: true });
const base = wez('spawn', '--cwd', REPO, '--', 'zsh', '-f');
const lower = wez('split-pane', '--pane-id', base, '--bottom', '--cells', String(ROWS), '--', 'zsh', '-f');
const pane = wez('split-pane', '--pane-id', lower, '--right', '--cells', String(COLS), '--cwd', REPO, '--',
	'env', '-u', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_NO_FLICKER=1',
	claude, '--plugin-dir', REPO, '--setting-sources', 'project,local', '--model', 'opus', '--append-system-prompt', APPEND);

const t0 = Date.now();
const frames = [];
let last = '';
let isRecording = true;
const recorder = (async () => {
	while (isRecording) {
		const { stdout } = await run('wezterm', ['cli', 'get-text', '--pane-id', pane, '--escapes'], { maxBuffer: 1 << 24 });
		if (stdout !== last) {
			frames.push({ t: (Date.now() - t0) / 1000, screen: stdout });
			last = stdout;
		}
	}
})();

const screen = () => parseScreen(last);
const text = () => plainRows(screen()).join('\n');
const marks = {};
const mark = (name, extra = {}) => {
	marks[name] = { t: (Date.now() - t0) / 1000, ...extra };
	console.log('mark', name, JSON.stringify(marks[name]));
};
const send = (keys) => wez('send-text', '--pane-id', pane, '--no-paste', keys);

async function waitFor(test, ms, what) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (test(text())) return;
		await sleep(100);
	}
	throw new Error(`timed out waiting for ${what}`);
}

/**
 * Waits until the screen has changed since `since` (seconds into the take) and then not changed
 * for `quiet` ms: what the last action started is done and nothing moves.
 */
async function settle(quiet, ms, since = (Date.now() - t0) / 1000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const lastChange = frames.at(-1)?.t ?? 0;
		if (lastChange > since && Date.now() - (t0 + lastChange * 1000) > quiet) return;
		await sleep(100);
	}
	throw new Error('the screen never settled');
}

async function type(words) {
	for (const ch of words) {
		send(ch);
		await sleep(45 + Math.random() * 55);
	}
}

/** Clicks the middle of a link, as a mouse would: press and release in the pane's own cells. */
async function click(name, found) {
	const row = found.row, col = Math.floor((found.col + found.end) / 2);
	mark(name, { row, col, link: found.link });
	send(`\x1b[<0;${col + 1};${row + 1}M`);
	await sleep(70);
	send(`\x1b[<0;${col + 1};${row + 1}m`);
}

// Claude Code ends each finished turn with a line such as `✻ Baked for 15s · done 12:09 AM`.
const turnsDone = () => (text().match(/ · done /g) ?? []).length;

try {
	// The folder-trust question also draws a `❯`; wait until either it or the composer is whole.
	await waitFor((t) => /Enter to confirm/.test(t) || /─\n❯/.test(t), 60000, 'the first screen');
	// The question takes keys only a moment after it draws, so answer until it is gone.
	for (let tries = 0; /Enter to confirm/.test(text()) && tries < 10; tries++) {
		await sleep(1000);
		send('\x1b[B');
		await sleep(300);
		send('\r');
		await sleep(1500);
	}
	await waitFor((t) => /─\n❯/.test(t) && !/Enter to confirm/.test(t), 60000, 'the prompt');
	await sleep(1500);
	mark('ready');

	await type(QUESTIONS[0]);
	await sleep(600);
	mark('asked');
	let before = turnsDone();
	send('\r');
	await waitFor(() => turnsDone() > before, 240000, 'the reply');
	await sleep(800);
	mark('replied');
	await sleep(1500);

	const outer = linksOn(screen(), /cc-stretch\.invalid\/open\//)[0];
	if (outer === undefined) throw new Error(`the reply has no stretch:\n${text()}`);
	await click('open', outer);
	await settle(1500, 15000);
	await sleep(1800);

	const nested = linksOn(screen(), /cc-stretch\.invalid\/open\/.*%E2%80%BA/)[0];
	if (nested !== undefined) {
		await click('nest', nested);
		await settle(1500, 15000);
		await sleep(2200);
	}

	const closer = linksOn(screen(), new RegExp(outer.link.replace('/open/', '/close/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))[0];
	if (closer !== undefined) {
		await click('close', closer);
		await settle(1500, 15000);
		await sleep(1500);
	}

	await type(QUESTIONS[1]);
	await sleep(600);
	mark('asked2');
	before = turnsDone();
	send('\r');
	await waitFor(() => turnsDone() > before, 240000, 'the second reply');
	await sleep(800);
	mark('replied2');
	await sleep(2500);
	mark('end');
} finally {
	isRecording = false;
	await recorder;
	writeFileSync(`${OUT}/frames.jsonl`, frames.map((f) => JSON.stringify(f)).join('\n'));
	writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2));
	for (const id of [pane, lower, base]) {
		try { wez('kill-pane', '--pane-id', id); } catch {}
	}
	console.log('frames', frames.length, 'seconds', frames.at(-1)?.t);
}
