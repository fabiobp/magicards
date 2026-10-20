import { imgUrl } from './assets.js';
import { reducedMotion } from './ui.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Two swaps away from solved, so every visitor finishes in a few taps.
const START = [4, 1, 2, 3, 0, 5, 8, 7, 6];
const HINT_AFTER_MS = 4000;
const BLINKS = 3;
const BLINK_MS = 120;
const UNLOCK_FRAME_MS = 150;
const UNLOCK_FRAMES = 4;

/**
 * Web version of the game's Block Order minigame: tap a piece to select it,
 * tap another to swap. Solving blinks the gold gaps, closes them and plays
 * the lock's unlock frames before the bonus reward.
 */
export class Challenge {
  constructor() {
    this.el = $('challenge');
    this.board = $('board');
    this.grid = $('boardGrid');
    this.lock = $('boardLock');
    this.hint = $('challengeHint');
    this.reward = $('reward');
    this.pet = $('challengePet');
    this.skip = $('challengeSkip');
    this.cells = Array.from({ length: 9 }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'piece';
      b.addEventListener('click', () => this.tap(i));
      this.grid.append(b);
      return b;
    });
    this.skip.addEventListener('click', () => this.finish());
    // Once the reward shows, a tap anywhere (Continue included) moves on.
    this.el.addEventListener('click', () => { if (!this.reward.hidden) this.finish(); });
    this.el.addEventListener('keydown', (e) => this.trapFocus(e));
  }

  run({ pet }) {
    const article = $('spot-portal');
    $('challengeTitle').textContent = article.querySelector('h3').textContent;
    $('challengeText').textContent = article.querySelector('p').textContent;
    this.order = START.slice();
    this.selected = -1;
    this.solved = false;
    this.board.className = 'board';
    this.lock.dataset.frame = '0';
    this.reward.hidden = true;
    this.el.classList.remove('is-rewarded');
    this.skip.hidden = false;
    this.hint.hidden = false;
    this.pet.hidden = !pet;
    this.render();
    this.el.hidden = false;
    this.cells[0].focus({ preventScroll: true });
    this.armHint();
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  render() {
    this.cells.forEach((cell, i) => {
      const piece = this.order[i];
      cell.style.backgroundImage = `url("${imgUrl(`minigame/piece-${piece + 1}`)}")`;
      cell.setAttribute('aria-label', `Piece ${piece + 1}, square ${i + 1}`);
      cell.setAttribute('aria-pressed', String(i === this.selected));
      cell.classList.toggle('is-selected', i === this.selected);
    });
  }

  tap(i) {
    if (this.solved) return;
    this.clearHint();
    if (this.selected < 0) {
      this.selected = i;
    } else if (this.selected === i) {
      this.selected = -1;
    } else {
      this.swap(this.selected, i);
      this.selected = -1;
    }
    this.render();
    if (this.order.every((p, k) => p === k)) this.complete();
    else this.armHint();
  }

  /** Swaps two cells with a FLIP slide so the pieces visibly trade places. */
  swap(a, b) {
    const ra = this.cells[a].getBoundingClientRect();
    const rb = this.cells[b].getBoundingClientRect();
    [this.order[a], this.order[b]] = [this.order[b], this.order[a]];
    if (reducedMotion.matches) return;
    for (const [i, from, to] of [[a, rb, ra], [b, ra, rb]]) {
      const cell = this.cells[i];
      cell.style.transition = 'none';
      cell.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        cell.style.transition = '';
        cell.style.transform = '';
      }));
    }
  }

  armHint() {
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      const wrong = this.order.findIndex((p, k) => p !== k);
      if (wrong < 0) return;
      this.cells[wrong].classList.add('is-hint');
      this.cells[this.order.indexOf(wrong)].classList.add('is-hint');
    }, HINT_AFTER_MS);
  }

  clearHint() {
    clearTimeout(this.hintTimer);
    for (const c of this.cells) c.classList.remove('is-hint');
  }

  async complete() {
    this.solved = true;
    this.clearHint();
    this.hint.hidden = true;
    await wait(260);
    for (let i = 0; i < BLINKS; i++) {
      this.board.classList.add('is-blink');
      await wait(BLINK_MS);
      this.board.classList.remove('is-blink');
      await wait(BLINK_MS);
    }
    this.board.classList.add('is-closed');
    await wait(320);
    this.board.classList.add('is-unlocking');
    for (let f = 1; f < UNLOCK_FRAMES; f++) {
      await wait(UNLOCK_FRAME_MS);
      this.lock.dataset.frame = String(f);
    }
    await wait(450);
    if (!this.resolve) return;
    this.skip.hidden = true;
    this.reward.hidden = false;
    this.el.classList.add('is-rewarded');
    $('rewardContinue').focus({ preventScroll: true });
  }

  finish() {
    if (!this.resolve) return;
    this.clearHint();
    this.el.hidden = true;
    const resolve = this.resolve;
    this.resolve = null;
    resolve();
  }

  trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = [...this.el.querySelectorAll('button')].filter((b) => !b.closest('[hidden]') && !b.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
