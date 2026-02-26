// Firebase Auto-Sync - 完全独立スクリプト
// アプリ本体のコードには一切干渉しない
(function(){
  'use strict';
  try {
    // FK はHTMLの data属性から取得
    var el = document.getElementById('firebase-sync-config');
    if (!el) return;
    var FK = el.getAttribute('data-key');
    if (!FK) return;

    // Firebase SDK チェック
    if (typeof firebase === 'undefined') return;

    // 初期化（重複防止）
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
    var ref = db.collection('users').doc('u5wnfjuskrmm1bl4z0');

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
      hideTimer = setTimeout(function(){ dot.style.opacity = '0'; }, 3000);
    }

    // ローカルデータのスナップショット取得
    function getLocalSnapshot() {
      return JSON.stringify({
        main: localStorage.getItem(FK) || '{}',
        ref: localStorage.getItem(FK + '_refcheck') || '{}',
        hl: localStorage.getItem(FK + '_hl') || '{}'
      });
    }

    // Firestoreへアップロード
    var lastSnapshot = getLocalSnapshot();
    var uploading = false;
    function upload() {
      if (uploading) return;
      var snap = getLocalSnapshot();
      if (snap === lastSnapshot) return; // 変更なし
      uploading = true;
      lastSnapshot = snap;
      showStatus('⬆ 保存中...', '#ffa726');
      var payload = {};
      payload[FK] = {
        main: JSON.parse(localStorage.getItem(FK) || '{}'),
        refcheck: JSON.parse(localStorage.getItem(FK + '_refcheck') || '{}'),
        highlight: JSON.parse(localStorage.getItem(FK + '_hl') || '{}'),
        _t: new Date().toISOString()
      };
      ref.set(payload, { merge: true }).then(function(){
        uploading = false;
        showStatus('✅ 同期完了', '#66bb6a');
      }).catch(function(){
        uploading = false;
        showStatus('❌ 同期エラー', '#ef5350');
      });
    }

    // 定期的にlocalStorageの変更を検出してアップロード（3秒ごと）
    setInterval(function(){
      try { upload(); } catch(e){}
    }, 3000);

    // ページ離脱時にもアップロード
    window.addEventListener('beforeunload', function(){
      try {
        var snap = getLocalSnapshot();
        if (snap !== lastSnapshot) {
          var payload = {};
          payload[FK] = {
            main: JSON.parse(localStorage.getItem(FK) || '{}'),
            refcheck: JSON.parse(localStorage.getItem(FK + '_refcheck') || '{}'),
            highlight: JSON.parse(localStorage.getItem(FK + '_hl') || '{}'),
            _t: new Date().toISOString()
          };
          // sendBeaconが使えない場合の同期書き込み
          navigator.sendBeacon && navigator.sendBeacon('about:blank', '');
          ref.set(payload, { merge: true });
        }
      } catch(e){}
    });

    // ページロード時にFirestoreからダウンロード＆マージ
    showStatus('⬇ 読込中...', '#42a5f5');
    ref.get().then(function(doc){
      if (!doc.exists || !doc.data()[FK]) {
        showStatus('✅ ローカル使用', '#66bb6a');
        upload();
        return;
      }
      var r = doc.data()[FK];

      // mainデータのマージ
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

      // refcheckマージ
      if (r.refcheck) {
        var rc = JSON.parse(localStorage.getItem(FK+'_refcheck') || '{}');
        for (var k in r.refcheck) { if(!rc[k]) rc[k] = r.refcheck[k]; }
        localStorage.setItem(FK+'_refcheck', JSON.stringify(rc));
      }

      // highlightマージ
      if (r.highlight) {
        var hl = JSON.parse(localStorage.getItem(FK+'_hl') || '{}');
        for (var k in r.highlight) { if(!hl[k]) hl[k] = r.highlight[k]; }
        localStorage.setItem(FK+'_hl', JSON.stringify(hl));
      }

      // アプリ状態をリロード
      if (typeof loadStorage === 'function') loadStorage();
      if (typeof refCheckDB !== 'undefined') {
        refCheckDB = JSON.parse(localStorage.getItem(FK+'_refcheck') || '{}');
      }
      if (typeof updateCountBadge === 'function') updateCountBadge();

      lastSnapshot = getLocalSnapshot();
      showStatus('✅ 同期完了', '#66bb6a');
    }).catch(function(e){
      showStatus('❌ 読込エラー', '#ef5350');
    });

  } catch(ex) {
    // Firebase関連のエラーは完全に握りつぶす - アプリに影響させない
  }
})();
