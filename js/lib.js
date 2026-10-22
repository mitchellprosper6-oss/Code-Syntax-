// Lazy-loads CDN libraries the first time they are needed (keeps first load fast on a phone).

export const CDN = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
};

const loading = {};
export function loadScript(url) {
  if (!loading[url]) {
    loading[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        delete loading[url];
        reject(new Error(`Could not load ${url.split('/').pop()} (are you offline?)`));
      };
      document.head.appendChild(s);
    });
  }
  return loading[url];
}
