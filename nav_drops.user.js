// ==UserScript==
// @name         KCNAV優化
// @namespace    https://tsunkit.net/
// @version      3.0
// @description  依掉落率衰減上色，母數不足顯示灰色。敵方編成統計顯示機率。
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
  // 🌈 Background - 掉落率衰減
  // ============================================================

  function getHslColor(ratio) {
    const r = Math.max(0, Math.min(1, ratio));

    const hue = r * 120;   // 色相：紅(0) → 綠(120)
    const saturation = 45; // 飽和度
    const lightness = 32;  // 亮度

    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: r > 0.5 ? '#e8e8e8' : '#ffffff',
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
  // 🧠 Core - 掉落率衰減上色
  // ============================================================

  function processDropTable(table) {
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
  // 📊 敵方編成機率顯示
  // ============================================================

  function processCompositionTable(table) {
    const rows = [...table.querySelectorAll('tr')];
    const dataRows = [];

    // 收集所有包含 × 符號的行
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td')];

      // 尋找包含 × 符號的單元格
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const text = cell.textContent.trim();

        // 匹配 ×12527 這樣的格式
        const match = text.match(/^×(\d+)$/);
        if (match) {
          const count = parseInt(match[1]);
          dataRows.push({
            cell: cell,
            count: count,
            row: row
          });
        }
      }
    }

    // 如果找到統計數據，計算總和和機率
    if (dataRows.length > 0) {
      // 計算同一戰鬥點所有編成的總次數
      const totalCount = dataRows.reduce((sum, d) => sum + d.count, 0);

      for (const data of dataRows) {
        const percentage = ((data.count / totalCount) * 100).toFixed(1);
        const text = data.cell.textContent.trim();

        // 只在還沒有百分比的情況下添加
        if (!text.includes('(')) {
          data.cell.textContent = `${text} (${percentage}%)`;
        }
      }
    }
  }

  // ============================================================
  // 🔍 Init
  // ============================================================

  function scanTables() {
    document.querySelectorAll('table').forEach(table => {
      const text = table.textContent;

      // 掉落率衰減：檢查是否包含 → 和 %
      if (text.includes('→') && text.includes('%')) {
        processDropTable(table);
      }

      // 敵方編成機率：檢查是否包含 × 和數字
      if (text.includes('×')) {
        processCompositionTable(table);
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
