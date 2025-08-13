"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserRun = browserRun;
const node_fetch_1 = __importDefault(require("node-fetch"));
const BROWSER_URL = process.env.BROWSER_GATEWAY_URL || 'http://localhost:3100';
async function browserRun(input) {
    const r = await (0, node_fetch_1.default)(`${BROWSER_URL}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok)
        throw new Error(`browser ${r.status}`);
    return r.json();
}
