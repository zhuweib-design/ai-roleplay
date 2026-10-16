/**
 * theme-switch.js —— 组件展示页的主题切换
 *
 * 组件展示页同时引入 4 个 theme-*.css，它们的作用域是 [data-theme="x"]，
 * 因此切换根元素的 data-theme 属性即可实时切换整套设计 Token。
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-theme-switch]'));
  if (!items.length) return;

  function apply(id) {
    root.setAttribute('data-theme', id);
    items.forEach(function (el) {
      var on = el.getAttribute('data-theme-switch') === id;
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem('dsh-theme', id); } catch (e) { /* 隐私模式忽略 */ }
  }

  items.forEach(function (el) {
    el.addEventListener('click', function () {
      apply(el.getAttribute('data-theme-switch'));
    });
  });

  var saved = null;
  try { saved = localStorage.getItem('dsh-theme'); } catch (e) { /* 忽略 */ }
  apply(saved || root.getAttribute('data-theme') || 'a');
})();
