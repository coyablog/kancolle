// ==UserScript==
// @name         KCNAV掉落率上色
// @namespace    https://tsunkit.net/
// @version      1.0
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
  // 母數信賴門檻
  // 低於此數的行，改顯示「資料不足」灰色，不依掉落率判斷衰減
  // ============================================================
  const MIN_RELIABLE_SAMPLE = 100;

  // ============================================================
  // 衰減比 → 底色（ratio = 該行掉落率 / 0→1基準率）
  // ============================================================
  const DECAY_TIERS = [
    { minRatio: 0.90, bg: '#1e7e34', fg: '#ffffff' }, // 幾乎無衰減
    { minRatio: 0.60, bg: '#5a9e20', fg: '#ffffff' }, // 輕微衰減
    { minRatio: 0.35, bg: '#a07800', fg: '#ffffff' }, // 中度衰減
    { minRatio: 0.15, bg: '#c05000', fg: '#ffffff' }, // 明顯衰減
    { minRatio: 0.001,bg: '#9e1010', fg: '#ffffff' }, // 嚴重衰減
    { minRatio: 0,    bg: '#3a0000', fg: '#ff6666' }, // 完全衰減 0%
  ];

  // 母數不足專用色
  const TIER_LOW_SAMPLE = { bg: '#2a2a3a', fg: '#888888' };

  function getTier(ratio) {
    for (const t of DECAY_TIERS) {
      if (ratio >= t.minRatio) return t;
    }
    return DECAY_TIERS[DECAY_TIERS.length - 1];
  }

  function parseRate(text) {
    if (!text) return null;
    const s = text.trim().replace('%', '');
    if (s === '--' || s === '-' || s === '') return null;
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  function parseSample(text) {
    if (!text) return null;
    const m = text.match(/\d+\/(\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  function parseHoldLeft(text) {
    if (!text) return null;
    const m = text.match(/^(\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  GM_addStyle(`
    .kcnav-decay-row td {
      transition: background-color 0.2s, color 0.2s;
    }
  `);

  // ============================================================
  // 核心：處理單一表格
  // ============================================================
  function processDropTable(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return;

    // 找欄位索引（預設 0=推移 1=率 2=數）
    let colHold = 0, colRate = 1, colSample = 2;
    const headerRow = rows.find(r => r.querySelector('th'));
    if (headerRow) {
      Array.from(headerRow.querySelectorAll('th, td')).forEach((th, i) => {
        const t = th.textContent.trim();
        if (/所持|推移/i.test(t))            colHold   = i;
        if (/ドロップ率|rate/i.test(t))       colRate   = i;
        if (/ドロップ数|count|数$/.test(t))   colSample = i;
      });
    }

    // 解析每列
    const parsed = [];
    for (const row of rows) {
      if (row === headerRow) continue;
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length <= Math.max(colHold, colRate)) continue;

      const holdLeft = parseHoldLeft(cells[colHold]?.textContent);
      const rate     = parseRate(cells[colRate]?.textContent);
      const sample   = parseSample(cells[colSample]?.textContent);

      if (holdLeft === null || rate === null) continue;
      parsed.push({ row, cells, holdLeft, rate, sample });
    }

    if (parsed.length === 0) return;

    // 基準率：holdLeft === 0 那行（0→1）
    const baseline = parsed.find(p => p.holdLeft === 0);
    const baseRate = baseline ? baseline.rate : parsed[0].rate;

    // 上色
    for (const p of parsed) {
      const reliable = p.sample === null || p.sample >= MIN_RELIABLE_SAMPLE;

      let tier;
      if (!reliable) {
        tier = TIER_LOW_SAMPLE;
      } else if (baseRate === 0) {
        tier = DECAY_TIERS[DECAY_TIERS.length - 1];
      } else {
        tier = getTier(p.rate / baseRate);
      }

      for (const cell of p.cells) {
        cell.style.backgroundColor = tier.bg;
        cell.style.color = tier.fg;
      }

      p.row.classList.add('kcnav-decay-row');
    }
  }

  // ============================================================
  // 掃描頁面上符合條件的表格
  // ============================================================
  function colorize() {
    for (const table of document.querySelectorAll('table')) {
      const text = table.textContent;
      if (text.includes('→') && text.includes('%')) {
        processDropTable(table);
      }
    }
  }

  // MutationObserver：SPA 換頁時自動重跑
  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(colorize, 500);
  }).observe(document.body, { childList: true, subtree: true });

  // 等 Vue 渲染完再初始化
  setTimeout(colorize, 1800);

})();
