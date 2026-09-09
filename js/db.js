(function (global) {
  'use strict';
  var DB_NAME = 'shuwu-db';
  var db = null;
  var useLS = !('indexedDB' in global);

  function lsRead() {
    try { return JSON.parse(localStorage.getItem('shuwu-items') || '[]'); } catch (e) { return []; }
  }
  function lsWrite(items) { localStorage.setItem('shuwu-items', JSON.stringify(items)); }
  function lsKV() {
    try { return JSON.parse(localStorage.getItem('shuwu-kv') || '{}'); } catch (e) { return {}; }
  }
  function lsKVWrite(kv) { localStorage.setItem('shuwu-kv', JSON.stringify(kv)); }

  function open() {
    if (useLS) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = function () { db = req.result; resolve(); };
      req.onerror = function () { useLS = true; resolve(); };
    });
  }

  function tx(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode);
      var s = t.objectStore(store);
      var result = fn(s);
      t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
      t.onerror = function () { reject(t.error); };
    });
  }

  var api = {
    open: open,
    getAllItems: function () {
      if (useLS) return Promise.resolve(lsRead());
      return tx('items', 'readonly', function (s) { return s.getAll(); });
    },
    saveItem: function (item) {
      if (useLS) {
        var items = lsRead().filter(function (x) { return x.id !== item.id; });
        items.push(item); lsWrite(items); return Promise.resolve();
      }
      return tx('items', 'readwrite', function (s) { return s.put(item); });
    },
    deleteItem: function (id) {
      if (useLS) { lsWrite(lsRead().filter(function (x) { return x.id !== id; })); return Promise.resolve(); }
      return tx('items', 'readwrite', function (s) { return s.delete(id); });
    },
    replaceAll: function (items) {
      if (useLS) { lsWrite(items); return Promise.resolve(); }
      return tx('items', 'readwrite', function (s) {
        s.clear();
        items.forEach(function (it) { s.put(it); });
      });
    },
    getKV: function (k) {
      if (useLS) return Promise.resolve(lsKV()[k]);
      return tx('kv', 'readonly', function (s) { return s.get(k); }).then(function (r) { return r && r.v; });
    },
    setKV: function (k, v) {
      if (useLS) { var kv = lsKV(); kv[k] = v; lsKVWrite(kv); return Promise.resolve(); }
      return tx('kv', 'readwrite', function (s) { return s.put({ k: k, v: v }); });
    }
  };

  global.DB = api;
})(window);
