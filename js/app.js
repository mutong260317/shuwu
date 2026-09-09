(function () {
  'use strict';

  /* ---------- utils ---------- */
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtD(s) { var d = parseD(s); var now = new Date(); return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addMonths(s, m) { var d = parseD(s); d.setMonth(d.getMonth() + m); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysLeft(s) { var t = parseD(todayStr()); return Math.round((parseD(s) - t) / 86400000); }
  function daysHeld(s) { return Math.max(1, Math.round((parseD(todayStr()) - parseD(s)) / 86400000) + 1); }
  function fmtMoney(n) { return '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
  function fmtCost(v) {
    if (!isFinite(v)) return '¥0';
    if (v <= 0) return '¥0';
    if (v < 0.01) return '¥0.01';
    if (v < 1) return '¥' + v.toFixed(2);
    if (v < 100) return '¥' + v.toFixed(1);
    return '¥' + Math.round(v);
  }

  var CATS = [
    { id: 'digital', name: '数码', emoji: '📱', bg: '#EAF2FF' },
    { id: 'appliance', name: '家电', emoji: '🔌', bg: '#FFF1E0' },
    { id: 'home', name: '家居', emoji: '🛋️', bg: '#F0EBFF' },
    { id: 'fashion', name: '服饰', emoji: '👟', bg: '#FFE9F0' },
    { id: 'beauty', name: '美妆', emoji: '🧴', bg: '#FFE3EC' },
    { id: 'food', name: '食品', emoji: '🍱', bg: '#E8F7E0' },
    { id: 'book', name: '图书', emoji: '📚', bg: '#F5E9DA' },
    { id: 'sport', name: '运动', emoji: '🏀', bg: '#E0F7F4' },
    { id: 'pet', name: '宠物', emoji: '🐾', bg: '#FFF0DC' },
    { id: 'travel', name: '出行', emoji: '🚲', bg: '#E5F0FF' },
    { id: 'sub', name: '订阅', emoji: '🔁', bg: '#EDEDEA' },
    { id: 'other', name: '其他', emoji: '📦', bg: '#EFEFEA' }
  ];
  function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return CATS[CATS.length - 1]; }

  /* ---------- state ---------- */
  var state = {
    items: [],
    settings: { warnDays: 30, coolDays: 30 },
    tab: 'home',
    q: '', statusF: 'active', catF: 'all', remindF: 'all', showArchived: false
  };

  /* ---------- domain ---------- */
  function expiryDateOf(it) {
    if (it.expiryMode === 'date' && it.expiryDate) return it.expiryDate;
    if (it.expiryMode === 'prod' && it.prodDate && it.shelfDays) return addDays(it.prodDate, +it.shelfDays);
    if (it.expiryMode === 'open' && it.openDate && it.openMonths) return addMonths(it.openDate, +it.openMonths);
    return null;
  }
  function remindersOf(it) {
    var out = [];
    if (it.status === 'active') {
      var ed = expiryDateOf(it);
      if (ed && !it.archivedShelf) out.push({ type: 'shelf', label: '保质期', date: ed });
      if (it.warrantyDate) out.push({ type: 'warranty', label: '保修', date: it.warrantyDate });
      if (it.subNext) out.push({ type: 'sub', label: '订阅续费', date: it.subNext });
    }
    if (it.status === 'wishlist') {
      out.push({ type: 'cool', label: '冷静期', date: addDays(it.wishDate || it.purchaseDate, state.settings.coolDays) });
    }
    return out;
  }
  function allReminders() {
    var list = [];
    state.items.forEach(function (it) {
      remindersOf(it).forEach(function (r) {
        r.item = it; r.days = daysLeft(r.date);
        list.push(r);
      });
    });
    list.sort(function (a, b) { return a.days - b.days; });
    return list;
  }
  function urgentCount() {
    return allReminders().filter(function (r) { return r.days <= state.settings.warnDays; }).length;
  }
  function badgeOf(days) {
    if (days < 0) return { cls: 'red', text: '已过期 ' + (-days) + ' 天' };
    if (days === 0) return { cls: 'red', text: '今天到期' };
    if (days <= state.settings.warnDays) return { cls: 'orange', text: '剩 ' + days + ' 天' };
    return { cls: 'green', text: '剩 ' + days + ' 天' };
  }
  function dailyCost(it) { return (Number(it.price) || 0) / daysHeld(it.purchaseDate); }
  function perUse(it) { return it.useCount > 0 ? (Number(it.price) || 0) / it.useCount : null; }

  /* ---------- toast / sheet ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  function openSheet(html) {
    $('#sheet-body').innerHTML = html;
    $('#sheet-mask').classList.add('open');
    $('#sheet').classList.add('open');
  }
  function closeSheet() {
    $('#sheet-mask').classList.remove('open');
    $('#sheet').classList.remove('open');
  }

  /* ---------- renders ---------- */
  function emojiTile(it, size) {
    var c = catOf(it.cat);
    var e = it.emoji || c.emoji;
    return '<div class="item-emoji" style="background:' + c.bg + ';' + (size ? 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.52) + 'px;' : '') + '">' + esc(e) + '</div>';
  }

  function renderHome() {
    var act = state.items.filter(function (i) { return i.status === 'active'; });
    var retired = state.items.filter(function (i) { return i.status === 'retired'; });
    var total = act.reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0);
    var daily = act.reduce(function (s, i) { return s + dailyCost(i); }, 0);
    var rems = allReminders();
    var top = rems.slice(0, 3);

    var html = '';
    html += '<div class="hero">';
    html += '<div class="hero-label">服役资产综合日均成本</div>';
    html += '<div class="hero-main"><span class="hero-num">' + fmtCost(daily).slice(1) + '</span><span class="hero-unit">元 / 天</span></div>';
    html += '<div class="hero-grid">';
    html += '<div class="hero-cell"><div class="v lime">' + fmtMoney(total) + '</div><div class="k">资产总值</div></div>';
    html += '<div class="hero-cell"><div class="v">' + act.length + '</div><div class="k">服役中</div></div>';
    html += '<div class="hero-cell"><div class="v">' + retired.length + '</div><div class="k">已退役</div></div>';
    html += '</div></div>';

    html += '<div class="sec-title">临期提醒<span class="more">' + (rems.length ? urgentCount() + ' 项需关注' : '') + '</span></div>';
    if (top.length) {
      html += '<div class="card">';
      top.forEach(function (r) {
        var b = badgeOf(r.days);
        html += '<div class="remind-row" style="cursor:pointer" data-act="open-item" data-id="' + r.item.id + '">';
        html += emojiTile(r.item, 38);
        html += '<div class="info"><div class="t1">' + esc(r.item.name) + '</div><div class="t2">' + r.label + ' · ' + fmtD(r.date) + '</div></div>';
        html += '<span class="badge ' + b.cls + '">' + b.text + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="card"><div class="empty" style="padding:22px 0">暂无临期提醒，很稳 🌿</div></div>';
    }

    var recent = state.items.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 4);
    html += '<div class="sec-title">最近录入<span class="more" data-act="tab" data-tab="items" style="cursor:pointer">全部物品 →</span></div>';
    if (recent.length) {
      html += '<div class="grid2">';
      recent.forEach(function (it) { html += itemCard(it); });
      html += '</div>';
    } else {
      html += '<div class="card"><div class="empty"><div class="big">📦</div>还没有物品记录<br>点下方 + 开始记录第一件</div></div>';
    }
    $('#view-home').innerHTML = html;
  }

  function itemCard(it) {
    var sub = '';
    if (it.status === 'active') sub = '已用 ' + daysHeld(it.purchaseDate) + ' 天' + (it.useCount ? ' · 打卡 ' + it.useCount + ' 次' : '');
    else if (it.status === 'wishlist') sub = '冷静期中 · 愿望清单';
    else sub = '已退役';
    return '<button class="card item-card" data-act="open-item" data-id="' + it.id + '">' +
      emojiTile(it) +
      '<div class="item-name">' + esc(it.name) + '</div>' +
      '<div class="item-cost">' + fmtCost(dailyCost(it)) + '<small> /天</small></div>' +
      '<div class="item-sub">' + sub + '</div></button>';
  }

  function renderItems() {
    var html = '';
    html += '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="search" placeholder="搜索物品，买前查一下家里有没有…" value="' + esc(state.q) + '"></div>';
    html += '<div class="chips">';
    [['active', '服役中'], ['wishlist', '愿望清单'], ['retired', '已退役'], ['all', '全部']].forEach(function (s) {
      html += '<button class="chip' + (state.statusF === s[0] ? ' on' : '') + '" data-act="status-f" data-v="' + s[0] + '">' + s[1] + '</button>';
    });
    html += '</div><div class="chips">';
    html += '<button class="chip' + (state.catF === 'all' ? ' on' : '') + '" data-act="cat-f" data-v="all">全部分类</button>';
    CATS.forEach(function (c) {
      html += '<button class="chip' + (state.catF === c.id ? ' on' : '') + '" data-act="cat-f" data-v="' + c.id + '">' + c.emoji + ' ' + c.name + '</button>';
    });
    html += '</div>';

    var list = state.items.filter(function (it) {
      if (state.statusF !== 'all' && it.status !== state.statusF) return false;
      if (state.catF !== 'all' && it.cat !== state.catF) return false;
      if (state.q && it.name.indexOf(state.q) === -1) return false;
      return true;
    }).sort(function (a, b) { return dailyCost(a) - dailyCost(b); });

    if (list.length) {
      html += '<div class="grid2">';
      list.forEach(function (it) { html += itemCard(it); });
      html += '</div>';
      html += '<div class="hint" style="text-align:center;margin-top:14px">按日均成本从低到高排序 · 越用越值</div>';
    } else {
      html += '<div class="card"><div class="empty"><div class="big">🔍</div>没有匹配的物品</div></div>';
      if (!state.items.length) {
        html += '<div style="text-align:center;margin-top:12px"><button class="btn btn-ghost" data-act="seed">载入示例数据看看效果</button></div>';
      }
    }
    $('#view-items').innerHTML = html;
    var si = $('#search');
    if (si) si.addEventListener('input', function () {
      state.q = si.value.trim();
      renderItems();
      var el = $('#search');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }

  function renderRemind() {
    var rems = allReminders();
    var archived = state.items.filter(function (it) { return it.archivedShelf && expiryDateOf(it) && it.status === 'active'; });
    var html = '<div class="chips">';
    [['all', '全部'], ['shelf', '保质期'], ['warranty', '保修'], ['sub', '订阅续费'], ['cool', '冷静期']].forEach(function (f) {
      html += '<button class="chip' + (state.remindF === f[0] ? ' on' : '') + '" data-act="remind-f" data-v="' + f[0] + '">' + f[1] + '</button>';
    });
    html += '</div>';

    var list = rems.filter(function (r) { return state.remindF === 'all' || r.type === state.remindF; });
    if (list.length) {
      html += '<div class="card">';
      list.forEach(function (r) {
        var b = badgeOf(r.days);
        html += '<div class="remind-row">';
        html += emojiTile(r.item, 38);
        html += '<div class="info" style="cursor:pointer" data-act="open-item" data-id="' + r.item.id + '"><div class="t1">' + esc(r.item.name) + '</div><div class="t2">' + r.label + ' · ' + fmtD(r.date) + '</div></div>';
        if (r.type === 'shelf') html += '<button class="mini-act" data-act="archive-shelf" data-id="' + r.item.id + '">已处理</button>';
        if (r.type === 'sub') html += '<button class="mini-act" data-act="renew-sub" data-id="' + r.item.id + '">续期</button>';
        if (r.type === 'cool') html += '<button class="mini-act" data-act="buy-wish" data-id="' + r.item.id + '">已买入</button>';
        html += '<span class="badge ' + b.cls + '">' + b.text + '</span></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="card"><div class="empty"><div class="big">🌿</div>这一类暂无提醒</div></div>';
    }

    if (archived.length) {
      html += '<div class="sec-title">已归档<span class="more">' + (state.showArchived ? '收起' : '展开') + '</span></div>';
      html += '<div class="card" style="cursor:pointer" data-act="toggle-archived">';
      if (state.showArchived) {
        archived.forEach(function (it) {
          html += '<div class="remind-row">' + emojiTile(it, 38) +
            '<div class="info"><div class="t1">' + esc(it.name) + '</div><div class="t2">保质期 · ' + fmtD(expiryDateOf(it)) + '</div></div>' +
            '<button class="mini-act" data-act="unarchive-shelf" data-id="' + it.id + '">恢复</button>' +
            '<span class="badge ' + badgeOf(daysLeft(expiryDateOf(it))).cls + '">' + badgeOf(daysLeft(expiryDateOf(it))).text + '</span></div>';
        });
      } else {
        html += '<div class="remind-row"><div class="info"><div class="t2">共 ' + archived.length + ' 项已处理的保质期记录，点击展开</div></div></div>';
      }
      html += '</div>';
    }
    $('#view-remind').innerHTML = html;
  }

  function renderStats() {
    var bought = state.items.filter(function (i) { return i.status !== 'wishlist'; });
    var ym = todayStr().slice(0, 7);
    var monthSpend = bought.filter(function (i) { return (i.purchaseDate || '').slice(0, 7) === ym; })
      .reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0);
    var totalCheckin = state.items.reduce(function (s, i) { return s + (i.useCount || 0); }, 0);

    var byCat = {};
    bought.forEach(function (i) { byCat[i.cat] = (byCat[i.cat] || 0) + (Number(i.price) || 0); });
    var catList = Object.keys(byCat).map(function (k) { return { cat: k, v: byCat[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
    var catMax = catList.length ? catList[0].v : 1;

    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      var key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      var v = bought.filter(function (it) { return (it.purchaseDate || '').slice(0, 7) === key; })
        .reduce(function (s, it) { return s + (Number(it.price) || 0); }, 0);
      months.push({ key: key, label: (d.getMonth() + 1) + '月', v: v });
    }
    var mMax = Math.max.apply(null, months.map(function (m) { return m.v; }).concat([1]));

    var html = '<div class="hero" style="margin-top:10px"><div class="hero-grid" style="margin-top:0">';
    html += '<div class="hero-cell"><div class="v lime">' + fmtMoney(monthSpend) + '</div><div class="k">本月投入</div></div>';
    html += '<div class="hero-cell"><div class="v">' + totalCheckin + '</div><div class="k">累计打卡</div></div>';
    html += '<div class="hero-cell"><div class="v">' + bought.length + '</div><div class="k">物品总数</div></div>';
    html += '</div></div>';

    html += '<div class="sec-title">分类投入 TOP</div><div class="card" style="padding:14px">';
    if (catList.length) {
      catList.forEach(function (c, idx) {
        html += '<div class="bar-row"><span class="bl">' + catOf(c.cat).emoji + ' ' + catOf(c.cat).name + '</span><div class="track"><div class="fill' + (idx === 0 ? ' limef' : '') + '" style="width:' + Math.max(4, Math.round(c.v / catMax * 100)) + '%"></div></div><span class="bv">' + fmtMoney(c.v) + '</span></div>';
      });
    } else html += '<div class="empty" style="padding:16px 0">暂无数据</div>';
    html += '</div>';

    html += '<div class="sec-title">近 6 个月投入</div><div class="card" style="padding:14px">';
    months.forEach(function (m) {
      html += '<div class="bar-row"><span class="bl">' + m.label + '</span><div class="track"><div class="fill limef" style="width:' + Math.max(m.v ? 4 : 0, Math.round(m.v / mMax * 100)) + '%"></div></div><span class="bv">' + fmtMoney(m.v) + '</span></div>';
    });
    html += '</div>';
    $('#view-stats').innerHTML = html;
  }

  function updateDot() {
    var n = urgentCount();
    var dot = $('#remind-dot');
    if (n > 0) { dot.textContent = n > 99 ? '99+' : n; dot.classList.remove('hidden'); }
    else dot.classList.add('hidden');
  }

  function renderAll() {
    renderHome(); renderItems(); renderRemind(); renderStats(); updateDot();
  }

  /* ---------- sheets ---------- */
  function openForm(item) {
    var it = item || {};
    var isEdit = !!item;
    var html = '<h3>' + (isEdit ? '编辑物品' : '添加物品') + '</h3>';
    html += '<div class="f-label">名称 *</div><input class="f-input" id="f-name" placeholder="例如：索尼相机 A6700" value="' + esc(it.name) + '">';
    html += '<div class="f-row"><div><div class="f-label">价格（元）*</div><input class="f-input" id="f-price" type="number" inputmode="decimal" placeholder="0" value="' + (it.price != null ? esc(it.price) : '') + '"></div>' +
      '<div><div class="f-label">购买日期 *</div><input class="f-input" id="f-date" type="date" value="' + esc(it.purchaseDate || todayStr()) + '"></div></div>';

    html += '<div class="f-label">分类与图标</div><div class="chips" id="f-cats">';
    CATS.forEach(function (c) {
      html += '<button class="chip' + ((it.cat || 'other') === c.id ? ' on' : '') + '" data-act="cat-pick" data-v="' + c.id + '">' + c.emoji + ' ' + c.name + '</button>';
    });
    html += '</div><input type="hidden" id="f-cat" value="' + esc(it.cat || 'other') + '">';
    html += '<div class="f-row"><div><div class="f-label">自定义图标 <span class="opt">（留空用分类图标）</span></div><input class="f-input" id="f-emoji" maxlength="4" placeholder="emoji" value="' + esc(it.emoji || '') + '"></div>' +
      '<div><div class="f-label">状态</div><select class="f-select" id="f-status"><option value="active"' + ((it.status || 'active') === 'active' ? ' selected' : '') + '>服役中</option><option value="wishlist"' + (it.status === 'wishlist' ? ' selected' : '') + '>愿望清单（冷静期）</option><option value="retired"' + (it.status === 'retired' ? ' selected' : '') + '>已退役</option></select></div></div>';

    html += '<div class="f-group"><div class="g-title">保质期提醒 <span class="opt" style="color:var(--muted);font-weight:500">可选</span></div>';
    html += '<div class="chips" id="f-exp-modes" style="padding-top:6px">';
    [['none', '不记录'], ['date', '固定到期日'], ['prod', '生产+天数'], ['open', '开封+月份']].forEach(function (m) {
      html += '<button class="chip' + ((it.expiryMode || 'none') === m[0] ? ' on' : '') + '" data-act="exp-mode" data-v="' + m[0] + '">' + m[1] + '</button>';
    });
    html += '</div><input type="hidden" id="f-expmode" value="' + esc(it.expiryMode || 'none') + '">';
    html += '<div id="exp-date" class="hidden" style="margin-top:10px"><div class="f-label">到期日</div><input class="f-input" id="f-expdate" type="date" value="' + esc(it.expiryDate || '') + '"></div>';
    html += '<div id="exp-prod" class="hidden" style="margin-top:10px"><div class="f-row"><div><div class="f-label">生产日期</div><input class="f-input" id="f-proddate" type="date" value="' + esc(it.prodDate || '') + '"></div><div><div class="f-label">保质期天数</div><input class="f-input" id="f-shelfdays" type="number" inputmode="numeric" placeholder="如 180" value="' + (it.shelfDays != null ? esc(it.shelfDays) : '') + '"></div></div></div>';
    html += '<div id="exp-open" class="hidden" style="margin-top:10px"><div class="f-row"><div><div class="f-label">开封日期</div><input class="f-input" id="f-opendate" type="date" value="' + esc(it.openDate || '') + '"></div><div><div class="f-label">开封后保质期</div><select class="f-select" id="f-openmonths"><option value="3"' + (it.openMonths === 3 ? ' selected' : '') + '>3 个月</option><option value="6"' + ((!it.openMonths || it.openMonths === 6) ? ' selected' : '') + '>6 个月</option><option value="12"' + (it.openMonths === 12 ? ' selected' : '') + '>12 个月</option><option value="24"' + (it.openMonths === 24 ? ' selected' : '') + '>24 个月</option></select></div></div></div>';
    html += '</div>';

    html += '<div class="f-group"><div class="g-title">保修 / 订阅提醒 <span class="opt" style="color:var(--muted);font-weight:500">可选</span></div>';
    html += '<div class="f-row" style="margin-top:8px"><div><div class="f-label">保修至</div><input class="f-input" id="f-warranty" type="date" value="' + esc(it.warrantyDate || '') + '"></div>' +
      '<div><div class="f-label">订阅下次续费</div><input class="f-input" id="f-subnext" type="date" value="' + esc(it.subNext || '') + '"></div></div>';
    html += '<div class="f-label">订阅周期</div><select class="f-select" id="f-subcycle"><option value="1"' + (it.subCycle === 1 ? ' selected' : '') + '>每月</option><option value="3"' + (it.subCycle === 3 ? ' selected' : '') + '>每季</option><option value="12"' + ((!it.subCycle || it.subCycle === 12) ? ' selected' : '') + '>每年</option></select>';
    html += '</div>';

    html += '<div class="f-label">备注</div><input class="f-input" id="f-note" placeholder="型号、购买渠道、想说的话…" value="' + esc(it.note || '') + '">';
    html += '<div style="margin-top:18px"><button class="btn btn-primary" data-act="save-form" data-id="' + (isEdit ? it.id : '') + '">保存</button></div>';
    openSheet(html);
    syncExpMode();
  }

  function syncExpMode() {
    var m = $('#f-expmode') && $('#f-expmode').value;
    ['date', 'prod', 'open'].forEach(function (k) {
      var el = $('#exp-' + k);
      if (el) el.classList.toggle('hidden', m !== k);
    });
  }

  function openDetail(id) {
    var it = null;
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) it = state.items[i];
    if (!it) return;
    var c = catOf(it.cat);
    var html = '';
    html += '<div class="d-hero">' + emojiTile(it, 58).replace('item-emoji', 'item-emoji d-emoji') +
      '<div><div class="d-name">' + esc(it.name) + '</div><div class="d-tags">' +
      '<span class="badge dark">' + c.emoji + ' ' + c.name + '</span>' +
      (it.status === 'active' ? '<span class="badge green">服役中</span>' : it.status === 'wishlist' ? '<span class="badge orange">冷静期</span>' : '<span class="badge red">已退役</span>') +
      '</div></div></div>';

    var pu = perUse(it);
    html += '<div class="d-costs">';
    html += '<div class="d-cell"><div class="v lime2">' + fmtCost(dailyCost(it)) + '</div><div class="k">日均成本</div></div>';
    html += '<div class="d-cell"><div class="v">' + (pu != null ? fmtCost(pu) : '—') + '</div><div class="k">次均成本</div></div>';
    html += '<div class="d-cell"><div class="v">' + daysHeld(it.purchaseDate) + '</div><div class="k">持有天数</div></div>';
    html += '</div>';

    if (it.status === 'active') {
      html += '<button class="checkin-btn" data-act="checkin" data-id="' + it.id + '">✓ 今天用了一次，打卡（已打 ' + (it.useCount || 0) + ' 次）</button>';
    }
    if (it.status === 'wishlist') {
      var coolEnd = addDays(it.wishDate || it.purchaseDate, state.settings.coolDays);
      var dl = daysLeft(coolEnd);
      html += '<div class="card" style="margin-top:12px"><div class="remind-row"><div class="info"><div class="t1">冷静期' + (dl <= 0 ? '已结束：还想要吗？' : '还剩 ' + dl + ' 天') + '</div><div class="t2">' + fmtD(coolEnd) + ' 后再决定，冲动是魔鬼</div></div>' +
        '<button class="mini-act" data-act="buy-wish" data-id="' + it.id + '">已买入</button>' +
        '<button class="mini-act" data-act="drop-wish" data-id="' + it.id + '">拔草</button></div></div>';
    }

    var rems = remindersOf(it);
    if (rems.length) {
      html += '<div class="sec-title">到期提醒</div><div class="card d-rows">';
      rems.forEach(function (r) {
        var b = badgeOf(r.days);
        html += '<div class="remind-row"><div class="info"><div class="t1">' + r.label + '</div><div class="t2">' + fmtD(r.date) + '</div></div><span class="badge ' + b.cls + '">' + b.text + '</span></div>';
      });
      html += '</div>';
    }
    if (it.note) html += '<div class="note-box">' + esc(it.note) + '</div>';

    html += '<div class="btn-row"><button class="btn btn-ghost" data-act="edit" data-id="' + it.id + '">编辑</button>' +
      (it.status !== 'retired'
        ? '<button class="btn btn-ghost" data-act="retire" data-id="' + it.id + '">退役</button>'
        : '<button class="btn btn-ghost" data-act="restore" data-id="' + it.id + '">恢复服役</button>') +
      '</div>';
    html += '<div style="margin-top:10px"><button class="btn btn-danger" style="width:100%" data-act="del" data-id="' + it.id + '">删除</button></div>';
    openSheet(html);
  }

  function openSettings() {
    var s = state.settings;
    var html = '<h3>设置与数据</h3>';
    html += '<div class="f-row"><div><div class="f-label">临期提醒阈值（天）</div><input class="f-input" id="s-warn" type="number" value="' + s.warnDays + '"></div>' +
      '<div><div class="f-label">冷静期天数</div><input class="f-input" id="s-cool" type="number" value="' + s.coolDays + '"></div></div>';
    html += '<div style="margin-top:14px"><button class="btn btn-primary" data-act="save-settings">保存设置</button></div>';
    html += '<div class="sec-title">数据备份</div>';
    html += '<div class="btn-row" style="margin-top:0"><button class="btn btn-ghost" data-act="export-json">导出 JSON</button><button class="btn btn-ghost" data-act="export-csv">导出 CSV</button></div>';
    html += '<div style="margin-top:10px"><button class="btn btn-ghost" style="width:100%" data-act="import-json">从 JSON 恢复</button></div>';
    html += '<input type="file" id="import-file" accept=".json,application/json" class="hidden">';
    html += '<div class="note-box">数据只存在当前浏览器本地（IndexedDB），不上传任何服务器。<br>换手机 / 换浏览器 / 路由器换 IP 前，请先「导出 JSON」，到新环境「从 JSON 恢复」。<br><br><b>添加到手机桌面</b><br>· 小米：浏览器打开地址 → 菜单 → 添加到桌面 / 发送至桌面<br>· iPhone：Safari 打开地址 → 分享按钮 → 添加到主屏幕</div>';
    openSheet(html);
    var fi = $('#import-file');
    fi.addEventListener('change', function () {
      var f = fi.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var arr = Array.isArray(data) ? data : data.items;
          if (!Array.isArray(arr)) throw new Error('bad');
          var map = {};
          state.items.forEach(function (x) { map[x.id] = x; });
          arr.forEach(function (x) { if (x && x.id && x.name) map[x.id] = x; });
          var merged = Object.keys(map).map(function (k) { return map[k]; });
          DB.replaceAll(merged).then(function () {
            state.items = merged;
            renderAll();
            toast('已恢复 ' + arr.length + ' 条记录');
          });
        } catch (e) { toast('文件格式不对，恢复失败'); }
      };
      reader.readAsText(f);
      fi.value = '';
    });
  }

  /* ---------- actions ---------- */
  function saveForm(id) {
    var name = ($('#f-name').value || '').trim();
    var price = parseFloat($('#f-price').value);
    var date = $('#f-date').value;
    if (!name) { toast('先给物品起个名字'); return; }
    if (!(price >= 0)) { toast('价格要填数字'); return; }
    if (!date) { toast('选一下购买日期'); return; }
    var old = null;
    state.items.forEach(function (x) { if (x.id === id) old = x; });
    var it = old || { id: uid(), useCount: 0, createdAt: Date.now() };
    it.name = name; it.price = price; it.purchaseDate = date;
    it.cat = $('#f-cat').value;
    it.emoji = ($('#f-emoji').value || '').trim();
    var newStatus = $('#f-status').value;
    if (newStatus === 'wishlist' && it.status !== 'wishlist') it.wishDate = todayStr();
    it.status = newStatus;
    it.expiryMode = $('#f-expmode').value;
    it.expiryDate = $('#f-expdate').value || null;
    it.prodDate = $('#f-proddate').value || null;
    it.shelfDays = $('#f-shelfdays').value ? +$('#f-shelfdays').value : null;
    it.openDate = $('#f-opendate').value || null;
    it.openMonths = $('#f-openmonths').value ? +$('#f-openmonths').value : null;
    it.warrantyDate = $('#f-warranty').value || null;
    it.subNext = $('#f-subnext').value || null;
    it.subCycle = $('#f-subcycle').value ? +$('#f-subcycle').value : null;
    it.note = ($('#f-note').value || '').trim();
    if (!old) state.items.push(it);
    DB.saveItem(it).then(function () {
      closeSheet(); renderAll();
      toast(old ? '已更新' : '已记下：' + name);
    });
  }

  function download(filename, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportJSON() {
    download('shuwu-backup-' + todayStr() + '.json', JSON.stringify({ app: 'shuwu', exportedAt: new Date().toISOString(), items: state.items, settings: state.settings }, null, 2), 'application/json');
    DB.setKV('lastBackup', todayStr());
    toast('已导出备份文件');
  }
  function exportCSV() {
    var rows = [['名称', '价格', '购买日期', '分类', '状态', '使用次数', '日均成本', '到期日', '保修至', '订阅续费', '备注']];
    state.items.forEach(function (it) {
      rows.push([it.name, it.price, it.purchaseDate, catOf(it.cat).name, it.status, it.useCount || 0, dailyCost(it).toFixed(2), expiryDateOf(it) || '', it.warrantyDate || '', it.subNext || '', (it.note || '').replace(/\n/g, ' ')]);
    });
    var csv = '' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    download('shuwu-' + todayStr() + '.csv', csv, 'text/csv');
    toast('已导出 CSV');
  }

  function seed() {
    var t = todayStr();
    var demo = [
      { id: uid(), name: '索尼相机 A6700', price: 9999, purchaseDate: addDays(t, -220), cat: 'digital', emoji: '📷', status: 'active', useCount: 86, note: '主力机，越用越值', warrantyDate: addDays(t, 145), createdAt: Date.now() - 5000 },
      { id: uid(), name: '面霜（开封后）', price: 320, purchaseDate: addDays(t, -100), cat: 'beauty', status: 'active', useCount: 0, expiryMode: 'open', openDate: addDays(t, -160), openMonths: 6, createdAt: Date.now() - 4000 },
      { id: uid(), name: '视频会员年费', price: 258, purchaseDate: addDays(t, -340), cat: 'sub', status: 'active', useCount: 0, subNext: addDays(t, 20), subCycle: 12, createdAt: Date.now() - 3000 },
      { id: uid(), name: '鲜牛奶', price: 30, purchaseDate: addDays(t, -5), cat: 'food', status: 'active', useCount: 0, expiryMode: 'prod', prodDate: addDays(t, -6), shelfDays: 7, createdAt: Date.now() - 2000 },
      { id: uid(), name: '露营帐篷', price: 899, purchaseDate: t, cat: 'sport', emoji: '⛺', status: 'wishlist', wishDate: addDays(t, -20), useCount: 0, createdAt: Date.now() - 1000 },
      { id: uid(), name: '旧耳机', price: 1299, purchaseDate: addDays(t, -700), cat: 'digital', status: 'retired', useCount: 300, createdAt: Date.now() - 600 }
    ];
    DB.replaceAll(demo).then(function () {
      state.items = demo;
      renderAll();
      toast('示例数据已载入，可随便改');
    });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'tab': switchTab(el.getAttribute('data-tab')); break;
      case 'open-item': openDetail(id); break;
      case 'status-f': state.statusF = el.getAttribute('data-v'); renderItems(); break;
      case 'cat-f': state.catF = el.getAttribute('data-v'); renderItems(); break;
      case 'remind-f': state.remindF = el.getAttribute('data-v'); renderRemind(); break;
      case 'toggle-archived': state.showArchived = !state.showArchived; renderRemind(); break;
      case 'cat-pick':
        $('#f-cat').value = el.getAttribute('data-v');
        $$('#f-cats .chip').forEach(function (c) { c.classList.remove('on'); });
        el.classList.add('on');
        break;
      case 'exp-mode':
        $('#f-expmode').value = el.getAttribute('data-v');
        $$('#f-exp-modes .chip').forEach(function (c) { c.classList.remove('on'); });
        el.classList.add('on');
        syncExpMode();
        break;
      case 'save-form': saveForm(id); break;
      case 'checkin':
        state.items.forEach(function (x) { if (x.id === id) { x.useCount = (x.useCount || 0) + 1; x.lastUsed = todayStr(); DB.saveItem(x); } });
        renderAll(); openDetail(id); toast('打卡成功，次均成本又降了 ↓');
        break;
      case 'edit': state.items.forEach(function (x) { if (x.id === id) openForm(x); }); break;
      case 'retire':
        state.items.forEach(function (x) { if (x.id === id) { x.status = 'retired'; DB.saveItem(x); } });
        closeSheet(); renderAll(); toast('已退役，感谢它的服务');
        break;
      case 'restore':
        state.items.forEach(function (x) { if (x.id === id) { x.status = 'active'; DB.saveItem(x); } });
        closeSheet(); renderAll(); toast('重新服役');
        break;
      case 'del':
        if (confirm('确定删除这条记录？删除后不可恢复。')) {
          DB.deleteItem(id).then(function () {
            state.items = state.items.filter(function (x) { return x.id !== id; });
            closeSheet(); renderAll(); toast('已删除');
          });
        }
        break;
      case 'archive-shelf':
        state.items.forEach(function (x) { if (x.id === id) { x.archivedShelf = true; DB.saveItem(x); } });
        renderAll(); toast('已归档，眼不见为净');
        break;
      case 'unarchive-shelf':
        e.stopPropagation();
        state.items.forEach(function (x) { if (x.id === id) { x.archivedShelf = false; DB.saveItem(x); } });
        renderAll(); toast('已恢复提醒');
        break;
      case 'renew-sub':
        state.items.forEach(function (x) {
          if (x.id === id) { x.subNext = addMonths(x.subNext || todayStr(), x.subCycle || 12); DB.saveItem(x); }
        });
        renderAll(); toast('已续期，下次续费时间已更新');
        break;
      case 'buy-wish':
        state.items.forEach(function (x) { if (x.id === id) { x.status = 'active'; x.purchaseDate = todayStr(); DB.saveItem(x); } });
        closeSheet(); renderAll(); toast('恭喜入手，开始用回本吧');
        break;
      case 'drop-wish':
        state.items.forEach(function (x) { if (x.id === id) { x.status = 'retired'; DB.saveItem(x); } });
        closeSheet(); renderAll(); toast('拔草成功，省下一笔');
        break;
      case 'seed': seed(); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'import-json': $('#import-file').click(); break;
      case 'save-settings':
        state.settings.warnDays = Math.max(1, +$('#s-warn').value || 30);
        state.settings.coolDays = Math.max(1, +$('#s-cool').value || 30);
        DB.setKV('settings', state.settings).then(function () { closeSheet(); renderAll(); toast('设置已保存'); });
        break;
    }
  });

  function switchTab(t) {
    state.tab = t;
    $$('#tabbar .tab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    $('#view-' + t).classList.add('active');
    window.scrollTo(0, 0);
  }

  $$('#tabbar .tab').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });
  $('#add-btn').addEventListener('click', function () { openForm(null); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#sheet-mask').addEventListener('click', closeSheet);

  /* ---------- init ---------- */
  DB.open().then(function () {
    return Promise.all([DB.getAllItems(), DB.getKV('settings')]);
  }).then(function (res) {
    state.items = res[0] || [];
    if (res[1]) state.settings = Object.assign(state.settings, res[1]);
    renderAll();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
