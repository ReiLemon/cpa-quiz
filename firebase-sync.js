// Firebase Auto-Sync - 完全独立スクリプト
// v3: データを3ドキュメントに分割してFirestore 1MB制限を回避
(function(){
  'use strict';
  try {
    var el = document.getElementById('firebase-sync-config');
    if (!el) return;
    var FK = el.getAttribute('data-key');
    if (!FK) return;
    if (typeof firebase === 'undefined') return;

    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: "AIzaSyByImWNSABE69MCpTHbqYZzz6LZRKwplD4",
        authDomain: "cpa-quiz-6d1f9.firebaseapp.com",
        projectId: "cpa-quiz-6d1f9",
        storageBucket: "cpa-quiz-6d1f9.firebasestorage.app",
        messagingSenderId: "534803312241",
        appId: "1:534803312241:web:00dde6df4cbbedf1da35d0"
      });
    }

    var db = firebase.firestore();
    var userRef = db.collection('users').doc('u5wnfjuskrmm1bl4z0');
    // v3: 3つのドキュメントに分割
    var colRef = userRef.collection('subjects_v2');
    var coreRef  = colRef.doc(FK + '_core');   // db, srsDB, wrongDB, unknownDB, bookmarks, answeredDB
    var histRef  = colRef.doc(FK + '_hist');   // sessHistory, slowDB, slow20DB, memoMap
    var extraRef = colRef.doc(FK + '_extra');  // refcheck, highlight

    // インジケーター
    var dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;font-size:11px;padding:3px 8px;border-radius:10px;background:rgba(0,0,0,.6);color:#aaa;pointer-events:none;transition:opacity .3s;opacity:0';
    document.body.appendChild(dot);
    var hideTimer;
    function showStatus(msg, color) {
      dot.textContent = msg;
      dot.style.color = color || '#aaa';
      dot.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){ dot.style.opacity = '0'; }, 3000);
    }

    // データ圧縮
    function trimHist(data) {
      var d = {};
      // sessHistory: 直近30件、items圧縮
      if (data.sessHistory && Array.isArray(data.sessHistory)) {
        var sh = data.sessHistory.slice();
        sh.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
        d.sessHistory = sh.slice(0, 30).map(function(s){
          var o = { ts: s.ts, ok: s.ok, ng: s.ng, total: s.total };
          if (s.items) o.items = s.items.map(function(it){
            return { id: it.id, r: it.r !== undefined ? it.r : (it.result==='ok'?1:it.result==='ng'?0:2) };
          });
          return o;
        });
      }
      if (data.slowDB) {
        d.slowDB = Array.isArray(data.slowDB) ? data.slowDB.slice(-50) : data.slowDB;
      }
      if (data.slow20DB) d.slow20DB = data.slow20DB;
      if (data.memoMap) d.memoMap = data.memoMap;
      d._t = new Date().toISOString();
      return d;
    }

    function getLocalSnapshot() {
      return JSON.stringify({
        main: localStorage.getItem(FK) || '{}',
        ref: localStorage.getItem(FK + '_refcheck') || '{}',
        hl: localStorage.getItem(FK + '_hl') || '{}'
      });
    }

    // アップロード: 3ドキュメントに分割書き込み
    var lastSnapshot = getLocalSnapshot();
    var uploading = false;
    function upload() {
      if (uploading) return;
      var snap = getLocalSnapshot();
      if (snap === lastSnapshot) return;
      uploading = true;
      lastSnapshot = snap;
      showStatus('⬆ 保存中...', '#ffa726');

      var main = JSON.parse(localStorage.getItem(FK) || '{}');
      var corePayload = {
        db: main.db || {},
        srsDB: main.srsDB || {},
        wrongDB: main.wrongDB || {},
        unknownDB: main.unknownDB || {},
        bookmarks: main.bookmarks || {},
        answeredDB: main.answeredDB || {},
        _t: new Date().toISOString()
      };
      var histPayload = trimHist(main);
      var extraPayload = {
        refcheck: JSON.parse(localStorage.getItem(FK + '_refcheck') || '{}'),
        highlight: JSON.parse(localStorage.getItem(FK + '_hl') || '{}'),
        _t: new Date().toISOString()
      };

      Promise.all([
        coreRef.set(corePayload),
        histRef.set(histPayload),
        extraRef.set(extraPayload)
      ]).then(function(){
        uploading = false;
        showStatus('✅ 同期完了', '#66bb6a');
      }).catch(function(e){
        uploading = false;
        showStatus('❌ 保存エラー: ' + (e.message||'').slice(0,80), '#ef5350');
      });
    }

    setInterval(function(){ try { upload(); } catch(e){} }, 3000);

    window.addEventListener('beforeunload', function(){
      try {
        var snap = getLocalSnapshot();
        if (snap !== lastSnapshot) {
          var main = JSON.parse(localStorage.getItem(FK) || '{}');
          coreRef.set({
            db: main.db||{}, srsDB: main.srsDB||{}, wrongDB: main.wrongDB||{},
            unknownDB: main.unknownDB||{}, bookmarks: main.bookmarks||{},
            answeredDB: main.answeredDB||{}, _t: new Date().toISOString()
          });
          histRef.set(trimHist(main));
          extraRef.set({
            refcheck: JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}'),
            highlight: JSON.parse(localStorage.getItem(FK+'_hl')||'{}'),
            _t: new Date().toISOString()
          });
        }
      } catch(e){}
    });

    // ダウンロード＆マージ
    showStatus('⬇ 読込中...', '#42a5f5');

    function mergeMain(l, m) {
      if (m.db) {
        if (!l.db) l.db = {};
        for (var k in m.db) {
          if (!l.db[k]) l.db[k] = m.db[k];
          else {
            l.db[k].o = Math.max(l.db[k].o||0, m.db[k].o||0);
            l.db[k].x = Math.max(l.db[k].x||0, m.db[k].x||0);
            l.db[k].ts = Math.max(l.db[k].ts||0, m.db[k].ts||0);
          }
        }
      }
      ['wrongDB','unknownDB','bookmarks','answeredDB'].forEach(function(f){
        if (m[f]) {
          if (!l[f]) l[f] = {};
          for (var k in m[f]) { if (!l[f][k]) l[f][k] = m[f][k]; }
        }
      });
      if (m.srsDB) {
        if (!l.srsDB) l.srsDB = {};
        for (var k in m.srsDB) {
          if (!l.srsDB[k]) l.srsDB[k] = m.srsDB[k];
          else l.srsDB[k].lv = Math.max(l.srsDB[k].lv||0, m.srsDB[k].lv||0);
        }
      }
      return l;
    }

    function mergeHist(l, m) {
      if (m.slowDB && Array.isArray(m.slowDB)) {
        if (!l.slowDB) l.slowDB = [];
        var ss = {}; l.slowDB.forEach(function(i){ ss[i]=1; });
        m.slowDB.forEach(function(i){ if(!ss[i]) l.slowDB.push(i); });
      }
      if (m.slow20DB) {
        if (!l.slow20DB) l.slow20DB = {};
        for (var k in m.slow20DB) { if(!l.slow20DB[k]) l.slow20DB[k]=m.slow20DB[k]; }
      }
      if (m.memoMap) {
        if (!l.memoMap) l.memoMap = {};
        for (var k in m.memoMap) {
          if (!l.memoMap[k]) l.memoMap[k] = m.memoMap[k];
          else if ((m.memoMap[k]||'').length > (l.memoMap[k]||'').length) l.memoMap[k] = m.memoMap[k];
        }
      }
      if (m.sessHistory && Array.isArray(m.sessHistory)) {
        if (!l.sessHistory) l.sessHistory = [];
        var ts = {}; l.sessHistory.forEach(function(s){ ts[s.ts]=1; });
        m.sessHistory.forEach(function(s){ if(!ts[s.ts]) l.sessHistory.push(s); });
        l.sessHistory.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
      }
      return l;
    }

    // v3ドキュメントを読む
    Promise.all([
      coreRef.get(),
      histRef.get(),
      extraRef.get()
    ]).then(function(docs){
      var coreDoc = docs[0], histDoc = docs[1], extraDoc = docs[2];

      if (coreDoc.exists) {
        // v3形式のデータあり
        var l = JSON.parse(localStorage.getItem(FK) || '{}');
        l = mergeMain(l, coreDoc.data());
        if (histDoc.exists) l = mergeHist(l, histDoc.data());
        localStorage.setItem(FK, JSON.stringify(l));

        if (extraDoc.exists) {
          var ed = extraDoc.data();
          if (ed.refcheck) {
            var rc = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
            for (var k in ed.refcheck) { if(!rc[k]) rc[k]=ed.refcheck[k]; }
            localStorage.setItem(FK+'_refcheck', JSON.stringify(rc));
          }
          if (ed.highlight) {
            var hl = JSON.parse(localStorage.getItem(FK+'_hl')||'{}');
            for (var k in ed.highlight) { if(!hl[k]) hl[k]=ed.highlight[k]; }
            localStorage.setItem(FK+'_hl', JSON.stringify(hl));
          }
        }

        if (typeof loadStorage === 'function') loadStorage();
        if (typeof refCheckDB !== 'undefined') refCheckDB = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
        if (typeof updateCountBadge === 'function') updateCountBadge();
        lastSnapshot = getLocalSnapshot();
        showStatus('✅ 同期完了', '#66bb6a');
        return;
      }

      // v3なし → 旧形式(subjects/{FK})からマイグレーション
      var oldRef = userRef.collection('subjects').doc(FK);
      return oldRef.get().then(function(oldDoc){
        if (oldDoc.exists) {
          var r = oldDoc.data();
          // マージ
          var l = JSON.parse(localStorage.getItem(FK) || '{}');
          if (r.main) {
            l = mergeMain(l, r.main);
            l = mergeHist(l, r.main);
          }
          localStorage.setItem(FK, JSON.stringify(l));
          if (r.refcheck) {
            var rc = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
            for (var k in r.refcheck) { if(!rc[k]) rc[k]=r.refcheck[k]; }
            localStorage.setItem(FK+'_refcheck', JSON.stringify(rc));
          }
          if (r.highlight) {
            var hl = JSON.parse(localStorage.getItem(FK+'_hl')||'{}');
            for (var k in r.highlight) { if(!hl[k]) hl[k]=r.highlight[k]; }
            localStorage.setItem(FK+'_hl', JSON.stringify(hl));
          }

          if (typeof loadStorage === 'function') loadStorage();
          if (typeof refCheckDB !== 'undefined') refCheckDB = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
          if (typeof updateCountBadge === 'function') updateCountBadge();
          lastSnapshot = getLocalSnapshot();
          showStatus('🔄 データ移行中...', '#42a5f5');
          // v3に書き込み（分割）
          upload();
          return;
        }

        // 旧形式もなし → 親ドキュメントチェック
        return userRef.get().then(function(parentDoc){
          if (parentDoc.exists && parentDoc.data()[FK]) {
            var r = parentDoc.data()[FK];
            var l = JSON.parse(localStorage.getItem(FK) || '{}');
            if (r.main) { l = mergeMain(l, r.main); l = mergeHist(l, r.main); }
            localStorage.setItem(FK, JSON.stringify(l));
            if (r.refcheck) {
              var rc = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
              for (var k in r.refcheck) { if(!rc[k]) rc[k]=r.refcheck[k]; }
              localStorage.setItem(FK+'_refcheck', JSON.stringify(rc));
            }
            if (r.highlight) {
              var hl = JSON.parse(localStorage.getItem(FK+'_hl')||'{}');
              for (var k in r.highlight) { if(!hl[k]) hl[k]=r.highlight[k]; }
              localStorage.setItem(FK+'_hl', JSON.stringify(hl));
            }
            if (typeof loadStorage === 'function') loadStorage();
            if (typeof refCheckDB !== 'undefined') refCheckDB = JSON.parse(localStorage.getItem(FK+'_refcheck')||'{}');
            if (typeof updateCountBadge === 'function') updateCountBadge();
            lastSnapshot = getLocalSnapshot();
            upload();
          } else {
            showStatus('✅ ローカル使用', '#66bb6a');
            upload();
          }
        });
      });
    }).catch(function(e){
      showStatus('❌ 読込エラー', '#ef5350');
    });

  } catch(ex) {}
})();
