// Import only qrcode's matrix encoder; no canvas, filesystem, PNG encoder, or CDN.
import QRCode from 'qrcode/lib/core/qrcode.js';

export function qrDataUrl(value) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const margin = 4;
  const size = modules.size + margin * 2;
  let path = '';
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#050505" d="${path}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
