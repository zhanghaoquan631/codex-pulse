(function (global) {
  'use strict';
  const keys = ['periodStart', 'periodEnd', 'periodTimeZone', 'periodPreset'];
  const presets = {daily: {days: 1, label: '日刊'}, 'three-days': {days: 3, label: '3 天'}, 'four-days': {days: 4, label: '4 天'}, weekly: {days: 7, label: '周刊'}, custom: {label: '自定义'}};
  const pad = value => String(value).padStart(2, '0');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const systemZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  function validZone(zone) { try { new Intl.DateTimeFormat('en', {timeZone: zone}).format(); return typeof zone === 'string' && !!zone; } catch { return false; } }
  function localDate(value = new Date()) { return `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }
  function localParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.000)?)?$/.exec(String(value));
    if (!match) throw Error('请填写完整日期与时间，精确到秒');
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const result = new Date(0);
    result.setUTCFullYear(year, month - 1, day);
    result.setUTCHours(hour, minute, second || 0, 0);
    if (year < 1 || result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day || result.getUTCHours() !== hour || result.getUTCMinutes() !== minute || result.getUTCSeconds() !== (second || 0)) throw Error('请选择有效日期与时间');
    return result;
  }
  function civilString(date) { return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`; }
  function toLocal(value, zone = systemZone()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || !validZone(zone)) throw Error('刊期时间或时区无效');
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(date);
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${p.year.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }
  function fromLocal(value, zone = systemZone(), preferred = '') {
    const civil = localParts(value), normalized = civilString(civil);
    if (!validZone(zone)) throw Error('刊期时区无效');
    // Preserve the saved instant when an autumn clock change repeats a wall time.
    if (preferred && toLocal(preferred, zone) === normalized) return new Date(preferred).toISOString();
    const offsets = new Set();
    for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
      const sample = new Date(civil.getTime() + hours * 3600000);
      offsets.add(localParts(toLocal(sample, zone)).getTime() - sample.getTime());
    }
    const matches = [...offsets].map(offset => new Date(civil.getTime() - offset)).filter(candidate => candidate.getUTCFullYear() >= 1 && candidate.getUTCFullYear() <= 9999 && toLocal(candidate, zone) === normalized).sort((a, b) => a - b);
    if (!matches.length) throw Error('这段当地时间不存在，请检查夏令时并选择其他时间');
    return matches[0].toISOString();
  }
  function endAfterDays(start, days) {
    if (!Number.isSafeInteger(days) || days < 1) throw Error('刊期长度请输入至少 1 天的整数；也可直接修改起止时间');
    const end = localParts(start);
    end.setUTCDate(end.getUTCDate() + days);
    end.setUTCSeconds(end.getUTCSeconds() - 1);
    if (end.getUTCFullYear() > 9999 || !Number.isFinite(end.getTime())) throw Error('刊期长度超出可用日期范围');
    return civilString(end);
  }
  function defaults(date, zone = systemZone()) {
    let start = `${date || localDate()}T00:00:00`;
    try { localParts(start); } catch { start = `${localDate()}T00:00:00`; }
    return {periodStart: fromLocal(start, zone), periodEnd: fromLocal(endAfterDays(start, 7), zone), periodTimeZone: zone, periodPreset: 'weekly'};
  }
  function fields(issue = {}) { return Object.fromEntries(keys.filter(key => Object.hasOwn(issue, key)).map(key => [key, issue[key]])); }
  function control(root) { return root?.matches?.('[data-period-controls]') ? root : root?.querySelector?.('[data-period-controls]'); }
  function read(root, options = {}) {
    const fieldset = control(root);
    if (!fieldset) throw Error('请先设置本期刊期');
    const start = fieldset.querySelector('[data-period-start]'), end = fieldset.querySelector('[data-period-end]'), days = fieldset.querySelector('[data-period-days]');
    let invalid = start;
    try {
      start.setCustomValidity(''); end.setCustomValidity('');
      if (days.validationMessage) { invalid = days; throw Error(days.validationMessage); }
      if (!start.value) throw Error('请选择刊期开始时间');
      const periodStart = fromLocal(start.value, fieldset.dataset.timeZone, fieldset.dataset.originalStart);
      invalid = end;
      if (!end.value) throw Error('请选择刊期结束时间');
      const periodEnd = fromLocal(end.value, fieldset.dataset.timeZone, fieldset.dataset.originalEnd);
      if (Date.parse(periodEnd) < Date.parse(periodStart)) throw Error('刊期结束时间不能早于开始时间');
      return {periodStart, periodEnd, periodTimeZone: fieldset.dataset.timeZone, periodPreset: fieldset.querySelector('[data-period-preset]').value};
    } catch (error) {
      invalid.setCustomValidity(error.message);
      if (options.allowInvalid) return {};
      throw error;
    }
  }
  function draft(root) {
    const fieldset = control(root);
    const normalized = input => { try { return civilString(localParts(input.value)); } catch { return input.value; } };
    return {start: normalized(fieldset.querySelector('[data-period-start]')), end: normalized(fieldset.querySelector('[data-period-end]')), days: fieldset.querySelector('[data-period-days]').value, preset: fieldset.querySelector('[data-period-preset]').value, timeZone: fieldset.dataset.timeZone};
  }
  function formatRange(issue = {}) {
    if (!issue.periodStart || !issue.periodEnd) return '';
    const zone = validZone(issue.periodTimeZone) ? issue.periodTimeZone : systemZone();
    try { return `${presets[issue.periodPreset]?.label || '自定义'} · ${toLocal(issue.periodStart, zone).replace('T', ' ')} — ${toLocal(issue.periodEnd, zone).replace('T', ' ')}（${zone}）`; } catch { return ''; }
  }
  function mount(host, options = {}) {
    if (!host) return null;
    const issue = options.issue || {}, savedDraft = issue.periodDraft;
    const zone = validZone(savedDraft?.timeZone || issue.periodTimeZone) ? savedDraft?.timeZone || issue.periodTimeZone : systemZone();
    let period = defaults(options.date || issue.date, zone);
    if (issue.periodStart && issue.periodEnd) {
      try { toLocal(issue.periodStart, zone); toLocal(issue.periodEnd, zone); period = {...period, ...fields(issue), periodTimeZone: zone}; } catch { /* Keep the original date usable for old records. */ }
    }
    const start = savedDraft?.start ?? toLocal(period.periodStart, zone), end = savedDraft?.end ?? toLocal(period.periodEnd, zone);
    const preset = Object.hasOwn(presets, savedDraft?.preset || period.periodPreset) ? savedDraft?.preset || period.periodPreset : 'custom';
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'period-controls'; fieldset.dataset.periodControls = options.key || 'issue';
    fieldset.dataset.timeZone = zone; fieldset.dataset.originalStart = period.periodStart; fieldset.dataset.originalEnd = period.periodEnd;
    const id = (options.key || 'issue').replace(/[^a-zA-Z0-9_-]/g, '');
    fieldset.innerHTML = `<legend>刊期范围</legend><div class="period-choice-row"><label class="field-label">刊期类型<select data-period-preset>${Object.entries(presets).map(([value, item]) => `<option value="${value}" ${value === preset ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label><label class="field-label">长度（天）<input data-period-days type="number" min="1" step="1" value="${escape(savedDraft?.days ?? presets[preset].days ?? '')}" placeholder="任意整数天数" inputmode="numeric"></label></div><div class="period-time-row"><label class="field-label">开始日期与时间<input data-period-start type="datetime-local" step="1" required value="${escape(start)}" aria-describedby="${id}-period-help"></label><label class="field-label">结束日期与时间<input data-period-end type="datetime-local" step="1" required value="${escape(end)}" aria-describedby="${id}-period-help"></label></div><p class="period-help" id="${id}-period-help">包含起止两个时刻，精确到秒。可选刊期长度，也可直接改时间。时区：${escape(zone)}。</p><p class="period-summary" data-period-summary aria-live="polite"></p>${options.issue && !issue.periodStart ? '<p class="period-legacy-note">本期原有日期已保留。下方默认周刊范围会在保存本期时记录。</p>' : ''}`;
    const existing = host.matches?.('[data-period-controls]') ? host : host.querySelector(`[data-period-controls="${fieldset.dataset.periodControls}"]`);
    if (existing) existing.replaceWith(fieldset); else host.append(fieldset);
    const presetInput = fieldset.querySelector('[data-period-preset]'), daysInput = fieldset.querySelector('[data-period-days]'), startInput = fieldset.querySelector('[data-period-start]'), endInput = fieldset.querySelector('[data-period-end]'), summary = fieldset.querySelector('[data-period-summary]');
    function refresh() {
      try { summary.textContent = formatRange(read(fieldset)); summary.classList.remove('is-error'); }
      catch (error) { summary.textContent = error.message; summary.classList.add('is-error'); }
    }
    function changed(event) {
      daysInput.setCustomValidity('');
      if (event.target === presetInput && presets[presetInput.value].days) {
        daysInput.value = presets[presetInput.value].days;
        try { endInput.value = endAfterDays(startInput.value, Number(daysInput.value)); } catch (error) { summary.textContent = error.message; summary.classList.add('is-error'); options.onChange?.(); return; }
      } else if (event.target === daysInput) {
        presetInput.value = 'custom';
        if (!daysInput.value) { refresh(); options.onChange?.(); return; }
        try { endInput.value = endAfterDays(startInput.value, Number(daysInput.value)); }
        catch (error) { daysInput.setCustomValidity(error.message); summary.textContent = error.message; summary.classList.add('is-error'); options.onChange?.(); return; }
      } else if (event.target === startInput || event.target === endInput) {
        presetInput.value = 'custom'; daysInput.value = '';
      }
      refresh(); options.onChange?.();
    }
    fieldset.addEventListener('input', changed);
    fieldset.addEventListener('change', event => { if (event.target === presetInput) changed(event); });
    refresh();
    return fieldset;
  }
  function setupComposer() {
    const date = document.getElementById('newsletterDate'), backdrop = document.getElementById('newsletterModalBackdrop');
    if (!date || !backdrop) return;
    const host = document.createElement('div'); host.className = 'newsletter-period-host';
    date.closest('.field-label').after(host);
    const reset = () => mount(host, {key: 'newsletter', date: date.value});
    const visibility = () => { const destination = document.getElementById('newsletterDestination'); host.hidden = !!destination && destination.value !== 'new'; };
    reset(); visibility();
    document.addEventListener('change', event => { if (event.target.id === 'newsletterDestination') visibility(); });
    let wasOpen = backdrop.classList.contains('is-open');
    new MutationObserver(() => {
      const open = backdrop.classList.contains('is-open');
      if (open && !wasOpen) reset();
      wasOpen = open; visibility();
    }).observe(backdrop, {attributes: true, attributeFilter: ['class']});
  }
  global.LinganPeriodControls = {mount, read, draft, fields, baseFields: fields, formatRange, defaults, fromLocal, toLocal};
  if (typeof document !== 'undefined') setupComposer();
})(globalThis);
