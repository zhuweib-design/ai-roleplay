/**
 * panel-toggle.js —— 面板与视图切换
 *
 * 窄屏下上下文侧栏转为抽屉、角色列表转为全屏页，
 * 由 .app 上的 data-context / data-view 属性驱动 CSS。
 * 本脚本只负责属性切换，不含任何样式逻辑。
 */
(function () {
  'use strict';

  var app = document.querySelector('.app');
  if (!app) return;

  function setContext(open) {
    app.setAttribute('data-context', open ? 'open' : 'closed');
  }

  function setView(view) {
    app.setAttribute('data-view', view);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-context]'), function (btn) {
    btn.addEventListener('click', function () {
      setContext(app.getAttribute('data-context') !== 'open');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-close-context]'), function (el) {
    el.addEventListener('click', function () { setContext(false); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-view]'), function (btn) {
    btn.addEventListener('click', function () {
      var next = app.getAttribute('data-view') === 'list' ? 'main' : 'list';
      setView(next);
    });
  });

  // 单栏断点下，选中角色后自动回到会话视图
  Array.prototype.forEach.call(document.querySelectorAll('.entity-item'), function (item) {
    item.addEventListener('click', function () { setView('main'); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') setContext(false);
  });

  // 初始状态：宽屏下上下文常驻，窄屏下默认收起
  function sync() {
    var narrow = window.matchMedia('(max-width: 1279px)').matches;
    if (!narrow) {
      app.setAttribute('data-context', 'open');
    } else if (app.getAttribute('data-context') !== 'open') {
      app.setAttribute('data-context', 'closed');
    }
    if (!window.matchMedia('(max-width: 767px)').matches) {
      setView('main');
    }
  }

  sync();
  window.addEventListener('resize', sync);
})();
