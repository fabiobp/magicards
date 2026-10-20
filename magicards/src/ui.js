import { Vector3 } from 'three';
import { imgUrl } from './assets.js';

const $ = (id) => document.getElementById(id);
const tmp = new Vector3();
const screen = { x: 0, y: 0, visible: false };

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export class Hud {
  constructor(roomCount) {
    this.el = $('hud');
    this.room = $('hudRoom');
    this.found = $('hudFound');
    this.pips = $('hudPips');
    this.pips.innerHTML = Array.from({ length: roomCount }, () => '<li></li>').join('');
  }

  show() { this.el.hidden = false; }

  setRoom(index, title) {
    this.room.textContent = title;
    [...this.pips.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < index);
      li.classList.toggle('is-current', i === index);
    });
    this.pips.setAttribute('aria-label', `Room ${index + 1} of ${this.pips.children.length}`);
  }

  setFound(text) { this.found.textContent = text; }
}

export class RoomTitle {
  constructor() {
    this.el = $('roomTitle');
    this.title = this.el.querySelector('h2');
    this.tagline = this.el.querySelector('p');
  }

  /** `top` (a CSS length) overrides the stylesheet position for rooms whose props sit where the title would. */
  show(title, tagline, top = '') {
    this.title.textContent = title;
    this.tagline.textContent = tagline;
    this.el.style.top = top;
    this.el.classList.remove('is-on');
    void this.el.offsetWidth;
    this.el.classList.add('is-on');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.remove('is-on'), 3300);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove('is-on');
  }
}

export class Caption {
  constructor() { this.el = $('caption'); }

  show(text, { ms = 0, action = null } = {}) {
    clearTimeout(this.timer);
    this.el.replaceChildren(document.createTextNode(text));
    this.el.classList.toggle('has-action', Boolean(action));
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--ghost';
      b.textContent = action.label;
      b.addEventListener('click', action.onClick, { once: true });
      this.el.append(b);
    }
    this.el.classList.add('is-on');
    if (ms) this.timer = setTimeout(() => this.hide(), ms);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove('is-on', 'has-action');
  }
}

export class Floaters {
  constructor(stage) {
    this.el = $('floaters');
    this.stage = stage;
  }

  /** Combat-style text rising from a world position. */
  pop(text, world, kind = '') {
    this.stage.project(world, screen);
    const f = document.createElement('span');
    f.className = `floater ${kind ? `floater--${kind}` : ''}`;
    f.textContent = text;
    f.style.left = `${screen.x}px`;
    f.style.top = `${screen.y}px`;
    this.el.append(f);
    setTimeout(() => f.remove(), 1200);
  }
}

export class Fade {
  constructor() { this.el = $('fade'); }

  async run(on, ms, dark = false) {
    this.el.classList.toggle('is-dark', dark);
    this.el.style.setProperty('--fade-ms', `${ms}ms`);
    this.el.classList.toggle('is-on', on);
    await new Promise((r) => setTimeout(r, ms));
  }

  async flash(inMs = 180, outMs = 450) {
    await this.run(true, inMs);
    this.run(false, outMs);
  }
}

/** DOM buttons that track the interactive objects of the current room. */
export class Hotspots {
  constructor(stage) {
    this.root = $('hotspots');
    this.stage = stage;
    this.items = [];
    this.coachEl = null;
  }

  set(items) {
    this.clearCoach();
    this.root.replaceChildren();
    this.items = items.map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `hotspot hotspot--${item.kind}`;
      b.innerHTML = '<span class="hotspot__rune" aria-hidden="true"></span><span class="hotspot__label"></span>';
      b.querySelector('.hotspot__label').textContent = item.label;
      b.setAttribute('aria-label', item.aria ?? item.label);
      b.addEventListener('click', () => item.onClick(b));
      this.root.append(b);
      return { ...item, el: b };
    });
    this.update();
  }

  find(id) { return this.items.find((i) => i.id === id); }

  update() {
    for (const item of this.items) {
      item.anchor(tmp);
      this.stage.project(tmp, screen);
      item.el.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
      item.el.style.visibility = screen.visible ? '' : 'hidden';
      if (this.coachEl && this.coachTarget === item.id) {
        this.coachEl.style.left = `${screen.x}px`;
        this.coachEl.style.top = `${screen.y}px`;
      }
    }
  }

  setEnabled(enabled, except = null) {
    for (const item of this.items) item.el.disabled = !enabled && item.id !== except;
  }

  visited(id) { this.find(id)?.el.classList.add('is-visited'); }

  calling(on) {
    for (const item of this.items) if (item.kind === 'door') item.el.classList.toggle('is-calling', on);
  }

  hover(id) {
    for (const item of this.items) item.el.classList.toggle('is-hover', item.id === id);
  }

  flashLabels(ms = 2600) {
    this.root.classList.add('show-labels');
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => this.root.classList.remove('show-labels'), ms);
  }

  coach(id) {
    this.clearCoach();
    const img = document.createElement('img');
    img.className = 'coach';
    img.src = imgUrl('ui/tap-hand');
    img.alt = '';
    this.root.append(img);
    this.coachEl = img;
    this.coachTarget = id;
    this.update();
  }

  clearCoach() {
    this.coachEl?.remove();
    this.coachEl = null;
    this.coachTarget = null;
  }
}

/** Side panel (bottom sheet on narrow screens) that shows one spot's copy. */
export class Panel {
  constructor() {
    this.el = $('panel');
    this.visual = $('panelVisual');
    this.title = $('panelTitle');
    this.text = $('panelText');
    this.found = $('panelFound');
    this.onClose = null;
    $('panelClose').addEventListener('click', () => this.close());
    $('panelContinue').addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
  }

  get isOpen() { return !this.el.hidden && !this.el.classList.contains('is-closing'); }

  get sheet() { return matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)').matches; }

  open(article, { found = '', onClose = null, returnFocus = null } = {}) {
    clearTimeout(this.closeTimer);
    this.visual.replaceChildren();
    const figure = article.querySelector('figure');
    if (figure) this.visual.append(figure.cloneNode(true));
    this.title.textContent = article.querySelector('h3').textContent;
    this.text.replaceChildren(...[...article.querySelectorAll('p')].map((p) => p.cloneNode(true)));
    this.found.textContent = found;
    this.onClose = onClose;
    this.returnFocus = returnFocus;
    this.el.classList.remove('is-closing');
    this.el.hidden = false;
    this.el.scrollTop = 0;
    $('panelClose').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.add('is-closing');
    this.closeTimer = setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('is-closing');
    }, 240);
    const cb = this.onClose;
    this.onClose = null;
    if (this.returnFocus?.isConnected && !this.returnFocus.disabled) this.returnFocus.focus({ preventScroll: true });
    cb?.();
  }

  /** Screen space the panel covers, used to re-centre the 3D view. */
  occlusion() {
    return this.sheet ? { x: 0, y: this.el.offsetHeight } : { x: innerWidth - this.el.offsetLeft, y: 0 };
  }
}
