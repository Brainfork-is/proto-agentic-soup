"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gini = gini;
exports.topKShare = topKShare;
function gini(v) {
    const n = v.length;
    if (!n)
        return 0;
    const s = [...v].sort((a, b) => a - b);
    const cum = s.reduce((a, x, i) => a + x * (i + 1), 0);
    const sum = s.reduce((a, b) => a + b, 0);
    if (!sum)
        return 0;
    return (2 * cum) / (n * sum) - (n + 1) / n;
}
function topKShare(v, k) {
    const s = [...v].sort((a, b) => b - a);
    const sum = v.reduce((a, b) => a + b, 0) || 1;
    return s.slice(0, k).reduce((a, b) => a + b, 0) / sum;
}
