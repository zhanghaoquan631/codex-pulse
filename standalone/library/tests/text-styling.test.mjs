import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../public/text-styling.js', import.meta.url), 'utf8');
const localPath = new URL('../../text-styling.js', import.meta.url);
const localSource = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : null;
function load(extra = {}) {
  const context = vm.createContext({Intl, ...extra});
  vm.runInContext(source, context);
  return context.TextStyling;
}
const api = load();
const plain = value => JSON.parse(JSON.stringify(value));
const noneAuto = {auto: {important: false, repeated: false, adjective: false}};

test('local and cloud modules are identical, and import works without a document or window', async () => {
  if (localSource !== null) assert.equal(source, localSource);
  await import('../public/text-styling.js');
  assert.equal(typeof globalThis.TextStyling.render, 'function');
  assert.equal(api.render('AI', {enabled: false}), 'AI');
});

test('normalization emits bounded plain JSON and rejects CSS/HTML injection', () => {
  const original = {enabled: false, auto: {adjective: false}, styles: {important: {color: 'red; background:url(javascript:alert(1))', font: '" onclick="alert(1)'}}, terms: [{text: 'AI', category: 'none'}, {text: '<img src=x onerror=alert(1)>', category: 'custom', color: '#123ABC', font: 'italic'}, {text: 'bad', category: 'unknown'}], html: '<script>alert(1)</script>'};
  const before = JSON.stringify(original), config = plain(api.normalize(original));
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(config.auto, {important: true, repeated: true, adjective: false});
  assert.equal(config.styles.important.color, '#6d28d9');
  assert.equal(config.styles.important.font, 'bold');
  assert.equal(config.terms.length, 2);
  assert.equal(config.terms[1].color, '#123abc');
  assert.equal(config.html, undefined);
  const huge = api.normalize({terms: Array.from({length: 100}, (_, i) => ({text: String(i) + 'x'.repeat(100), category: 'custom'}))});
  assert.equal(huge.terms.length, 64);
  assert.ok(huge.terms.every(term => term.text.length <= 80));
});

test('automatic lexical emphasis finds themes, repeated words, and descriptive words', () => {
  const text = 'AI 的工作流很清晰。练习让表达清晰。练习也帮助灵感。';
  const entries = plain(api.analyze(text, undefined, {title: 'AI 工作流'}));
  assert.ok(entries.some(term => term.text === 'AI' && term.category === 'important'));
  assert.ok(entries.some(term => term.text === '工作流' && term.category === 'important'));
  assert.ok(entries.some(term => term.text === '清晰' && term.category === 'adjective'));
  assert.ok(entries.some(term => term.text === '练习' && term.category === 'repeated'));
  assert.match(api.render(text), /text-emphasis-important/);
  assert.match(api.render(text), /text-emphasis-adjective/);
});

test('manual exclusions reserve inner ranges before overlapping automatic phrases', () => {
  const text = '人工智能模型与 AI，AI 最重要。';
  const config = {terms: [{text: '智能', category: 'none'}, {text: 'AI', category: 'custom', color: '#112233', font: 'bold-italic'}]};
  const html = api.render(text, config);
  assert.doesNotMatch(html, /<span[^>]*>人工智能<\/span>/);
  assert.ok(plain(api.tokens(text, config)).some(token => token.text === '智能' && !token.category));
  assert.match(html, /text-font-bold-italic" style="color:#112233">AI<\/span>/);
  assert.equal(plain(api.normalize({terms: [{text: 'AI', category: 'important'}, {text: 'ai', category: 'none'}]})).terms[0].category, 'none');
});

test('user literal overrides handle regex punctuation and Latin word boundaries', () => {
  const text = 'a+b aXb AI AID paid. Three.js';
  const html = api.render(text, {...noneAuto, terms: [{text: 'a+b', category: 'custom'}, {text: 'AI', category: 'custom'}, {text: 'Three.js', category: 'important'}]});
  assert.match(html, />a\+b<\/span>/);
  assert.doesNotMatch(html, />aXb<\/span>/);
  assert.match(html, />AI<\/span> AID paid/);
  assert.match(html, />Three\.js<\/span>/);
});

test('render escapes HTML while tokens preserve original source text including Unicode and newlines', () => {
  const text = '🧭 AI & <img src=x onerror="boom">\n\n清晰\t引号\'「😀」 İ 𝌆';
  const config = {terms: [{text: '<img src=x onerror="boom">', category: 'custom'}]};
  const before = JSON.stringify(config), rendered = api.render(text, config);
  assert.equal(plain(api.tokens(text, config)).map(token => token.text).join(''), text);
  assert.equal(JSON.stringify(config), before);
  assert.doesNotMatch(rendered, /<img/);
  assert.match(rendered, /&lt;img src=x onerror=&quot;boom&quot;&gt;/);
  assert.equal(api.render(text, {enabled: false}), '🧭 AI &amp; &lt;img src=x onerror=&quot;boom&quot;&gt;\n\n清晰\t引号&#39;「😀」 İ 𝌆');
});

test('explicit category opt-outs leave manual custom styles intact through JSON round trips', () => {
  const config = plain(api.normalize({...noneAuto, terms: [{text: '知识库', category: 'custom', color: '#246810', font: 'underline'}]}));
  const html = api.render('AI 清晰 知识库', JSON.parse(JSON.stringify(config)));
  assert.match(html, /^AI 清晰 <span/);
  assert.match(html, /color:#246810/);
  assert.match(html, /text-font-underline/);
});

test('automatic repetition can use a shared body context and has a conservative segmentation fallback', () => {
  const context = 'practice today. practice tomorrow. AI AI.';
  assert.ok(plain(api.analyze('practice today', undefined, {context})).some(term => term.text === 'practice' && term.category === 'repeated'));
  assert.ok(plain(api.analyze('practice practice', undefined, {context: 'An unrelated caption.'})).some(term => term.text === 'practice' && term.category === 'repeated'));
  const fallback = load({Intl: {}});
  assert.equal(plain(fallback.tokens('AI 清晰 AI', {})).map(token => token.text).join(''), 'AI 清晰 AI');
  assert.match(fallback.render('practice practice'), /text-emphasis-repeated/);
});

test('large repeated texts preserve source and finish with bounded candidate vocabulary', () => {
  const text = 'AI 清晰 practice practice。'.repeat(1600);
  const started = performance.now();
  assert.equal(plain(api.tokens(text, {})).map(token => token.text).join(''), text);
  assert.ok(performance.now() - started < 8000);
});
