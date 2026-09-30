import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const runtimePython = join(sourceDirectory, '..', 'runtime', 'ocr-venv', 'Scripts', 'python.exe');
const runner = join(sourceDirectory, 'rapidocr-runner.py');

function clean(value) { return String(value || '').replace(/\r/gu, '\n').replace(/[ \t]+/gu, ' ').trim(); }

function reliableMerchant(value) {
  const candidate = clean(value).replace(/[。…]+$/u, '').trim();
  if (!candidate || candidate.includes('\uFFFD')) return '';
  return candidate;
}

// The mobile capture page is part of the OCR input when a user screenshots
// the page itself.  These labels are form chrome, not merchants.  Keeping
// them out of the candidate set prevents values such as “金额” or “支出”
// from being written into a real transaction when the OCR line order shifts.
const merchantNoisePattern = /^(?:金额(?:\s*[（(].*)?|交易类型|支出|收入|商家\s*[／/]\s*对方(?:\s*[（(].*)?|例如\s*[：:].*|账单实际时间.*|发生时间.*|补充备注.*|商品\s*[／/]\s*收据明细.*|发送\s*\d*\s*笔.*|检测到\s*\d*\s*笔.*|ME\.zip.*|全部账单|查找交易|收支统计|本月|上月|近3个月|今年|自定义)$/iu;

function isMerchantNoise(value) {
  const candidate = clean(value).replace(/[。…]+$/u, '').trim();
  return !candidate || merchantNoisePattern.test(candidate);
}

function transferMerchantFromText(value) {
  const source = clean(value);
  // Payment apps commonly render a transfer as “转账-转给某人”, but OCR may
  // lose the separator or the first “转账” glyph.  Treat the recipient after
  // “转给” as the primary candidate and stop at the description/amount that
  // usually follows it.  We still reject corrupted text in reliableMerchant
  // instead of guessing a person's name.
  const transfer = /(?:转[账帐]\s*[-—－·•]?\s*)?转\s*给\s*([^（(\n，,。；;：:\-—－+]{1,80})/iu.exec(source);
  if (!transfer) return '';
  return reliableMerchant(transfer[1].replace(/\s*(?:打语音|让(?:我|你)|收款说明|备注|金额|订单号|交易单号).*$/u, ''));
}

function scoreOcrVariant(variant) {
  const text = clean(variant?.text);
  if (!text) return Number.NEGATIVE_INFINITY;
  const receiptMarkers = ['收款', '收据', '合计', '总计', '金额', '客户', '名称', '数量', '单价', '人民币', '日期'];
  const markerCount = receiptMarkers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0);
  const chineseCount = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  const numericCount = (text.match(/\d/g) || []).length;
  const confidence = Math.max(0, Math.min(100, Number(variant?.confidence) || 0));
  return confidence * 0.18 + markerCount * 12 + Math.min(chineseCount, 80) * 0.18 + Math.min(numericCount, 40) * 0.12;
}

function selectedOcrVariant(payload) {
  const variants = Array.isArray(payload?.variants) ? payload.variants : [{ text: payload?.text, confidence: payload?.confidence, rotationDegrees: 0 }];
  const candidates = variants.filter((variant) => typeof variant?.text === 'string');
  if (!candidates.length) throw new Error('LOCAL_OCR_INVALID_RESULT');
  return candidates.map((variant) => ({ ...variant, score: scoreOcrVariant(variant) })).sort((left, right) => right.score - left.score)[0];
}

function parseOccurredAt(value) {
  const source = clean(value);
  const fullDateMatch = /(20\d{2})\s*[年\-/\.]\s*(\d{1,2})\s*[月\-/\.]\s*(\d{1,2})\s*日?\s*(\d{1,2})?\s*[:：时]?\s*(\d{1,2})?/u.exec(source);
  const shortDateMatch = /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/u.exec(source);
  const looseDateMatch = /(\d{1,2})\D{0,5}(\d{1,2})\D{0,5}(\d{1,2})\s*[:：]\s*(\d{1,2})/u.exec(source);
  const asDateTime = (year, month, day, hour = '00', minute = '00') => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31 || numericHour > 23 || numericMinute > 59) return '';
    const candidate = new Date(numericYear, numericMonth - 1, numericDay, numericHour, numericMinute);
    if (candidate.getFullYear() !== numericYear || candidate.getMonth() !== numericMonth - 1 || candidate.getDate() !== numericDay) return '';
    return `${String(numericYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}T${String(numericHour).padStart(2, '0')}:${String(numericMinute).padStart(2, '0')}`;
  };
  if (fullDateMatch) return asDateTime(fullDateMatch[1], fullDateMatch[2], fullDateMatch[3], fullDateMatch[4], fullDateMatch[5]);
  if (shortDateMatch) return asDateTime(String(new Date().getFullYear()), shortDateMatch[1], shortDateMatch[2], shortDateMatch[3], shortDateMatch[4]);
  if (looseDateMatch) return asDateTime(String(new Date().getFullYear()), looseDateMatch[1], looseDateMatch[2], looseDateMatch[3], looseDateMatch[4]);
  return '';
}

function merchantFromLine(value) {
  const source = clean(value);
  if (!source || parseOccurredAt(source) || /[+-]\s*\d{1,7}(?:\.\d{1,2})?/u.test(source)) return '';
  const transferMerchant = transferMerchantFromText(source);
  if (transferMerchant) return transferMerchant;
  const candidate = source.replace(/\s*[（(].*$/u, '');
  if (/^(?:账单|全部账单|查找交易|收支统计|收入|支出|\d{4}\s*年)/u.test(candidate) || isMerchantNoise(candidate)) return '';
  return reliableMerchant(candidate);
}

function receiptTotal(lines) {
  for (const line of [...lines].reverse()) {
    if (!/(?:合\s*计|总\s*计|实收(?:金额)?|收款金额|应收(?:金额)?)/u.test(line)) continue;
    const marked = [...line.matchAll(/[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)/gu)].map((match) => match[1]);
    const numbers = [...line.matchAll(/(?<!\d)(\d{1,7}(?:\.\d{1,2})?)(?!\d)/gu)].map((match) => match[1]);
    const candidate = marked.at(-1) || numbers.at(-1) || '';
    if (/^\d{1,7}(?:\.\d{1,2})?$/u.test(candidate)) return candidate;
  }
  return '';
}

function reliableLabeledMerchant(value) {
  const candidate = reliableMerchant(value);
  if (!candidate || isMerchantNoise(candidate) || /^(?:金额|单位|数量|单价|备注|货号|名称|规格|合计|总计|人民币|收款收据)/u.test(candidate)) return '';
  return candidate;
}

export function extractReceiptTransactions(text) {
  const lines = clean(text).split(/\n+/u).map(clean).filter(Boolean);
  const transactions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const signedAmount = /([+-])\s*(\d{1,7}(?:\.\d{1,2})?)/u.exec(lines[index]);
    if (!signedAmount) continue;
    // OCR can place a date, merchant and amount in either order.  Search a
    // small neighbourhood and prefer an explicit transfer label before
    // considering free-form lines, while still rejecting the page's form UI.
    const nearby = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 3));
    const merchant = nearby.map(transferMerchantFromText).find(Boolean)
      || nearby.map(merchantFromLine).find(Boolean)
      || '';
    const occurredAt = [lines[index - 1], lines[index + 1], lines[index - 2], lines[index + 2]].filter(Boolean).map(parseOccurredAt).find(Boolean) || '';
    transactions.push({ amount: signedAmount[2], merchant, occurredAt, type: signedAmount[1] === '-' ? 'EXPENSE' : 'INCOME' });
  }
  return transactions.slice(0, 30);
}

export function extractReceiptFields(text, confidence = 0) {
  const source = clean(text);
  const lines = source.split(/\n+/u).map(clean).filter(Boolean);
  const transactions = extractReceiptTransactions(source);
  const firstTransaction = transactions[0];
  const receiptAmount = receiptTotal(lines);
  const moneyMatches = [...source.matchAll(/(?:实付(?:金额)?|付款金额|支付金额|交易金额|订单金额|合计|总计|金额|[¥￥])\s*[：:]?\s*[¥￥]?\s*(\d{1,7}(?:\.\d{1,2})?)/giu)].map((match) => match[1]);
  const standaloneAmounts = [...source.matchAll(/[¥￥]\s*(\d{1,7}(?:\.\d{1,2})?)/gu)].map((match) => match[1]);
  const signedAmounts = [...source.matchAll(/([+-])\s*(\d{1,7}(?:\.\d{1,2})?)/gu)];
  const signedAmount = signedAmounts[0];
  const fallbackAmount = firstTransaction?.amount ?? moneyMatches[0] ?? (standaloneAmounts.length === 1 ? standaloneAmounts[0] : (signedAmount?.[2] || ''));
  const detectedAmount = receiptAmount || fallbackAmount;
  const merchantMatch = /(?:收款方|商家|商户|交易对方|付款给|客户)\s*[：:]?\s*([^\n]{2,48})/iu.exec(source);
  const transferMatch = /转[账帐]\s*[-—－·•]?\s*转\s*给\s*([^\n（(]{1,48})/iu.exec(source);
  const merchant = firstTransaction?.merchant || reliableLabeledMerchant(clean(merchantMatch?.[1] || transferMatch?.[1] || '').replace(/(?:金额|订单号|交易单号).*$/u, ''));
  const occurredAt = firstTransaction?.occurredAt || parseOccurredAt(source);
  const receiptIncome = /(?:收款收据|收款金额|实收(?:金额)?|收款方)/u.test(source);
  const type = firstTransaction?.type || (signedAmount?.[1] === '-' ? 'EXPENSE' : signedAmount?.[1] === '+' || receiptIncome ? 'INCOME' : '');
  // Printed receipt grids with handwriting are especially error-prone: a single
  // missing digit in the total changes the accounting result. Keep an editable
  // suggestion, but never pre-fill a guessed grid total into a new record.
  const handwrittenGridReceipt = /收款收据/u.test(source) && /十万\s*千\s*百\s*十\s*元\s*角\s*分/u.test(source);
  const requiresManualAmountReview = handwrittenGridReceipt && Boolean(detectedAmount);
  const requiresManualDateReview = handwrittenGridReceipt && !occurredAt && /20\d{2}\s*年/u.test(source);
  const amount = requiresManualAmountReview ? '' : detectedAmount;
  const manualReviewReasons = [
    requiresManualAmountReview ? '金额' : '',
    requiresManualDateReview ? '日期' : ''
  ].filter(Boolean);
  return {
    amount,
    merchant,
    occurredAt,
    type,
    transactions,
    transactionsDetected: transactions.length || signedAmounts.length,
    confidence: Math.round(Number(confidence) || 0),
    textDetected: Boolean(source),
    fieldsDetected: [amount, merchant, occurredAt].filter(Boolean).length,
    requiresManualAmountReview,
    requiresManualDateReview,
    manualReviewReasons
  };
}

async function recognizeWithRapidOcr(bytes, extension) {
  if (!existsSync(runtimePython) || !existsSync(runner)) throw new Error('LOCAL_OCR_RUNTIME_MISSING');
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mezip-receipt-ocr-'));
  const imagePath = join(temporaryDirectory, `receipt.${extension || 'jpg'}`);
  try {
    writeFileSync(imagePath, bytes, { mode: 0o600 });
    const { stdout } = await execFileAsync(runtimePython, [runner, imagePath], { windowsHide: true, timeout: 60_000, maxBuffer: 512 * 1024 });
    return selectedOcrVariant(JSON.parse(stdout));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function recognizeLocalReceipt(bytes, { extension }) {
  let result;
  try {
    result = await recognizeWithRapidOcr(bytes, extension);
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCAL_OCR_RUNTIME_MISSING') {
      return { status: 'LOCAL_OCR_UNAVAILABLE', suggestions: extractReceiptFields('', 0), message: '本机 OCR 组件尚未准备好。可先手动填写后发送。' };
    }
    return { status: 'OCR_FAILED', suggestions: extractReceiptFields('', 0), message: '这张图片暂时无法识别。可手动填写后发送。' };
  }
  const suggestions = extractReceiptFields(result.text, result.confidence);
  const pluralNotice = suggestions.transactionsDetected > 1 ? `检测到 ${suggestions.transactionsDetected} 笔交易，已预填第一笔；发送后会生成 ${suggestions.transactionsDetected} 条待确认记录，请逐笔核对再入账。` : '';
  const manualReviewNotice = suggestions.manualReviewReasons?.length ? `已自动校正收据方向；这是一张横向手写收据，${suggestions.manualReviewReasons.join('、')}无法可靠确认，已留空供你核对填写，不会把猜测结果直接入账。` : '';
  return {
    status: suggestions.fieldsDetected ? 'OCR_SUGGESTIONS_READY' : 'OCR_NO_SAFE_SUGGESTIONS',
    suggestions,
    rotationDegrees: Number(result.rotationDegrees) || 0,
    message: manualReviewNotice || (suggestions.fieldsDetected ? (pluralNotice || '已生成可修改的识别建议，请核对后发送。') : '图片文字已读取，但没有足够可靠的字段；请手动填写。')
  };
}
