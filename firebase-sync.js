// Firebase Auto-Sync v3 - 科目別ドキュメント対応 + キャッシュバスト
// 各科目を users/{uid}/subjects/{FK} に保存（1MB上限回避）
(function(){
  'use strict';
  try {
    var el = document.getElementById('firebase-sync-config');
    if (!el) { console.warn('[sync] config element not found'); return; }
    var FK = el.getAttribute('data-key');
    if (!FK) { console.warn('[sync] data-key missing'); return; }
    if (typeof firebase === 'undefined') { console.warn('[sync] firebase not loaded'); return; }

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
    // v2: 科目別ドキュメント
    var ref = db.collection('users').doc('u5wnfjuskrmm1bl4z0').collection('subjects').doc(FK);
    // v1互換: 旧ドキュメント（マイグレーション用）
    var oldRef = db.collection('users').doc('u5wnfjuskrmm1bl4z0');

    // 同期インジケーター
    var dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;font-size:11px;padding:3px 8px;border-radius:10px;background:rgba(0,0,0,.6);color:#aaa;pointer-events:none;transition:opacity .3s;opacity:0';
    document.body.appendChild(dot);
    var hideTimer;
    function showStatus(msg, color) {
      dot.textContent = msg;
      dot.style.color = color || '#aaa';
      dot.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function(){ dot.style.opacity = '0'; }, 4000);
    }

    function getLocalSnapshot() {
      return JSON.stringify({
        main: localStorage.getItem(FK) || '{}',
        ref: localStorage.getItem(FK + '_refcheck') || '{}',
        hl: localStorage.getItem(FK + '_hl') || '{}'
      });
    }

    function buildPayload() {
      return {
        main: JSON.parse(localStorage.getItem(FK) || '{}'),
        refcheck: JSON.parse(localStorage.getItem(FK + '_refcheck') || '{}'),
        highlight: JSON.parse(localStorage.getItem(FK + '_hl') || '{}'),
        _t: new Date().toISOString(),
        _v: 3
      };
    }

    var lastSnapshot = getLocalSnapshot();
    var uploading = false;

    function upload(force) {
      if (uploading) return;
      var snap = getLocalSnapshot();
      if (!force && snap === lastSnapshot) return;
      uploading = true;
      lastSnapshot = snap;
      showStatus('⬆ 保存中...', '#ffa726');
      var payload = buildPayload();
      console.log('[sync] uploading to', FK, 'size:', JSON.stringify(payload).length);
      ref.set(payload).then(function(){
        uploading = false;
        showStatus('✅ 同期完了', '#66bb6a');
        console.log('[sync] upload success');
      }).catch(function(e){
        uploading = false;
        showStatus('❌ 保存エラー: ' + (e.message||e), '#ef5350');
        console.error('[sync] upload error:', e);
      });
    }

    setInterval(function(){ try { upload(); } catch(e){ console.error('[sync] interval error:', e); } }, 3000);

    window.addEventListener('beforeunload', function(){
      try {
        var snap = getLocalSnapshot();
        if (snap !== lastSnapshot) {
          ref.set(buildPayload());
        }
      } catch(e){}
    });

    // マージロジック
    function mergeRemote(r) {
      if (r.main) {
        var l = JSON.parse(localStorage.getItem(FK) || '{}');
        var m = r.main;
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
        if (m.slowDB && Array.isArray(m.slowDB)) {
          if (!l.slowDB) l.slowDB = [];
          var ss = {};
          l.slowDB.forEach(function(i){ ss[i]=1; });
          m.slowDB.forEach(function(i){ if(!ss[i]) l.slowDB.push(i); });
        }
        if (m.slow20DB) {
          if (!l.slow20DB) l.slow20DB = {};
          for (var k in m.slow20DB) { if(!l.slow20DB[k]) l.slow20DB[k]=m.slow20DB[k]; }
        }
        if (m.srsDB) {
          if (!l.srsDB) l.srsDB = {};
          for (var k in m.srsDB) {
            if (!l.srsDB[k]) l.srsDB[k] = m.srsDB[k];
            else l.srsDB[k].lv = Math.max(l.srsDB[k].lv||0, m.srsDB[k].lv||0);
          }
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
          var ts = {};
          l.sessHistory.forEach(function(s){ ts[s.ts]=1; });
          m.sessHistory.forEach(function(s){ if(!ts[s.ts]) l.sessHistory.push(s); });
          l.sessHistory.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
        }
        localStorage.setItem(FK, JSON.stringify(l));
      }
      if (r.refcheck) {
        var rc = JSON.parse(localStorage.getItem(FK+'_refcheck') || '{}');
        for (var k in r.refcheck) { if(!rc[k]) rc[k] = r.refcheck[k]; }
        localStorage.setItem(FK+'_refcheck', JSON.stringify(rc));
      }
      if (r.highlight) {
        var hl = JSON.parse(localStorage.getItem(FK+'_hl') || '{}');
        for (var k in r.highlight) { if(!hl[k]) hl[k] = r.highlight[k]; }
        localStorage.setItem(FK+'_hl', JSON.stringify(hl));
      }
    }

    function reloadApp() {
      if (typeof loadStorage === 'function') loadStorage();
      if (typeof refCheckDB !== 'undefined') {
        refCheckDB = JSON.parse(localStorage.getItem(FK+'_refcheck') || '{}');
      }
      if (typeof updateCountBadge === 'function') updateCountBadge();
    }

    // ページロード時にダウンロード＆マージ
    showStatus('⬇ v3読込中...', '#42a5f5');
    console.log('[sync] v3 starting for', FK);

    // まずv2（科目別ドキュメント）を試す → なければv1から移行
    ref.get().then(function(doc){
      console.log('[sync] v2 doc exists:', doc.exists, doc.exists ? 'has main:' + !!doc.data().main : '');
      if (doc.exists && doc.data().main) {
        // v2にデータあり → マージしてアップロード
        mergeRemote(doc.data());
        reloadApp();
        upload(true);
        return;
      }
      // v2にデータなし → v1（旧ドキュメント）からマイグレーション
      console.log('[sync] trying v1 migration...');
      oldRef.get().then(function(oldDoc){
        console.log('[sync] v1 doc exists:', oldDoc.exists, oldDoc.exists ? 'has FK:' + !!(oldDoc.data()||{})[FK] : '');
        if (oldDoc.exists && oldDoc.data()[FK]) {
          mergeRemote(oldDoc.data()[FK]);
          reloadApp();
        }
        // v2に保存（マイグレーション or ローカルのみ）
        upload(true);
      }).catch(function(e){
        console.error('[sync] v1 read error:', e);
        // v1読込失敗でもローカルデータをv2にアップロード
        upload(true);
      });
    }).catch(function(e){
      showStatus('❌ 読込エラー: ' + (e.code||e.message||e), '#ef5350');
      console.error('[sync] v2 read error:', e);
    });

  } catch(ex) { console.error('[sync] init error:', ex); }
})();
