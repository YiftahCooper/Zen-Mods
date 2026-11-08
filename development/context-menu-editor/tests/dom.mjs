import {createRequire} from 'node:module';
const require = createRequire(new URL('../.backup-scratch/deps/package.json', import.meta.url));
export const {JSDOM} = require('jsdom');
export function makeDOM(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, {url:'https://example.invalid/settings', pretendToBeVisual:true});
  dom.window.document.createXULElement = name => dom.window.document.createElement(name);
  return dom;
}
