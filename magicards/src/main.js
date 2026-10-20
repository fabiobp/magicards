import { Stage } from './stage.js';
import { World } from './world.js';
import { ROOMS } from './content.js';
import { Challenge } from './challenge.js';
import { HeroArt } from './hero.js';
import {
  Hud, Hotspots, Panel, Caption, Floaters, Fade, RoomTitle, reducedMotion,
} from './ui.js';

const $ = (id) => document.getElementById(id);

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class ExitScreen {
  constructor(onAgain) {
    this.el = $('exit');
    this.title = $('exitTitle');
    this.title.tabIndex = -1;
    const again = $('exploreAgain');
    again.hidden = false;
    again.addEventListener('click', onAgain);
  }

  show() {
    this.el.classList.add('is-open');
    this.el.scrollTop = 0;
    this.title.focus({ preventScroll: true });
  }

  hide() { this.el.classList.remove('is-open'); }
}

function embers(container) {
  for (let i = 0; i < 28; i++) {
    const e = document.createElement('i');
    e.style.left = `${(i * 37) % 100}%`;
    e.style.setProperty('--d', `${6 + (i % 5)}s`);
    e.style.setProperty('--delay', `${-(i * 0.7)}s`);
    e.style.setProperty('--dx', `${((i % 7) - 3) * 14}px`);
    container.append(e);
  }
}

/** Without WebGL (or if the first room cannot load) the page stays a static scrolling page. */
function fallback(error) {
  console.error(error);
  document.body.classList.remove('immersive');
}

function boot() {
  embers(document.querySelector('.hero__embers'));
  const heroArt = new HeroArt($('hero'));
  if (!hasWebGL()) return;

  document.body.classList.add('immersive');
  const stage = new Stage($('scene'));
  const ui = {
    hud: new Hud(ROOMS.length),
    hotspots: new Hotspots(stage),
    panel: new Panel(),
    caption: new Caption(),
    floaters: new Floaters(stage),
    fade: new Fade(),
    title: new RoomTitle(),
    challenge: new Challenge(),
  };
  const world = new World(stage, ui);
  ui.exit = new ExitScreen(() => world.restart());

  const hero = $('hero');
  const enter = $('enter');
  // The first room is uploaded to the GPU while the visitor reads the hero, so the dive lands on a live first frame.
  const first = world.prepare(0, (p) => enter.style.setProperty('--progress', p.toFixed(3))).then(() => {
    stage.applyCamera(0);
    return stage.warm(world.rooms[0].group);
  });
  first
    .then(async () => {
      for (let i = 1; i < ROOMS.length; i++) {
        await world.prepare(i);
        await stage.warm(world.rooms[i].group);
      }
    })
    .catch(fallback);

  let entering = false;
  const enterDungeon = async (keyboard) => {
    if (entering) return;
    entering = true;
    enter.classList.add('is-loading');
    try {
      await first;
    } catch (error) {
      fallback(error);
      location.hash = 'battle';
      return;
    }
    enter.classList.remove('is-loading');
    hero.classList.add('is-leaving');
    await heroArt.dive();
    // The fade sits under the hero: switch it on, drop the hero, then reveal the first room.
    await ui.fade.run(true, 1);
    hero.hidden = true;
    stage.start();
    ui.hud.show();
    const started = world.start();
    ui.fade.run(false, reducedMotion.matches ? 300 : 700);
    await started;
    if (keyboard) document.querySelector('.hotspot')?.focus();
  };
  enter.addEventListener('click', (e) => {
    e.preventDefault();
    enterDungeon(e.detail === 0);
  });
  // Anywhere on the art enters too; the hero's own links (logo, store badge) keep working.
  hero.addEventListener('click', (e) => {
    if (!e.target.closest('a, button')) enterDungeon(false);
  });
}

boot();
