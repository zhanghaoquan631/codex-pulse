/* Literal text emphasis. Automatic categories are lexical rules, not a grammatical NLP analysis. */
(function (root) {
  'use strict';
  const CATEGORY = ['important', 'repeated', 'adjective', 'custom'];
  const FONTS = ['normal', 'bold', 'italic', 'underline', 'bold-italic'];
  const LABELS = {important: '重要名词 / 主题词', repeated: '重复词', adjective: '形容词 / 描述词', custom: '自定义'};
  const FONT_LABELS = {normal: '常规', bold: '加粗', italic: '斜体', underline: '下划线', 'bold-italic': '粗斜体'};
  const BASE = {important: {color: '#6d28d9', font: 'bold'}, repeated: {color: '#0369a1', font: 'underline'}, adjective: {color: '#b45309', font: 'italic'}, custom: {color: '#be185d', font: 'bold'}};
  const IMPORTANT = ['人工智能', '机器学习', '深度学习', '大模型', '语言模型', '知识库', '工作流', '内容创作', '产品设计', '用户体验', '长期主义', '第二大脑', '认知', '增长', '效率', '算法', '模型', '数据', '设计', '产品', '用户', '知识', '技能', '方法', '战略', '投资', '商业', '创新', 'AI', 'API', 'GPT', 'LLM', 'OpenAI', 'ChatGPT', 'Claude', 'Blender', 'Three.js'];
  const ADJECTIVES = ['重要', '清晰', '简单', '复杂', '高效', '低效', '优秀', '优质', '强大', '快速', '缓慢', '稳定', '安全', '可靠', '具体', '真实', '长期', '短期', '完美', '安静', '持续', '独特', '深刻', '精准', '灵活', '丰富', '完整', '有效', '必要', '关键', 'easy', 'simple', 'clear', 'complex', 'important', 'effective', 'efficient', 'powerful', 'fast', 'slow', 'stable', 'safe', 'reliable', 'useful', 'creative', 'excellent', 'unique'];
  const STOP = new Set(['我们', '他们', '你们', '自己', '一个', '一种', '一些', '这个', '那个', '这些', '那些', '什么', '为什么', '怎么', '时候', '这样', '那样', '今天', '昨天', '已经', '可以', '需要', '应该', '能够', '可能', '就是', '不是', '但是', '因为', '所以', '如果', '然后', '还是', '只有', '没有', '成为', '进行', '通过', '如何', 'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'have', 'has', 'are', 'was', 'were', 'can', 'will', 'not', 'you', 'your', 'our', 'its', 'they', 'them', 'then', 'than', 'but', 'also']);
  const manualCategory = new Set([...CATEGORY, 'none']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const color = (value, fallback) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const plainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const canonical = value => value.toLocaleLowerCase();
  const clone = value => JSON.parse(JSON.stringify(value));
  const boundedText = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  function normalize(value) {
    const input = plainObject(value), auto = plainObject(input.auto), styles = plainObject(input.styles);
    const result = {version: 1, enabled: input.enabled !== false, auto: {}, styles: {}, terms: []};
    for (const category of CATEGORY) {
      if (category !== 'custom') result.auto[category] = auto[category] !== false;
      const style = plainObject(styles[category]);
      result.styles[category] = {color: color(style.color, BASE[category].color), font: FONTS.includes(style.font) ? style.font : BASE[category].font};
    }
    // The last explicit override for a literal wins. Ignore unknown keys and never store HTML.
    const terms = new Map();
    for (const term of Array.isArray(input.terms) ? input.terms.slice(0, 64) : []) {
      const entry = plainObject(term), text = boundedText(entry.text, 80).trim();
      if (!text || !manualCategory.has(entry.category)) continue;
      const next = {text, category: entry.category};
      if (typeof entry.color === 'string' && /^#[a-f0-9]{6}$/i.test(entry.color)) next.color = entry.color.toLowerCase();
      if (FONTS.includes(entry.font)) next.font = entry.font;
      terms.set(canonical(text), next);
    }
    result.terms = [...terms.values()];
    return result;
  }
  let segmenter;
  function words(value) {
    const text = String(value ?? '').slice(0, 60000), found = [];
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      segmenter ||= new Intl.Segmenter('zh', {granularity: 'word'});
      for (const part of segmenter.segment(text)) if (part.isWordLike) found.push(part.segment);
    } else {
      // Fallback deliberately makes fewer guesses when word segmentation is unavailable.
      found.push(...(text.match(/[A-Za-z][A-Za-z0-9._+-]{1,39}/g) || []));
      for (const term of [...IMPORTANT, ...ADJECTIVES]) {
        const matches = literalRanges(text, term);
        for (let i = 0; i < matches.length; i++) found.push(term);
      }
    }
    return found.filter(word => Array.from(word).length >= 2 && word.length <= 40 && !STOP.has(canonical(word)) && !/^\d+$/.test(word));
  }
  function literalRanges(text, word) {
    const ranges = [], haystack = canonical(text), needle = canonical(word);
    let at = 0;
    // Case folding can change offsets for unusual Unicode. Literal matching in that case stays exact.
    const source = haystack.length === text.length && needle.length === word.length ? haystack : text;
    const search = source === haystack ? needle : word;
    const latin = /^[A-Za-z0-9_.+-]+$/.test(word), boundary = character => character && /[A-Za-z0-9_]/.test(character);
    while (at < source.length) {
      const start = source.indexOf(search, at);
      if (start < 0) break;
      const end = start + search.length;
      if (!latin || (!boundary(source[start - 1]) && !boundary(source[end]))) ranges.push({start, end});
      at = end;
    }
    return ranges;
  }
  function analyze(text, value, context = {}) {
    const config = normalize(value), source = String(text ?? ''), info = plainObject(context);
    if (!config.enabled || !source) return [];
    const surroundingText = boundedText(info.context, 60000);
    // Context can be another paragraph (for example a caption beside notes); never omit the text being rendered.
    const analysisText = surroundingText && !surroundingText.includes(source) ? (source + '\n' + surroundingText).slice(0, 60000) : surroundingText || source;
    const candidates = new Map(), adjectives = new Set(ADJECTIVES.map(canonical));
    const add = (term, category, manual = false, extra = {}) => {
      if (typeof term !== 'string' || term.length > 80 || !term.trim() || !literalRanges(source, term).length) return;
      const key = canonical(term), previous = candidates.get(key);
      const priority = {important: 3, repeated: 2, adjective: 4, custom: 5, none: 6};
      if (!previous || manual || (!previous.manual && priority[category] > priority[previous.category])) candidates.set(key, {text: term, category, manual, ...extra});
    };
    if (config.auto.important) {
      for (const term of IMPORTANT) add(term, 'important');
      for (const term of Array.isArray(info.tags) ? info.tags.slice(0, 30) : []) add(boundedText(term, 80), 'important');
      for (const term of words(boundedText(info.title, 300))) if (!adjectives.has(canonical(term))) add(term, 'important');
      for (const term of source.match(/\b(?:[A-Z]{2,12}|[A-Z][a-z]+(?:[A-Z][A-Za-z]*)+)\b/g) || []) add(term, 'important');
      for (const quoted of source.matchAll(/[“「《]([^”」》\n]{2,20})[”」》]/g)) add(quoted[1], 'important');
    }
    if (config.auto.repeated) {
      const counts = new Map();
      for (const term of words(analysisText)) { const key = canonical(term); counts.set(key, {text: term, count: (counts.get(key)?.count || 0) + 1}); }
      for (const entry of [...counts.values()].filter(entry => entry.count >= 2).sort((a, b) => b.count - a.count || b.text.length - a.text.length).slice(0, 160)) add(entry.text, 'repeated');
    }
    if (config.auto.adjective) for (const term of ADJECTIVES) add(term, 'adjective');
    const automatic = [...candidates.values()].slice(0, 160);
    candidates.clear();
    for (const term of automatic) candidates.set(canonical(term.text), term);
    for (const term of config.terms) add(term.text, term.category, true, {color: term.color, font: term.font});
    return [...candidates.values()];
  }
  function tokens(text, value, context = {}) {
    const source = String(text ?? ''), config = normalize(value), ranges = [];
    for (const term of analyze(source, config, context)) for (const range of literalRanges(source, term.text)) ranges.push({...range, ...term});
    // Reserve manual ranges first, including `none`, so automatic matching cannot cover a manual exclusion.
    ranges.sort((a, b) => Number(b.manual) - Number(a.manual) || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const accepted = [], occupied = new Uint8Array(source.length);
    for (const range of ranges) {
      let overlap = false;
      for (let index = range.start; index < range.end; index++) if (occupied[index]) {overlap = true; break;}
      if (!overlap) {occupied.fill(1, range.start, range.end); accepted.push(range);}
    }
    accepted.sort((a, b) => a.start - b.start);
    const output = []; let cursor = 0;
    for (const range of accepted) {
      if (range.start > cursor) output.push({text: source.slice(cursor, range.start)});
      if (range.category === 'none') output.push({text: source.slice(range.start, range.end)});
      else output.push({text: source.slice(range.start, range.end), category: range.category, ...config.styles[range.category], ...(range.color ? {color: range.color} : {}), ...(range.font ? {font: range.font} : {}), manual: range.manual});
      cursor = range.end;
    }
    if (cursor < source.length) output.push({text: source.slice(cursor)});
    return output;
  }
  function render(text, value, context = {}) {
    return tokens(text, value, context).map(token => token.category ? `<span class="text-emphasis text-emphasis-${token.category} text-font-${token.font}" style="color:${token.color}">${escape(token.text)}</span>` : escape(token.text)).join('');
  }
  const editors = new WeakMap(), fieldEditors = new WeakMap(), hydrated = new WeakMap();
  function mountEditor(container, options = {}) {
    if (typeof document === 'undefined' || !container?.append) return null;
    if (editors.has(container)) return editors.get(container);
    let value = normalize(options.value), paused = false;
    const panel = document.createElement('details'); panel.className = 'text-style-editor';
    const summary = document.createElement('summary'); summary.textContent = options.label || '调整正文强调'; panel.append(summary);
    const help = document.createElement('p'); help.className = 'text-style-help'; help.textContent = '自动强调依据主题词、重复次数和描述词词表等词法规则，可能有遗漏或误判。你可以调颜色和字形，或逐词添加、取消强调；原始文字保持完整。'; panel.append(help);
    const enabledLabel = document.createElement('label'); enabledLabel.className = 'text-style-toggle';
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabledLabel.append(enabled, document.createTextNode('启用正文强调')); panel.append(enabledLabel);
    const grid = document.createElement('div'); grid.className = 'text-style-grid'; panel.append(grid);
    const controls = {};
    for (const category of CATEGORY) {
      const row = document.createElement('div'); row.className = 'text-style-category';
      const name = document.createElement('label'); name.className = 'text-style-toggle';
      const auto = category === 'custom' ? null : document.createElement('input');
      if (auto) { auto.type = 'checkbox'; auto.setAttribute('aria-label', `自动强调${LABELS[category]}`); name.append(auto); }
      name.append(document.createTextNode(LABELS[category]));
      const swatch = document.createElement('input'); swatch.type = 'color'; swatch.setAttribute('aria-label', `${LABELS[category]}颜色`);
      const font = fontSelect(`${LABELS[category]}字形`); row.append(name, swatch, font); grid.append(row);
      controls[category] = {auto, swatch, font};
    }
    const custom = document.createElement('fieldset'); custom.className = 'text-style-custom';
    const legend = document.createElement('legend'); legend.textContent = '逐词覆写'; custom.append(legend);
    const termInput = document.createElement('input'); termInput.type = 'text'; termInput.maxLength = 80; termInput.placeholder = '输入要强调或忽略的词语'; termInput.setAttribute('aria-label', '覆写词语');
    const termCategory = document.createElement('select'); termCategory.setAttribute('aria-label', '词语强调类别');
    for (const category of [...CATEGORY, 'none']) {const option = document.createElement('option'); option.value = category; option.textContent = LABELS[category] || '取消强调'; termCategory.append(option);}
    const add = document.createElement('button'); add.type = 'button'; add.className = 'quiet-button small'; add.textContent = '添加 / 替换';
    const addRow = document.createElement('div'); addRow.className = 'text-style-add'; addRow.append(termInput, termCategory, add); custom.append(addRow);
    const termList = document.createElement('div'); termList.className = 'text-style-terms'; custom.append(termList); panel.append(custom);
    const status = document.createElement('p'); status.className = 'text-style-status'; status.setAttribute('role', 'status'); panel.append(status);
    const previewLabel = document.createElement('p'); previewLabel.className = 'text-style-preview-label'; previewLabel.textContent = '正文预览'; panel.append(previewLabel);
    const preview = document.createElement('div'); preview.className = 'text-style-preview'; panel.append(preview); container.append(panel);
    function notify() {
      if (paused) return;
      value = normalize(value); refresh(); options.onChange?.(clone(value));
      container.dispatchEvent(new CustomEvent('textstylechange', {bubbles: true, detail: clone(value)}));
    }
    function refresh() {
      const text = typeof options.getText === 'function' ? options.getText() : '';
      preview.innerHTML = text ? render(text, value, options.getContext?.() || {}) : '<span class="text-style-empty">输入正文后查看强调效果。</span>';
    }
    function paintTerms() {
      termList.replaceChildren();
      for (const [index, term] of value.terms.entries()) {
        const row = document.createElement('div'); row.className = 'text-style-term';
        const text = document.createElement('span'); text.className = 'text-style-term-word'; text.textContent = term.text; text.title = term.text;
        const category = document.createElement('select'); category.setAttribute('aria-label', `${term.text}强调类别`);
        for (const key of [...CATEGORY, 'none']) {const option = document.createElement('option'); option.value = key; option.textContent = LABELS[key] || '取消强调'; category.append(option);} category.value = term.category;
        const swatch = document.createElement('input'); swatch.type = 'color'; swatch.value = term.color || value.styles[term.category]?.color || BASE.custom.color; swatch.setAttribute('aria-label', `${term.text}颜色`);
        const font = fontSelect(`${term.text}字形`); font.value = term.font || value.styles[term.category]?.font || 'normal';
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'quiet-button small'; remove.textContent = '删除'; remove.setAttribute('aria-label', `删除${term.text}覆写`);
        category.onchange = () => {value.terms[index].category = category.value; paintTerms(); notify();};
        swatch.oninput = () => {value.terms[index].color = swatch.value; notify();};
        font.onchange = () => {value.terms[index].font = font.value; notify();};
        remove.onclick = () => {value.terms.splice(index, 1); paintTerms(); notify();};
        swatch.disabled = font.disabled = term.category === 'none';
        row.append(text, category, swatch, font, remove); termList.append(row);
      }
    }
    function paint() {
      paused = true; enabled.checked = value.enabled;
      for (const category of CATEGORY) {const control = controls[category]; if (control.auto) control.auto.checked = value.auto[category]; control.swatch.value = value.styles[category].color; control.font.value = value.styles[category].font;}
      paintTerms(); refresh(); paused = false;
    }
    enabled.onchange = () => {value.enabled = enabled.checked; notify();};
    for (const category of CATEGORY) {
      const control = controls[category];
      if (control.auto) control.auto.onchange = () => {value.auto[category] = control.auto.checked; notify();};
      control.swatch.oninput = () => {value.styles[category].color = control.swatch.value; notify();};
      control.font.onchange = () => {value.styles[category].font = control.font.value; notify();};
    }
    add.onclick = () => {
      const text = termInput.value.trim();
      if (!text) {status.textContent = '先输入一个词语。'; return;}
      const previous = value.terms.findIndex(term => canonical(term.text) === canonical(text));
      if (previous < 0 && value.terms.length >= 64) {status.textContent = '最多保存 64 个逐词覆写，请先删除不再使用的词语。'; return;}
      const term = {text, category: termCategory.value};
      if (previous >= 0) value.terms.splice(previous, 1, term); else value.terms.push(term);
      termInput.value = ''; status.textContent = ''; paintTerms(); notify();
    };
    termInput.addEventListener('keydown', event => {if (event.key === 'Enter') {event.preventDefault(); add.click();}});
    const editor = {getValue: () => clone(value), setValue(next) {value = normalize(next); paint();}, refresh, element: panel, destroy() {panel.remove(); editors.delete(container);}};
    editors.set(container, editor); paint(); return editor;
  }
  function fontSelect(label) {
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    for (const font of FONTS) {const option = document.createElement('option'); option.value = font; option.textContent = FONT_LABELS[font]; select.append(option);} return select;
  }
  function readJSONAttribute(element, name, fallback) {
    try {const value = element.getAttribute(name); return value ? JSON.parse(value) : fallback;} catch {return fallback;}
  }
  function savedConfig(field) {
    if (!field?.getAttribute) return undefined;
    const attribute = readJSONAttribute(field, 'data-text-style-config', null);
    if (attribute) return attribute;
    try {
      if (field.id === 'composerBody' || field.id === 'composerCaption') return typeof contentItems !== 'undefined' && typeof editingId !== 'undefined' ? contentItems.find(item => item.id === editingId)?.textStyle : undefined;
      if (field.id === 'editWeeklyIntro') return typeof issueEditContext !== 'undefined' ? issueEditContext?.base.textStyle : undefined;
      const index = field.dataset.weeklyBody ?? field.dataset.weeklyCaption;
      if (index !== undefined) return typeof issueEditContext !== 'undefined' ? issueEditContext?.base.items[Number(index)]?.textStyle : undefined;
    } catch {}
    return undefined;
  }
  function fieldGroup(field) {
    if (!field?.ownerDocument) return null;
    const doc = field.ownerDocument;
    if (field.id === 'composerBody' || field.id === 'composerCaption') {
      const fields = ['composerCaption', 'composerBody'].map(id => doc.getElementById(id)).filter(Boolean), anchor = doc.getElementById('composerBody')?.closest('.field-label') || field.parentElement;
      return {fields, anchor, getContext: () => ({title: doc.getElementById('composerTitle')?.value || '', tags: (doc.getElementById('composerTags')?.value || '').split(/[\s,#，]+/).filter(Boolean)})};
    }
    const index = field.dataset.weeklyBody ?? field.dataset.weeklyCaption;
    if (index !== undefined && /^\d+$/.test(index)) {
      const scope = field.closest('details') || field.parentElement, fields = [...scope.querySelectorAll('[data-weekly-caption],[data-weekly-body]')].filter(input => (input.dataset.weeklyCaption ?? input.dataset.weeklyBody) === index);
      return {fields, anchor: (fields.at(-1) || field).closest('.field-label') || field.parentElement, getContext: () => ({title: scope.querySelector('[data-weekly-title]')?.value || ''})};
    }
    return {fields: [field], anchor: field.closest('.field-label') || field.parentElement, getContext: () => ({})};
  }
  function ensureField(field) {
    if (typeof document === 'undefined' || !field) return null;
    if (fieldEditors.has(field)) return fieldEditors.get(field);
    const group = fieldGroup(field); if (!group?.anchor) return null;
    const reused = group.fields.map(input => fieldEditors.get(input)).find(Boolean);
    if (reused) {group.fields.forEach(input => fieldEditors.set(input, reused)); return reused;}
    const holder = document.createElement('div'); holder.className = 'text-style-field-editor'; group.anchor.after(holder);
    const editor = mountEditor(holder, {value: savedConfig(field), getText: () => group.fields.map(input => input.value || '').filter((value,index,values) => value && values.indexOf(value) === index).join('\n\n'), getContext: group.getContext, onChange() {
      // Draft listeners already react to input. Only notify; never alter the textarea contents.
      group.fields[0]?.dispatchEvent(new Event('input', {bubbles: true}));
    }});
    group.fields.forEach(input => {fieldEditors.set(input, editor); input.addEventListener('input', editor.refresh);});
    return editor;
  }
  function readForField(field) {return ensureField(field)?.getValue() || normalize(savedConfig(field));}
  function setForField(field, value) {const editor = ensureField(field); editor?.setValue(value); return editor;}
  function editorFor(container) {return editors.get(container) || fieldEditors.get(container) || null;}
  function hydrate(scope) {
    if (typeof document === 'undefined') return;
    scope ||= document;
    const targets = [...scope.querySelectorAll('[data-text-styling]')];
    if (scope.matches?.('[data-text-styling]')) targets.unshift(scope);
    for (const target of targets) {
      const record = hydrated.get(target), sourceText = record && target.innerHTML === record.html ? record.sourceText : target.textContent;
      const config = readJSONAttribute(target, 'data-text-style', undefined), context = readJSONAttribute(target, 'data-text-context', {});
      const html = render(sourceText, config, context); if (target.innerHTML !== html) target.innerHTML = html;
      hydrated.set(target, {sourceText, html});
    }
  }
  function mountFields(scope) {
    if (typeof document === 'undefined') return;
    const selector = '#composerBody,#composerCaption,#newsletterIntro,#editWeeklyIntro,[data-weekly-body],[data-weekly-caption]';
    const fields = [...scope.querySelectorAll(selector)]; if (scope.matches?.(selector)) fields.unshift(scope);
    fields.forEach(ensureField);
  }
  const api = {normalize, analyze, tokens, render, mountEditor, readForField, setForField, editorFor, hydrate, mountFields};
  root.TextStyling = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const start = () => {
      hydrate(document); mountFields(document);
      if (typeof MutationObserver !== 'undefined') new MutationObserver(changes => {
        for (const change of changes) {
          if (change.type === 'attributes' && change.target.matches?.('[data-text-styling]')) hydrate(change.target);
          for (const node of change.addedNodes || []) if (node.nodeType === 1) {hydrate(node); mountFields(node);}
        }
      }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-text-style', 'data-text-context']});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
