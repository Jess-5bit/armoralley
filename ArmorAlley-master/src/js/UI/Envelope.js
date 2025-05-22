import { aaLoader } from '../core/aa-loader.js';
import { gameType } from '../aa.js';
import { common } from '../core/common.js';
import { isMobile, searchParams, TYPES } from '../core/global.js';
import { utils } from '../core/utils.js';
import { campaignBattles, levelName } from '../levels/default.js';
import { game } from '../core/Game.js';
import {
  copyToClipboardHandler,
  formatForWebhook,
  getDataCache
} from '../core/game-reporting.js';

let gameTypeParam;
let gtParam;

function Envelope() {
  let css, data, dom, exports;

  css = {
    active: 'active',
    open: 'open',
    envelopeOpen: 'envelope-open'
  };

  data = {
    active: false,
    level: '',
    open: false
  };

  dom = {
    o: null,
    oLetter: null,
    oLetterContextBody: null,
    oLetterWrapper: null,
    oLetterSource: null,
    nextLink: null
  };

  function updateGameType() {
    gameTypeParam = searchParams.get('gameType') || gameType;
    gtParam =
      gameTypeParam && gameTypeParam !== 'tutorial' && gameTypeParam !== 'easy'
        ? `&gameType=${gameTypeParam}`
        : '';
  }

  function setLevel(level = 'Tutorial') {
    data.level = level;
    updateGameType();
  }

  function formatLetter(html) {
    // if present, swap in live numbers for lost units - %T for tank, etc.
    // "%T tanks. %H helicopters. %I infantry. %V vans. %M missile launchers."
    let mtvie = html.match(/\%[MTVIEH]/gi);

    if (!mtvie?.length) return html;

    let dc = getDataCache();
    let yourData = dc?.extra?.playerTeamStats;

    if (!yourData) return html;

    let map = {
      M: TYPES.missileLauncher,
      T: TYPES.tank,
      V: TYPES.van,
      I: TYPES.infantry,
      E: TYPES.engineer,
      H: TYPES.helicopter
    };

    mtvie.forEach((match) => {
      // %T -> map[T]
      // note, leading slash for %
      let pattern = new RegExp(`\\${match}`, 'g');
      html = html.replace(pattern, yourData.destroyed[map[match.substr(1)]]);
    });

    return html;
  }

  function applyLevel() {
    if (!dom.o) return;

    const { level } = data;

    dom.oLetter.innerHTML = [
      `<h1>${
        dom.oLetterSource.querySelector(`dt[data-battle="${level}"]`)
          ?.innerHTML || 'missing'
      }</h1>`,
      `<div class="game-stats">${formatForWebhook('html')}</div>`,
      formatLetter(
        dom.oLetterSource.querySelector(`dd[data-battle="${level}"]`)?.innerHTML
      ) || 'missing'
    ].join('');

    const currentOffset = campaignBattles.indexOf(level);
    const nextLevel = campaignBattles[currentOffset + 1];
    const { nextLink } = dom;

    if (nextLevel) {
      nextLink.href = `?battle=${nextLevel}${gtParam}&start=1`;
      nextLink.innerHTML = `Next Battle: ${nextLevel} ➠`;
    } else {
      // TODO: Some sort of extra end-game feature?
      // TODO: suggest hard or extreme mode
      nextLink.href = '.';
      nextLink.innerHTML = 'CONGRATULATIONS';
    }
  }

  function updateNextLink(didWin) {
    const { nextLink } = dom;
    if (levelName === 'Tutorial') {
      nextLink.href = '?battle=Cake Walk';
      nextLink.innerHTML = 'BATTLE 1: CAKE WALK';
    } else if (!didWin) {
      nextLink.href = `?battle=${levelName}${gtParam}`;
      nextLink.innerHTML = 'TRY AGAIN';
    }
  }

  function openOrClose(e) {
    // special case: ignore "next" link and elements with actions.
    if (e?.target?.getAttribute('data-action')) return;
    if (e?.target?.id === 'next-battle') return;
    if (data.open) return close();
    open();
  }

  function open() {
    if (data.open) return;
    data.open = true;
    utils.css.addOrRemove(dom.o, data.open, css.open);
    utils.css.addOrRemove(document.body, data.open, css.envelopeOpen);
  }

  function close() {
    if (!data.open) return;
    data.open = false;
    setScrollTop(0);
    utils.css.remove(dom.o, css.open);
    utils.css.addOrRemove(document.body, data.open, css.envelopeOpen);
    clearLayoutCache();
  }

  function show() {
    if (data.active) return;
    init(() => {
      initDOM();
      data.active = true;
      applyLevel();
      let didWin = true;
      updateNextLink(didWin);

      dom.o.style.display = 'block';
      addGlows();

      let to = common.setFrameTimeout;
      let add = utils.css.add;

      // activate, simulate mouse down / up, open.
      to(() => {
        add(dom.o, css.active);
        to(() => {
          add(dom.o, 'mousedown');
          to(() => {
            utils.css.remove(dom.o, 'mousedown');
            to(() => {
              open();
              addEvents();
            }, 150);
          }, 250);
        }, 850);
      }, 1000);
    });
  }

  function setScrollTop(offset) {
    if (!dom.oLetter) return;
    if (!layoutCache.letterScrollRange) {
      /**
       * Repurposing for gamepad scroll shenanigans.
       * Details differ on mobile, between landscape and portrait.
       * NOTE: this is a mess and could use a JS + CSS refactoring.
       */
      if (isMobile) {
        if (game.objects.view.data.browser.isPortrait) {
          layoutCache.letterScrollRange =
            dom.oLetterContextBody.scrollHeight -
            dom.oLetterContextBody.offsetHeight;
        } else {
          // mobile landscape
          layoutCache.letterScrollRange = dom.oLetter.scrollHeight;
        }
      } else {
        // desktop
        layoutCache.letterScrollRange =
          dom.oLetter.scrollHeight - dom.oLetter.offsetHeight;
      }
    }

    // scroll nodes differ on mobile. :X
    if (layoutCache.letterScrollRange) {
      let scrollNode;
      if (isMobile) {
        if (game.objects.view.data.browser.isPortrait) {
          scrollNode = dom.oLetterContextBody;
        } else {
          scrollNode = dom.oLetterWrapper;
        }
      } else {
        scrollNode = dom.oLetter;
      }
      if (!scrollNode) return;
      scrollNode.scrollTop = layoutCache.letterScrollRange * offset;
    }
  }

  function addGlows() {
    // child / effect node for each "card" - <span class="glows"></span>
    let glowNode = document.createElement('span');
    glowNode.className = 'glows';

    // just get all eligible nodes in the DOM?
    cards = document.querySelectorAll('.glow-item');
    cards.forEach((card) => card.appendChild(glowNode.cloneNode()));

    utils.events.add(document, 'touchstart', startPointer);
    utils.events.add(document.body, 'touchend', hidePointer);
    utils.events.add(document.body, 'pointermove', updatePointer);

    restyle();
    resetPointer();
  }

  function updateMouse(e) {
    const isValid = e.type === 'mousedown'; // && utils.css.has(e.target, 'wax-seal');
    utils.css.addOrRemove(dom.o, isValid, 'mousedown');
  }

  /**
   * "Proximity glow cards" effect
   * Hat tip: https://twitter.com/jh3yy/status/1734369933558010226
   * https://codepen.io/jh3y/pen/QWYPaax
   */

  let container;
  let cards;

  function restyle() {
    container.style.setProperty('--glow-blur', config.blur);
    container.style.setProperty('--glow-spread', config.spread);
    container.style.setProperty(
      '--glow-direction',
      config.vertical ? 'column' : 'row'
    );
    // glow-spread overrides, HTML -> CSS, set per-element
    const prop = 'glow-spread';
    const attr = `data-${prop}`;
    container.querySelectorAll(`[${attr}]`).forEach((node) => {
      node.style.setProperty(`--${prop}`, node.getAttribute(attr));
    });
  }

  const config = {
    proximity: 50,
    spread: 120,
    blur: 15,
    opacity: 0
  };

  let layoutCache = {};

  let useCache = false;
  let glowIDs = 0;

  function clearLayoutCache() {
    layoutCache = {};
  }

  utils.events.add(window, 'resize', clearLayoutCache);

  function getLayout(item) {
    if (!useCache) return item.getBoundingClientRect();

    if (!item.id) {
      item.id = `glow_element_${glowIDs++}`;
    }

    if (layoutCache[item.id]) return layoutCache[item.id];

    layoutCache[item.id] = item.getBoundingClientRect();

    return layoutCache[item.id];
  }

  function resetPointer() {
    // pretend-reset everything, so glow is entirely hidden.
    updatePointer({ x: 0, y: 0 });
  }

  function hidePointer() {
    for (const card of cards) {
      // apply default opacity
      card.style.setProperty('--glow-active', config.opacity);
    }
  }

  function startPointer(e) {
    if (!e.touches?.length) return;
    const touch = e.touches[e.touches.length - 1];
    updatePointer({
      x: touch.clientX,
      y: touch.clientY
    });
  }

  function updatePointer(event) {
    if (!event) return;

    // get the angle based on the center point of the card and pointer position
    for (const card of cards) {
      // Check the card against the proximity and then start updating
      const card_bounds = getLayout(card);
      // Get distance between pointer and outerbounds of card
      if (
        event.x > card_bounds.left - config.proximity &&
        event.x < card_bounds.left + card_bounds.width + config.proximity &&
        event.y > card_bounds.top - config.proximity &&
        event.y < card_bounds.top + card_bounds.height + config.proximity
      ) {
        // if within proximity, set the active opacity
        card.style.setProperty('--glow-active', 1);
      } else {
        card.style.setProperty('--glow-active', config.opacity);
      }
      const card_center = [
        card_bounds.left + card_bounds.width * 0.5,
        card_bounds.top + card_bounds.height * 0.5
      ];
      let angle =
        (Math.atan2(event.y - card_center[1], event.x - card_center[0]) * 180) /
        Math.PI;
      angle = angle < 0 ? angle + 360 : angle;
      card.style.setProperty('--glow-start', angle + 90);
    }
  }

  function addEvents() {
    dom.o.onmousedown = updateMouse;
    dom.o.onmouseup = updateMouse;
    dom.o.onclick = openOrClose;
    let statsButton = dom.o.querySelector('.copy-game-stats');
    // deliciously old-skool.
    utils.events.add(statsButton, 'mousedown', copyToClipboardHandler);
  }

  function initDOM() {
    dom.o = document.getElementById('battle-over-letter');
    container = dom.o;
    dom.oLetter = dom.o?.querySelector('.letter-context-body');
    dom.oLetterContextBody = dom.o?.querySelector('.letter-context-body');
    dom.oLetterWrapper = dom.o?.querySelector('.letter-wrapper');
    dom.oLetterSource = document.getElementById('letters-from-the-old-tanker');
    dom.nextLink = document.getElementById('next-battle');
  }

  function init(callback) {
    const needed = 2;
    let done = 0;

    function loaded() {
      done++;
      if (done === needed) callback?.();
    }

    const placeholder = document.getElementById('envelopes-placeholder');

    if (!placeholder.hasChildNodes()) {
      aaLoader.loadHTML('envelopes.html', (response) => {
        placeholder.innerHTML = response;
        loaded();
      });
    }

    aaLoader.loadCSS('aa-battle-over-letter.css', loaded);
  }

  // note: no self-init; lazy-init due to asset fetching.

  exports = {
    close,
    data,
    open,
    openOrClose,
    setLevel,
    setScrollTop,
    show
  };

  return exports;
}

export { Envelope };
