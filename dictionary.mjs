import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import { Filter } from 'bad-words';
const filter = new Filter();
export const isClean = value => !filter.isProfane(value);
// Dictionary tokens are single alphabetic words; a Set avoids compiling
// hundreds of profanity regexes for every entry during server startup.
const blocked = new Set(filter.list.map(word=>word.toLowerCase()));
export const WORDS = new Set(readFileSync(wordListPath,'utf8').split(/\r?\n/)
  .filter(word => /^[a-z]{3,10}$/.test(word) && !blocked.has(word)).map(word => word.toUpperCase()));
export function cleanName(value) {
  const name = String(value ?? '').replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,' ').trim().slice(0,18);
  if (name.length < 2 || !isClean(name)) throw new Error('Choose a friendly name with 2–18 letters or numbers.');
  return name;
}
