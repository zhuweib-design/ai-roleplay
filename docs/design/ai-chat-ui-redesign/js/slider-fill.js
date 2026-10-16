/**
 * slider-fill.js —— 滑块填充比例与数值联动
 *
 * 滑块的轨道需要「左侧已填充 / 右侧未填充」两段配色。
 * 填充分界点由运行时 Token --slider-fill（0% - 100%）提供，
 * 本脚本根据 input 的 min / max / value 实时计算并写入，
 * 拖动时同步更新，同时把数值同步到同组的 .slider__value。
 */
(function () {
  'use strict';

  var inputs = document.querySelectorAll('.slider__input');
  if (!inputs.length) return;

  function update(el) {
    var min = parseFloat(el.min);
    var max = parseFloat(el.max);
    var val = parseFloat(el.value);
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 100;
    if (isNaN(val)) val = min;

    var ratio = max === min ? 0 : (val - min) / (max - min);
    el.style.setProperty('--slider-fill', (ratio * 100) + '%');

    var group = el.closest('.slider');
    if (group) {
      var out = group.querySelector('.slider__value');
      if (out) out.textContent = String(val);
    }
  }

  Array.prototype.forEach.call(inputs, function (el) {
    update(el);
    el.addEventListener('input', function () { update(el); });
    el.addEventListener('change', function () { update(el); });
  });
})();
