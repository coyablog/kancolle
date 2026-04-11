// ==UserScript==
// @name         KCNAV掉落率上色
// @namespace    https://tsunkit.net/
// @version      2.0
// @description  依掉落率衰減對整排上色，母數不足時顯示灰色。
// @match        https://tsunkit.net/nav*
// @grant        GM_addStyle
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tsunkit.net
// @updateURL    https://github.com/coyablog/kancolle/raw/refs/heads/main/nav_drops.user.js
// @downloadURL  https://github.com/coyablog/kancolle/raw/refs/heads/main/nav_drops.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // ⚙️ Config
  // ============================================================

  const MIN_RELIABLE_SAMPLE = 200;

  const LOW_SAMPLE_STYLE = {
    bg: '#2a2a2a',
    fg: '#777777',
  };

  // ============================================================
  // 🌈 Background
  // ============================================================

  function getHslColor(ratio) {
    const r = Math.max(0, Math.min(1, ratio));

    const hue = r * 120;   // 色相：紅(0) → 綠(120)
    const saturation = 60; // 飽和度
    const lightness = 25;  // 亮度

    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: r > 0.6 ? '#e8e8e8' : '#ffffff', // 偏亮才用灰白
    };
  }

  // ============================================================
  // 🧰 Utils
  // ============================================================

  const parseRate = (text) => {
    if (!text) return null;
    const v = text.trim().replace('%', '');
    if (!v || v === '-' || v === '--') return null;
    const num = parseFloat(v);
    return isNaN(num) ? null : num;
  };

  const parseSample = (text) => {
    if (!text) return null;
    const m = text.match(/\d+\/(\d+)/);
    return m ? parseInt(m[1]) : null;
  };

  const parseHoldLeft = (text) => {
    if (!text) return null;
    const m = text.match(/^(\d+)/);
    return m ? parseInt(m[1]) : null;
  };

  const getBaseline = (rows) => {
    let base = rows.find(r => r.holdLeft === 0);

    if (!base || base.rate === 0) {
      base = rows.find(r => r.rate > 0);
    }

    return base ? base.rate : 0;
  };

  // ============================================================
  // 🎨 Style
  // ============================================================

  GM_addStyle(`
    .kcnav-decay-row td {
      transition: background-color 0.25s ease, color 0.25s ease;
    }
  `);

  // ============================================================
  // 🧠 Core
  // ============================================================

  function processTable(table) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) return;

    let col = { hold: 0, rate: 1, sample: 2 };

    const header = rows.find(r => r.querySelector('th'));
    if (header) {
      [...header.querySelectorAll('th, td')].forEach((el, i) => {
        const t = el.textContent.trim();
        if (/所持|推移/i.test(t)) col.hold = i;
        if (/ドロップ率|rate/i.test(t)) col.rate = i;
        if (/ドロップ数|count|数$/.test(t)) col.sample = i;
      });
    }

    const data = rows
      .filter(r => r !== header)
      .map(row => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length <= Math.max(col.hold, col.rate)) return null;

        const holdLeft = parseHoldLeft(cells[col.hold]?.textContent);
        const rate = parseRate(cells[col.rate]?.textContent);
        const sample = parseSample(cells[col.sample]?.textContent);

        if (holdLeft === null || rate === null) return null;

        return { row, cells, holdLeft, rate, sample };
      })
      .filter(Boolean);

    if (!data.length) return;

    const baseRate = getBaseline(data);

    for (const item of data) {
      const isReliable =
        item.sample === null || item.sample >= MIN_RELIABLE_SAMPLE;

      let style;

      if (!isReliable || baseRate === 0) {
        style = LOW_SAMPLE_STYLE;
      } else {
        const ratio = item.rate / baseRate;
        style = getHslColor(ratio);
      }

      item.cells.forEach(cell => {
        cell.style.backgroundColor = style.bg;
        cell.style.color = style.fg;
      });

      item.row.classList.add('kcnav-decay-row');
    }
  }

  // ============================================================
  // 🔍 Init
  // ============================================================

  function scanTables() {
    document.querySelectorAll('table').forEach(table => {
      const text = table.textContent;
      if (text.includes('→') && text.includes('%')) {
        processTable(table);
      }
    });
  }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scanTables, 500);
  }).observe(document.body, {
    childList: true,
    subtree: true,
  });

  setTimeout(scanTables, 1800);

})();
