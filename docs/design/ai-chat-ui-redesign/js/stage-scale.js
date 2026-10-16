/**
 * stage-scale.js —— 基准画布等比缩放（可选模式）
 *
 * 默认不启用：页面走 css/responsive.css 的真实断点重排。
 * 只有在 URL 上显式追加 ?fit=scale 时，才把 1920x1080 的基准画布
 * 整体等比缩小，用于「一眼看全构图」的评审与截图场景。
 *
 * 基准尺寸从 CSS Token 读取（--size-app-w / --size-app-h），不在 JS 里写死。
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  if (params.get('fit') !== 'scale') return;

  var stage = document.querySelector('.stage');
  if (!stage) return;

  var shell = stage.parentElement;
  var root = document.documentElement;

  function readToken(name, fallback) {
    var value = parseFloat(getComputedStyle(root).getPropertyValue(name));
    return isNaN(value) ? fallback : value;
  }

  var baseW = readToken('--size-app-w', 1920);
  var baseH = readToken('--size-app-h', 1080);

  function fit() {
    var vw = root.clientWidth;
    var vh = root.clientHeight;
    var scale = Math.min(vw / baseW, vh / baseH, 1);

    if (scale < 1) {
      stage.classList.add('stage--scaled');
      stage.style.setProperty('--stage-scale', String(scale));
      shell.style.height = (baseH * scale) + 'px';
    } else {
      stage.classList.remove('stage--scaled');
      stage.style.removeProperty('--stage-scale');
      shell.style.height = '';
    }
  }

  fit();
  window.addEventListener('resize', fit);
})();
