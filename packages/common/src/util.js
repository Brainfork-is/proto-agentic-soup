"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rnd = exports.nowIso = exports.delay = void 0;
const delay = (ms) => new Promise(r => setTimeout(r, ms));
exports.delay = delay;
const nowIso = () => new Date().toISOString();
exports.nowIso = nowIso;
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
exports.rnd = rnd;
