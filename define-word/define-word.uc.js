// Define Word 0.3.0 â€” generated from src/entry.js; run node build.mjs.
// Local candidate; native Zen verification required.
(() => {
  // project:src/providers/http.mjs
  function failure(code) {
    return Object.assign(new Error(code), { code });
  }
  async function request(url, { fetch, signal, lexicalaKey }, format) {
    try {
      const target = new URL(url);
      const lexicala = target.hostname === "lexicala1.p.rapidapi.com";
      const headers = { Accept: format === "json" ? "application/json" : "text/html" };
      if (lexicala || lexicalaKey !== void 0) {
        if (!safeUrl(url, ["lexicala1.p.rapidapi.com"]) || target.port || target.pathname !== "/search" || target.hash) throw failure("unavailable");
        if (typeof lexicalaKey !== "string" || !lexicalaKey.trim()) throw failure("missing-key");
        if (lexicalaKey.length > 4096 || /[\x00-\x20\x7f]/.test(lexicalaKey)) throw failure("unavailable");
        headers["X-RapidAPI-Key"] = lexicalaKey;
        headers["X-RapidAPI-Host"] = "lexicala1.p.rapidapi.com";
      } else if (!safeUrl(url, ["api.dictionaryapi.dev", "en.wiktionary.org", "he.wiktionary.org", "www.dictionaryapi.com", "kalanit.hebrew-academy.org.il", "milog.co.il"]) || target.port) throw failure("unavailable");
      if (target.hostname === "kalanit.hebrew-academy.org.il" && (target.pathname !== "/api/Ac/" || format !== "json")) throw failure("unavailable");
      if (format === "html" && target.hostname !== "milog.co.il") throw failure("unavailable");
      const response = await fetch(url, { signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", headers });
      if (response.status === 404) return null;
      if (response.status === 401) throw failure("unauthorized");
      if (response.status === 403) throw failure("access-denied");
      if (response.status === 429) throw failure("rate-limit");
      if (!response.ok || Number(response.headers.get("content-length")) > 1048576) throw failure("unavailable");
      const reader = response.body.getReader(), chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1048576) throw failure("unavailable");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {
        });
        reader.releaseLock();
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const body = new TextDecoder().decode(buffer);
      return format === "json" ? JSON.parse(body) : body;
    } catch (error) {
      if (signal?.aborted) throw failure("cancelled");
      throw failure(["rate-limit", "unauthorized", "access-denied", "missing-key"].includes(error?.code) ? error.code : "unavailable");
    }
  }
  var requestJson = (url, options) => request(url, options, "json");
  var requestHtml = (url, options) => request(url, options, "html");
  function safeUrl(value, hosts2) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && hosts2.includes(u.hostname) ? u.href : null;
    } catch {
      return null;
    }
  }
  var text = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 4e3) : "";

  // project:src/providers/free-dictionary.mjs
  function parseFreeDictionary(data, query = "") {
    if (!Array.isArray(data)) return null;
    const senses = [];
    let sourceUrl, license;
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      sourceUrl ||= entry.sourceUrls?.map((u) => safeUrl(u, ["en.wiktionary.org", "dictionaryapi.dev"])).find(Boolean);
      license ||= entry.license;
      for (const meaning of entry.meanings || []) for (const item of meaning.definitions || []) if (text(item.definition)) senses.push({ partOfSpeech: text(meaning.partOfSpeech), text: text(item.definition), examples: item.example ? [text(item.example)] : [] });
    }
    if (!senses.length) return null;
    return { headword: text(data[0]?.word) || query, language: "en", senses: senses.slice(0, 20), sourceUrl: sourceUrl || "https://dictionaryapi.dev/", attribution: { label: "Free Dictionary API", url: "https://dictionaryapi.dev/", licenseLabel: text(license?.name), licenseUrl: safeUrl(license?.url, ["creativecommons.org"]) } };
  }
  var freeDictionary = { id: "free-en", label: "Free Dictionary API", language: "en", keyRequired: false, suggestionsLabel: null, async lookup(options) {
    return parseFreeDictionary(await requestJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(options.query)}`, options), options.query);
  } };

  // project:src/providers/wiktionary.mjs
  var parts = /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|article|numeral|proper noun|participle|phrase|proverb|contraction|prefix|suffix|symbol|letter)(?:\s+\d+)?$/i;
  function plain(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll("script,style,link,sup,table,dl,ul,ol,.mw-editsection").forEach((n) => n.remove());
    return text(copy.textContent);
  }
  function parse(document2, query, language) {
    const senses = [];
    let active = false, part = "";
    for (const node of document2.querySelectorAll("h2,h3,h4,h5,ol")) {
      if (node.closest("table,nav")) continue;
      const heading = plain(node);
      if (node.localName === "h2") {
        active = language === "en" ? heading === "English" : new RegExp("\\p{Script=Hebrew}", "u").test(heading) && !/^(ראו גם|הערות|קישורים)/u.test(heading);
        part = "";
        continue;
      }
      if (/^h[345]$/.test(node.localName)) {
        if (language === "he") active = false;
        else part = parts.test(heading) ? heading : "";
        continue;
      }
      if (!active || language === "en" && !part || node.parentElement.closest("ol,li,dl,ul")) continue;
      for (const item of node.children) {
        if (item.localName !== "li") continue;
        const definition = plain(item);
        if (!definition) continue;
        const exampleNodes = language === "en" ? [...item.querySelectorAll(".e-example,.e-quotation")] : [...item.querySelectorAll(":scope > dl > dd > ul > li")];
        const fallback = exampleNodes.length ? exampleNodes : [...item.querySelectorAll(":scope > dl > dd")].filter((n) => !n.querySelector(".nyms"));
        const examples = fallback.slice(0, 3).map(plain).filter(Boolean);
        senses.push({ partOfSpeech: part, text: definition, examples });
      }
    }
    if (!senses.length) return null;
    const sourceUrl = `https://${language}.wiktionary.org/wiki/${encodeURIComponent(query)}`;
    return { headword: query, language, senses: senses.slice(0, 20), sourceUrl, attribution: { label: language === "he" ? "ויקימילון" : "Wiktionary", url: sourceUrl, licenseLabel: "CC BY-SA 4.0 · adapted excerpt", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" } };
  }
  function wiktionary(language) {
    return { id: `wiktionary-${language}`, label: language === "he" ? "ויקימילון" : "Wiktionary", language, keyRequired: false, suggestionsLabel: "Search suggestions", async suggest(options) {
      const query = options.query.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, "");
      const params = new URLSearchParams({ action: "query", list: "prefixsearch|search", pssearch: query, psnamespace: "0", pslimit: "8", srsearch: query, srnamespace: "0", srlimit: "8", srprop: "", format: "json", formatversion: "2" });
      if (language === "he" && /^ה[\p{Script=Hebrew}]{2,}$/u.test(query)) params.set("titles", query.slice(1));
      const data = await requestJson(`https://${language}.wiktionary.org/w/api.php?${params}`, options);
      if (data?.error?.code === "ratelimited") throw failure("rate-limit");
      if (!data?.query || data.error) throw failure("unavailable");
      const matches = [...(data.query.pages || []).filter((p) => !p.missing && !p.invalid), ...data.query.prefixsearch || [], ...data.query.search || []];
      const words = [...new Set(matches.filter((p) => p.ns === 0).map((p) => text(p.title)).filter(Boolean))];
      return words.slice(0, 8).map((word) => ({ word, language }));
    }, async lookup(options) {
      const url = `https://${language}.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(options.query)}&prop=text&format=json&formatversion=2&redirects=1`;
      const data = await requestJson(url, options);
      if (!data || data.error?.code === "missingtitle") return null;
      if (data.error || typeof data.parse?.text !== "string") throw failure("unavailable");
      return parse(options.parseDocument(data.parse.text), data.parse.title || options.query, language);
    } };
  }

  // project:src/providers/merriam-webster.mjs
  function tokens(value) {
    return text(value).replace(/\{(?:d_link|a_link|i_link|sx)\|([^|}]+)[^}]*\}/g, "$1").replace(/\{bc\}/g, ": ").replace(/\{[^}]*\}/g, "").trim();
  }
  function parseMerriamWebster(data, query, providerId) {
    if (!Array.isArray(data)) return null;
    const senses = [];
    for (const entry of data) {
      let walk = function(value) {
        if (!Array.isArray(value)) return;
        if (value[0] === "sense" && value[1]?.dt) {
          const dt = value[1].dt;
          const definition = dt.filter((x) => x[0] === "text").map((x) => tokens(x[1])).join(" ");
          const examples = dt.filter((x) => x[0] === "vis").flatMap((x) => x[1].map((e) => tokens(e.t))).filter(Boolean).slice(0, 3);
          if (definition) collected.push({ partOfSpeech: text(entry.fl), text: definition, examples });
        } else value.forEach(walk);
      };
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.shortdef)) continue;
      const collected = [];
      for (const def of entry.def || []) walk(def.sseq);
      senses.push(...collected.length ? collected : entry.shortdef.filter((x) => text(x)).map((x) => ({ partOfSpeech: text(entry.fl), text: tokens(x), examples: [] })));
    }
    if (!senses.length) return null;
    const learners = providerId === "mw-learners", sourceUrl = `https://www.merriam-webster.com/${learners ? "learner/" : ""}dictionary/${encodeURIComponent(query)}`;
    return { headword: text(data[0]?.hwi?.hw).replace(/\*/g, "") || query, language: "en", senses: senses.slice(0, 20), sourceUrl, attribution: { label: learners ? "Merriam-Webster's Learner's Dictionary" : "Merriam-Webster's Collegiate® Dictionary", url: sourceUrl, brand: "merriam-webster" } };
  }
  function merriamWebster(kind) {
    const id = `mw-${kind}`;
    return { id, label: kind === "learners" ? "Merriam-Webster Learner's" : "Merriam-Webster Collegiate", language: "en", keyRequired: true, suggestionsLabel: "Spelling suggestions", async suggest(options) {
      const data = await requestJson(`https://www.dictionaryapi.com/api/v3/references/${kind}/json/${encodeURIComponent(options.query)}?key=${encodeURIComponent(options.key)}`, options);
      if (!Array.isArray(data)) return [];
      return [...new Set(data.filter((item) => typeof item === "string").map(text).filter(Boolean))].slice(0, 8).map((word) => ({ word, language: "en" }));
    }, async lookup(options) {
      return parseMerriamWebster(await requestJson(`https://www.dictionaryapi.com/api/v3/references/${kind}/json/${encodeURIComponent(options.query)}?key=${encodeURIComponent(options.key)}`, options), options.query, id);
    } };
  }

  // project:src/providers/lexicala.mjs
  var hebrewText = (value) => {
    const valueText = text(value);
    return /[\u05d0-\u05ea]/u.test(valueText) ? valueText : "";
  };
  var unpointed = (value) => text(value).normalize("NFD").replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu, "");
  function parseLexicalaHebrew(data, query = "") {
    if (!data || !Array.isArray(data.results) || data.error || data.message) throw failure("unavailable");
    const entries = [];
    for (const entry of data.results) {
      if (!entry || entry.language !== "he" || !Array.isArray(entry.senses)) continue;
      const head = Array.isArray(entry.headword) ? entry.headword[0] : entry.headword;
      const headword = hebrewText(typeof head === "string" ? head : head?.text);
      if (!headword) continue;
      const senses2 = [];
      for (const sense of entry.senses) {
        const definition = hebrewText(sense?.definition);
        if (!definition) continue;
        const examples = Array.isArray(sense.examples) ? sense.examples.map((example) => hebrewText(example?.text)).filter(Boolean).slice(0, 3) : [];
        senses2.push({ partOfSpeech: text(entry.pos) || text(head?.pos), text: definition, examples });
        if (senses2.length === 20) break;
      }
      if (senses2.length) entries.push({ headword, senses: senses2 });
    }
    if (!entries.length) return null;
    const selected = entries.find((entry) => entry.headword.normalize("NFC") === text(query).normalize("NFC")) || entries.find((entry) => unpointed(entry.headword) === unpointed(query)) || entries[0];
    const identity = selected.headword, senses = [], matches = [], seen = /* @__PURE__ */ new Set([identity]);
    for (const entry of entries) {
      const word = entry.headword;
      if (word === identity) senses.push(...entry.senses.slice(0, 20 - senses.length));
      else if (!seen.has(word) && matches.length < 8) {
        seen.add(word);
        matches.push({ word: entry.headword, language: "he" });
      }
    }
    return { headword: selected.headword, language: "he", senses, matches, attribution: { label: "Lexicala · K Dictionaries", url: "https://lexicala.com/" } };
  }
  var lexicalaHebrew = { id: "lexicala-he", label: "Lexicala Hebrew (test)", language: "he", keyRequired: true, supportsFallback: false, suggestionsLabel: null, async lookup(options) {
    const params = new URLSearchParams({ source: "global", language: "he", text: options.query, morph: "true", analyzed: "true", page: "1", "page-length": "10" });
    const data = await requestJson(`https://lexicala1.p.rapidapi.com/search?${params}`, { fetch: options.fetch, signal: options.signal, lexicalaKey: options.key });
    return data === null ? null : parseLexicalaHebrew(data, options.query);
  } };

  // project:src/providers/academy.mjs
  var unpointed2 = (value) => text(value).normalize("NFD").replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu, "");
  var displayWord = (value) => text(value).replace(/_פועל$/u, "");
  function rows(data) {
    if (!Array.isArray(data)) throw failure("unavailable");
    return data.filter((row) => row && /[א-ת]/u.test(displayWord(row.keyword))).slice(0, 100).sort((a, b) => (Number.isFinite(b.score) ? b.score : 0) - (Number.isFinite(a.score) ? a.score : 0) || (Number.isFinite(a.order) ? a.order : 100) - (Number.isFinite(b.order) ? b.order : 100));
  }
  function candidates(entries, except = "") {
    return [...new Set(entries.map((row) => displayWord(row.keyword)))].filter((word) => word && word !== except).slice(0, 8).map((word) => ({ word, language: "he" }));
  }
  function sourceMatches(row, query) {
    const wanted = unpointed2(query);
    if ([row.keyword, row.keywordWithoutNikud, row.ktiv_male, row.menukad].some((value) => unpointed2(displayWord(value)) === wanted)) return true;
    const title = text(row.title), separator = title.indexOf(" > ");
    if (separator < 0) return false;
    const form = title.slice(0, separator);
    return unpointed2(form.replace(/\s*\([^)]*\)\s*$/u, "")) === wanted || [...form.matchAll(/\(([^)]+)\)/gu)].some((match) => unpointed2(match[1]) === wanted);
  }
  function definitionText(html, parseDocument) {
    const document2 = parseDocument(html);
    document2.querySelectorAll("script,style,iframe,object,template").forEach((node) => node.remove());
    return text(document2.body.textContent);
  }
  function parseAcademyHebrew(data, query, parseDocument) {
    const entries = rows(data), defined = entries.map((row) => ({ row, senses: (Array.isArray(row.hagdarot) ? row.hagdarot : []).filter((value) => typeof value === "string").flatMap((value) => value.split("|")).map((value) => definitionText(value, parseDocument)).filter(Boolean).slice(0, 20).map((value) => ({ partOfSpeech: /Poal/u.test(row.ItemTypeName || "") ? "פועל" : "", text: value, examples: [] })) })).filter((entry) => entry.senses.length && sourceMatches(entry.row, query));
    const selected = defined.find((entry) => displayWord(entry.row.keyword).normalize("NFC") === text(query).normalize("NFC")) || defined[0];
    if (!selected) return null;
    const headword = displayWord(selected.row.keyword), sourceUrl = `https://hebrew-academy.org.il/דף-מילה/${encodeURIComponent(selected.row.keyword)}/`;
    return { headword, language: "he", senses: selected.senses, matches: candidates(entries, headword), sourceUrl, attribution: { label: "האקדמיה ללשון העברית · מילון ההווה", url: sourceUrl } };
  }
  async function search(options) {
    return requestJson(`https://kalanit.hebrew-academy.org.il/api/Ac/?${new URLSearchParams({ SearchString: options.query })}`, options);
  }
  var academyHebrew = { id: "academy-he", label: "האקדמיה ללשון העברית", language: "he", keyRequired: false, supportsFallback: false, suggestionsLabel: "Dictionary entries", async suggest(options) {
    const data = await search(options);
    return data === null ? [] : candidates(rows(data));
  }, async lookup(options) {
    const data = await search(options);
    return data === null ? null : parseAcademyHebrew(data, options.query, options.parseDocument);
  } };

  // project:src/providers/milog.mjs
  var unpointed3 = (value) => text(value).normalize("NFD").replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu, "");
  var lookupUrl = (query) => `https://milog.co.il/${encodeURIComponent(query.replace(/\s+/gu, "_").replace(/\//gu, "_slash_"))}`;
  function plain2(node, remove = "script,style,iframe,object,template") {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(remove).forEach((child) => child.remove());
    return text(copy.textContent);
  }
  function parseMilogHebrew(document2, query) {
    const entries = [];
    for (const element of [...document2.querySelectorAll(".sr_e")].slice(0, 100)) {
      const title = element.querySelector(".sr_e_t");
      if (!title) continue;
      const headword = plain2(title, "span:not(.sr_e_prefix_txt),script,style,iframe,object,template").replace(/\s+-\s*$/u, "").trim();
      if (!/[א-ת]/u.test(headword)) continue;
      const grammar = title.querySelector("span:not(.sr_e_prefix_txt)");
      const partOfSpeech = grammar ? plain2(grammar) : "";
      const senses = [];
      for (const sense of [...element.querySelectorAll(".sr_e_para .sr_e_txt")].slice(0, 20)) {
        const definition = plain2(sense, "script,style,iframe,object,template,.sr_example");
        if (!definition) continue;
        const examples = [...sense.querySelectorAll(".sr_example")].slice(0, 3).map((node) => plain2(node)).filter(Boolean);
        senses.push({ partOfSpeech, text: definition, examples });
      }
      if (senses.length) entries.push({ headword, senses, sourceUrl: safeUrl(title.getAttribute("href"), ["milog.co.il"]) || lookupUrl(query) });
    }
    const selected = entries.find((entry) => entry.headword.normalize("NFC") === text(query).normalize("NFC")) || entries.find((entry) => unpointed3(entry.headword) === unpointed3(query));
    if (!selected) return null;
    const matches = [...new Set(entries.map((entry) => entry.headword))].filter((word) => word !== selected.headword).slice(0, 8).map((word) => ({ word, language: "he" }));
    return { ...selected, language: "he", matches, attribution: { label: "מילוג", url: selected.sourceUrl } };
  }
  var milogHebrew = { id: "milog-he", label: "מילוג", language: "he", keyRequired: false, supportsFallback: false, suggestionsLabel: null, async lookup(options) {
    const html = await requestHtml(lookupUrl(options.query), options);
    return html === null ? null : parseMilogHebrew(options.parseDocument(html), options.query);
  } };

  // project:src/providers/registry.mjs
  var providers = new Map([freeDictionary, wiktionary("en"), wiktionary("he"), merriamWebster("collegiate"), merriamWebster("learners"), lexicalaHebrew, academyHebrew, milogHebrew].map((p) => [p.id, p]));

  // project:src/normalize.mjs
  function normalizeTerm(rawText) {
    const original = typeof rawText === "string" ? rawText.trim() : "";
    if (!original) return { status: "empty" };
    if ([...original].length > 100) return { status: "too-long" };
    const query = original.normalize("NFC").replace(/^[\p{P}\p{Z}\s]+|[\p{P}\p{Z}\s]+$/gu, "");
    if (!query) return { status: "empty" };
    const letters = [...query].filter((c) => new RegExp("\\p{L}", "u").test(c));
    const language = letters.length && letters.every((c) => new RegExp("\\p{Script=Hebrew}", "u").test(c)) ? "he" : letters.length && letters.every((c) => new RegExp("\\p{Script=Latin}", "u").test(c)) ? "en" : null;
    const without = query.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, "");
    return { original, query, language, withoutNiqqud: language === "he" && without !== query ? without : null };
  }

  // project:src/lookup.mjs
  function createLookupService({ providers: providers2, credentials, fetch = globalThis.fetch, parseDocument, timers = globalThis }) {
    async function run({ term, providerId, signal }, operation) {
      if (term?.status) return term;
      const provider = providers2.get(providerId);
      if (!provider || !term?.language || provider.language !== term.language) return { status: "unsupported" };
      if (signal?.aborted) return { status: "cancelled" };
      if (operation === "suggest" && typeof provider.suggest !== "function") return { status: "unsupported-suggestions" };
      const abort = new AbortController();
      let timedOut = false, finishAbort;
      const stopped = new Promise((resolve) => finishAbort = resolve);
      const stop = () => {
        abort.abort();
        finishAbort({ status: timedOut ? "timeout" : "cancelled" });
      };
      signal?.addEventListener("abort", stop, { once: true });
      const timer = timers.setTimeout(() => {
        timedOut = true;
        stop();
      }, 1e4);
      async function request2() {
        let key;
        if (provider.keyRequired) {
          try {
            key = await credentials?.get(providerId);
          } catch {
            return { status: "credential-unavailable" };
          }
          if (!key) return { status: "missing-key" };
        }
        if (abort.signal.aborted) return { status: "cancelled" };
        const options = { query: term.query, signal: abort.signal, key, fetch, parseDocument };
        if (operation === "suggest") {
          const candidates2 = await provider.suggest(options), suggestions = [], seen = /* @__PURE__ */ new Set();
          if (!Array.isArray(candidates2)) return { status: "unavailable" };
          for (const candidate of candidates2) {
            const word = normalizeTerm(candidate?.word);
            const identity = word.query?.toLocaleLowerCase("en");
            if (word.status || word.language !== term.language || candidate.language !== term.language || seen.has(identity)) continue;
            seen.add(identity);
            suggestions.push({ word: word.query, language: term.language });
            if (suggestions.length === 8) break;
          }
          return { status: "ok", suggestions };
        }
        let definition = await provider.lookup(options), normalizedRetry = false;
        const fallback = term.language === "he" ? term.withoutNiqqud : term.query?.toLowerCase();
        if (provider.supportsFallback !== false && !definition && fallback && fallback !== term.query && !abort.signal.aborted) {
          normalizedRetry = true;
          definition = await provider.lookup({ ...options, query: fallback });
        }
        return definition ? { status: "ok", definition, normalizedRetry } : { status: "no-result" };
      }
      try {
        return await Promise.race([request2().catch((error) => ({ status: ["rate-limit", "cancelled", "unauthorized", "access-denied"].includes(error?.code) ? error.code : "unavailable" })), stopped]);
      } finally {
        timers.clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
    }
    return { lookup: (options) => run(options, "lookup"), suggest: (options) => run(options, "suggest") };
  }

  // project:src/resize.mjs
  function createPopupResizer(window2, { panel, shell, handle, handles = [handle], isOpen, readSize, onSizeChange, onPositionChange }) {
    let drag = null, manual = null, disposed2 = false;
    function geometry() {
      const content = shell.getBoundingClientRect(), outer = panel.getBoundingClientRect();
      return { content, frameWidth: Math.max(0, outer.width - content.width), frameHeight: Math.max(0, outer.height - content.height) };
    }
    function apply(width, height, preparing = false, at = null) {
      if (disposed2) return;
      const { content, frameWidth, frameHeight } = geometry();
      const left = at?.left ?? content.left, top = at?.top ?? content.top;
      const maxWidth = Math.max(1, Math.min(window2.innerWidth - 48, preparing ? Infinity : window2.innerWidth - Math.max(0, left) - frameWidth - 12));
      const maxHeight = Math.max(1, Math.min(window2.innerHeight - 32, preparing ? Infinity : window2.innerHeight - Math.max(0, top) - frameHeight - 12));
      manual = { width: Math.round(Math.min(maxWidth, Math.max(320, width))), height: Math.round(Math.min(maxHeight, Math.max(200, height))) };
      shell.dataset.resized = "";
      shell.style.width = `${manual.width}px`;
      shell.style.height = `${manual.height}px`;
      panel.sizeTo?.(Math.round(manual.width + frameWidth), Math.round(manual.height + frameHeight));
    }
    function stop() {
      const previous = drag;
      drag = null;
      for (const type of ["pointermove", "mousemove"]) window2.removeEventListener(type, move);
      for (const type of ["pointerup", "mouseup", "pointercancel", "blur"]) window2.removeEventListener(type, stop);
      if (previous?.pointerId !== void 0) {
        try {
          previous.handle.releasePointerCapture?.(previous.pointerId);
        } catch {
        }
      }
      if (previous?.changed && manual) onSizeChange?.({ ...manual });
    }
    function move(event) {
      if (!drag || disposed2 || drag.pointerId !== void 0 && event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.changed = true;
      const dx = (drag.screen ? event.screenX : event.clientX) - drag.x, dy = (drag.screen ? event.screenY : event.clientY) - drag.y;
      const west = drag.edge.includes("w"), north = drag.edge.includes("n");
      let width = drag.width + (west ? -dx : drag.edge.includes("e") ? dx : 0), height = drag.height + (north ? -dy : drag.edge.includes("s") ? dy : 0);
      if (west) width = Math.max(320, Math.min(width, drag.width + drag.left - 12));
      if (north) height = Math.max(200, Math.min(height, drag.height + drag.top - 12));
      const left = west ? drag.left + drag.width - width : drag.left, top = north ? drag.top + drag.height - height : drag.top;
      apply(width, height, false, { left, top });
      onPositionChange?.(drag.screenLeft + (west ? drag.width - manual.width : 0), drag.screenTop + (north ? drag.height - manual.height : 0));
    }
    function start2(event) {
      if (disposed2 || drag || !isOpen() || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault();
      const { content } = geometry(), outer = panel.getOuterScreenRect?.();
      const screen = !!outer, target = event.currentTarget;
      drag = {
        x: screen ? event.screenX : event.clientX,
        y: screen ? event.screenY : event.clientY,
        screen,
        width: content.width,
        height: content.height,
        left: content.left,
        top: content.top,
        screenLeft: outer?.x ?? (window2.mozInnerScreenX || 0) + content.left,
        screenTop: outer?.y ?? (window2.mozInnerScreenY || 0) + content.top,
        edge: target.dataset.resizeEdge || "se",
        handle: target,
        pointerId: event.pointerId
      };
      target.setAttribute("data-pointer-focus", "");
      target.focus();
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
      }
      const mouse = event.type === "mousedown";
      window2.addEventListener(mouse ? "mousemove" : "pointermove", move, { passive: false });
      window2.addEventListener(mouse ? "mouseup" : "pointerup", stop);
      window2.addEventListener("pointercancel", stop);
      window2.addEventListener("blur", stop);
    }
    function clear() {
      manual = null;
      shell.removeAttribute("data-resized");
      shell.style.removeProperty("width");
      shell.style.removeProperty("height");
      panel.removeAttribute("width");
      panel.removeAttribute("height");
      panel.style.removeProperty("width");
      panel.style.removeProperty("height");
    }
    function reset() {
      stop();
      clear();
      onSizeChange?.(null);
    }
    function prepare() {
      const saved = readSize ? readSize() : manual;
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) && saved.width >= 200 && saved.height >= 120 && saved.width <= 1e4 && saved.height <= 1e4) apply(saved.width, saved.height, true);
      else clear();
    }
    function keyboard(event) {
      event.currentTarget.removeAttribute("data-pointer-focus");
      if (disposed2 || !isOpen()) return;
      if (event.key === "Home") {
        event.preventDefault();
        reset();
        return;
      }
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopPropagation();
        stop();
        return;
      }
      const step = event.shiftKey ? 50 : 20, delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const { content } = geometry();
      apply(content.width + delta[0], content.height + delta[1]);
      onSizeChange?.({ ...manual });
    }
    function fit() {
      if (manual && isOpen() && !drag) apply(manual.width, manual.height);
    }
    const windowResized = (event) => {
      if (event.target === window2) fit();
    };
    function keyboardFocus(event) {
      event.currentTarget.removeAttribute("data-pointer-focus");
    }
    for (const item of handles) {
      item.addEventListener("blur", keyboardFocus);
      item.addEventListener("pointerdown", start2);
      item.addEventListener("mousedown", start2);
      item.addEventListener("lostpointercapture", stop);
      item.addEventListener("keydown", keyboard);
      item.addEventListener("dblclick", reset);
    }
    panel.addEventListener("popupshown", fit);
    window2.addEventListener("resize", windowResized);
    return { prepare, stop, destroy() {
      if (disposed2) return;
      stop();
      disposed2 = true;
      for (const item of handles) {
        item.removeEventListener("blur", keyboardFocus);
        item.removeEventListener("pointerdown", start2);
        item.removeEventListener("mousedown", start2);
        item.removeEventListener("lostpointercapture", stop);
        item.removeEventListener("keydown", keyboard);
        item.removeEventListener("dblclick", reset);
      }
      panel.removeEventListener("popupshown", fit);
      window2.removeEventListener("resize", windowResized);
    } };
  }

  // project:src/position.mjs
  function createPopupPositioner(window2, { panel, shell, header, isOpen }) {
    let anchor = null, manual = false, drag = null, disposed2 = false, lastPosition = null;
    const valid = (r) => r && ["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) && r.width >= 0 && r.height > 0;
    function bounds() {
      const x = Number.isFinite(window2.mozInnerScreenX) ? window2.mozInnerScreenX : 0, y = Number.isFinite(window2.mozInnerScreenY) ? window2.mozInnerScreenY : 0;
      return { x: x + 12, y: y + 12, right: x + window2.innerWidth - 12, bottom: y + window2.innerHeight - 12 };
    }
    function size() {
      const r = panel.getOuterScreenRect?.() || panel.getBoundingClientRect();
      return { width: r.width || parseFloat(shell.style.width) || 480, height: r.height || parseFloat(shell.style.height) || 300 };
    }
    function clamp(x, y) {
      const b = bounds(), s = size();
      return { x: Math.round(Math.max(b.x, Math.min(x, b.right - s.width))), y: Math.round(Math.max(b.y, Math.min(y, b.bottom - s.height))) };
    }
    function target() {
      if (manual && lastPosition) return clamp(lastPosition.x, lastPosition.y);
      const b = bounds(), s = size();
      if (anchor) {
        const below = anchor.y + anchor.height + 8, above = anchor.y - s.height - 8;
        return clamp(anchor.x + anchor.width / 2 - s.width / 2, below + s.height <= b.bottom ? below : above >= b.y ? above : below);
      }
      const browser = window2.gBrowser?.selectedBrowser?.getBoundingClientRect?.();
      return clamp(b.x + (browser?.left || 0) + 4, b.y + (browser?.top || 0) + 4);
    }
    function fit() {
      if (disposed2 || !isOpen() || drag) return;
      const next = target();
      if (!lastPosition || next.x !== lastPosition.x || next.y !== lastPosition.y) {
        lastPosition = next;
        panel.moveTo?.(next.x, next.y);
      }
    }
    function stop() {
      const old = drag;
      drag = null;
      header.removeAttribute("data-dragging");
      window2.removeEventListener("pointermove", move);
      window2.removeEventListener("pointerup", stop);
      window2.removeEventListener("mousemove", move);
      window2.removeEventListener("mouseup", stop);
      window2.removeEventListener("pointercancel", stop);
      window2.removeEventListener("blur", stop);
      if (old?.id !== void 0) {
        try {
          header.releasePointerCapture?.(old.id);
        } catch {
        }
      }
    }
    function move(event) {
      if (!drag || disposed2 || drag.id !== void 0 && event.pointerId !== drag.id) return;
      event.preventDefault();
      manual = true;
      lastPosition = clamp(drag.x + event.screenX - drag.pointerX, drag.y + event.screenY - drag.pointerY);
      panel.moveTo?.(lastPosition.x, lastPosition.y);
    }
    function start2(event) {
      if (disposed2 || drag || !isOpen() || event.button !== 0 || event.isPrimary === false || event.target.closest("button,select,input,a")) return;
      event.preventDefault();
      stop();
      const rect = panel.getOuterScreenRect?.(), point = rect ? { x: rect.x, y: rect.y } : lastPosition || target();
      drag = { x: point.x, y: point.y, pointerX: event.screenX, pointerY: event.screenY, id: event.pointerId };
      header.setAttribute("data-dragging", "");
      try {
        header.setPointerCapture?.(event.pointerId);
      } catch {
      }
      const mouse = event.type === "mousedown";
      window2.addEventListener(mouse ? "mousemove" : "pointermove", move, { passive: false });
      window2.addEventListener(mouse ? "mouseup" : "pointerup", stop);
      window2.addEventListener("pointercancel", stop);
      window2.addEventListener("blur", stop);
    }
    function keyboard(event) {
      if (event.target !== header || !isOpen()) return;
      if (event.key === "Escape") {
        stop();
        return;
      }
      const step = event.shiftKey ? 50 : 20, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (!d) return;
      event.preventDefault();
      manual = true;
      const p = lastPosition || target();
      lastPosition = clamp(p.x + d[0], p.y + d[1]);
      panel.moveTo?.(lastPosition.x, lastPosition.y);
    }
    header.addEventListener("pointerdown", start2);
    header.addEventListener("mousedown", start2);
    header.addEventListener("lostpointercapture", stop);
    header.addEventListener("keydown", keyboard);
    panel.addEventListener("popupshown", fit);
    window2.addEventListener("resize", fit);
    const observer2 = window2.ResizeObserver ? new window2.ResizeObserver(fit) : null;
    observer2?.observe(shell);
    return {
      open(value) {
        stop();
        anchor = valid(value) ? value : null;
        manual = false;
        lastPosition = null;
        const p = target();
        if (panel.openPopupAtScreen) panel.openPopupAtScreen(p.x, p.y, false);
        else panel.openPopup(window2.gBrowser.selectedBrowser, "overlap", 16, 16, false, false);
        fit();
      },
      setPosition(x, y) {
        manual = true;
        lastPosition = clamp(x, y);
        panel.moveTo?.(lastPosition.x, lastPosition.y);
      },
      fit,
      stop,
      destroy() {
        if (disposed2) return;
        stop();
        disposed2 = true;
        observer2?.disconnect();
        header.removeEventListener("pointerdown", start2);
        header.removeEventListener("mousedown", start2);
        header.removeEventListener("lostpointercapture", stop);
        header.removeEventListener("keydown", keyboard);
        panel.removeEventListener("popupshown", fit);
        window2.removeEventListener("resize", fit);
      }
    };
  }

  // project:src/popup.mjs
  var hosts = ["en.wiktionary.org", "he.wiktionary.org", "dictionaryapi.dev", "www.merriam-webster.com", "creativecommons.org", "lexicala.com", "hebrew-academy.org.il", "milog.co.il", "www.milog.co.il"];
  var wordKey = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase("en");
  var displayWord2 = (value, language) => language === "en" ? String(value || "").toLocaleLowerCase("en").replace(new RegExp("(^|[\\s-])(\\p{L})", "gu"), (_m, space, letter) => space + letter.toLocaleUpperCase("en")) : String(value || "");
  var messages = { empty: "Enter an English or Hebrew word.", unsupported: "Enter an English or Hebrew word.", "too-long": "Enter a word or short phrase (up to 100 characters).", loading: "Looking up…", "no-result": "No definition found. Try a matching word below the search field.", "missing-key": "Add your dictionary API key in the mod’s Configure settings.", "credential-unavailable": "Credential storage is unavailable or locked. Unlock it and try again.", "unauthorized": "The dictionary rejected the API key. Check or replace it in Configure.", "access-denied": "Access was denied. Check that your key has an active subscription to this dictionary.", "rate-limit": "This dictionary’s request limit has been reached.", timeout: "The dictionary took too long to respond. Press Enter to retry, or choose another dictionary.", unavailable: "The dictionary is currently unavailable. Press Enter to retry, or choose another." };
  function createPopup(window2, callbacks) {
    const { document: document2 } = window2;
    const el = (tag, value) => {
      const n = document2.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (value !== void 0) n.textContent = value;
      return n;
    };
    const panel = document2.createXULElement("panel");
    panel.id = "define-word-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Word definition");
    panel.setAttribute("orient", "vertical");
    const box = el("div");
    box.className = "dw-card";
    const bar = el("div");
    bar.className = "dw-bar";
    bar.tabIndex = 0;
    bar.setAttribute("aria-label", "Move definition popup");
    bar.title = "Drag to move. When the header is focused, arrow keys move the popup.";
    const title = el("strong", "Define"), closeButton = el("button", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close definition");
    const provider = el("select");
    provider.setAttribute("aria-label", "Dictionary");
    provider.title = "Dictionary for the language you type";
    bar.append(title, provider, closeButton);
    const search2 = el("form");
    search2.className = "dw-search";
    const query = el("input");
    query.type = "text";
    query.maxLength = 100;
    query.dir = "auto";
    query.autocomplete = "off";
    query.spellcheck = false;
    query.placeholder = "Search English or Hebrew";
    query.setAttribute("aria-label", "Word to define in English or Hebrew");
    query.setAttribute("role", "combobox");
    query.setAttribute("aria-autocomplete", "list");
    query.setAttribute("aria-controls", "dw-matches");
    query.setAttribute("aria-expanded", "false");
    const submit = el("button", "Search");
    submit.type = "submit";
    search2.append(query, submit);
    const matches = el("div");
    matches.className = "dw-matches";
    matches.hidden = true;
    const matchLabel = el("p"), list = el("ul");
    list.id = "dw-matches";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Matching dictionary words");
    matches.append(matchLabel, list);
    const result = el("div");
    result.dataset.result = "";
    result.setAttribute("aria-live", "polite");
    const word = el("h2"), headword = el("p"), status = el("p"), senses = el("ol");
    headword.dataset.headword = "";
    result.append(word, headword, status, senses);
    const footer = el("div");
    footer.className = "dw-footer";
    const attribution = el("div"), source = el("button", "View dictionary entry");
    source.type = "button";
    source.dataset.source = "";
    source.hidden = true;
    footer.append(attribution, source);
    const shell = el("div");
    shell.className = "dw-shell";
    const handles = ["se", "s", "e", "n", "w", "nw", "ne", "sw"].map((edge) => {
      const n = el("button");
      n.type = "button";
      n.dataset.resizeEdge = edge;
      n.className = "dw-resize-edge";
      n.tabIndex = edge === "se" ? 0 : -1;
      n.setAttribute("aria-label", "Resize definition popup");
      n.title = "Drag any edge or corner to resize. Arrow keys resize; Shift makes larger steps. Home or double-click resets.";
      return n;
    });
    const resizeHandle = handles[0];
    resizeHandle.dataset.resize = "";
    box.append(bar, search2, matches, result, footer);
    shell.append(box, ...handles);
    panel.append(shell);
    (document2.getElementById("mainPopupSet") || document2.documentElement).append(panel);
    let active = false, origin, originBrowser, sourceUrl, selected = -1, candidates2 = [];
    const positioner = createPopupPositioner(window2, { panel, shell, header: bar, isOpen: () => active });
    const resizer = createPopupResizer(window2, { panel, shell, handle: resizeHandle, handles, isOpen: () => active, readSize: callbacks.readSize, onSizeChange: callbacks.onSizeChange, onPositionChange: positioner.setPosition });
    function clearMatches() {
      matches.hidden = true;
      list.replaceChildren();
      candidates2 = [];
      selected = -1;
      query.setAttribute("aria-expanded", "false");
      query.removeAttribute("aria-activedescendant");
    }
    function choose(word2) {
      query.value = displayWord2(word2, new RegExp("\\p{Script=Hebrew}", "u").test(word2) ? "he" : "en");
      clearMatches();
      callbacks.onSearch?.(word2);
      query.focus();
    }
    function setTextSize(size = 14) {
      box.style.setProperty("--dw-text-size", `${[12, 14, 16, 18, 20, 24].includes(Number(size)) ? Number(size) : 14}px`);
    }
    function chooseProviders(term, providerId, providers2) {
      provider.replaceChildren();
      for (const p of providers2) {
        const option = el("option", p.label + (p.keyRequired ? " · API key" : ""));
        option.value = p.id;
        provider.append(option);
      }
      provider.value = providerId;
      provider.disabled = !providers2.length;
    }
    function clearResult() {
      headword.textContent = "";
      headword.hidden = true;
      senses.replaceChildren();
      attribution.replaceChildren();
      sourceUrl = null;
      source.hidden = true;
    }
    function close({ restoreFocus = false } = {}) {
      resizer.stop();
      positioner.stop();
      if (!active) return;
      active = false;
      panel.hidePopup();
      if (restoreFocus && originBrowser === window2.gBrowser.selectedBrowser && origin?.isConnected) origin.focus();
    }
    function link(value, label) {
      const url = safeUrl(value, hosts);
      const a = el("button", label);
      a.type = "button";
      a.className = "dw-source-link";
      a.disabled = !url;
      if (url) a.addEventListener("click", () => window2.openTrustedLinkIn(url, "tab"));
      return a;
    }
    closeButton.addEventListener("click", () => callbacks.onClose({ restoreFocus: true }));
    source.addEventListener("click", () => {
      if (sourceUrl) window2.openTrustedLinkIn(sourceUrl, "tab");
    });
    provider.addEventListener("change", () => callbacks.onProviderChange?.(provider.value, query.value));
    query.addEventListener("input", () => {
      clearMatches();
      callbacks.onQueryInput?.(query.value);
    });
    search2.addEventListener("submit", (event) => {
      event.preventDefault();
      clearMatches();
      callbacks.onSearch?.(query.value);
    });
    query.addEventListener("keydown", (event) => {
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && candidates2.length) {
        event.preventDefault();
        selected = selected < 0 ? event.key === "ArrowDown" ? 0 : candidates2.length - 1 : (selected + (event.key === "ArrowDown" ? 1 : -1) + candidates2.length) % candidates2.length;
        for (const [index, node] of [...list.children].entries()) node.setAttribute("aria-selected", String(index === selected));
        query.setAttribute("aria-activedescendant", list.children[selected].id);
        list.children[selected].scrollIntoView?.({ block: "nearest" });
      } else if (event.key === "Enter" && selected >= 0) {
        event.preventDefault();
        choose(candidates2[selected].word);
      } else if (event.key === "Escape" && !matches.hidden) {
        event.preventDefault();
        event.stopPropagation();
        clearMatches();
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        callbacks.onClose({ restoreFocus: true });
      }
    });
    panel.addEventListener("popuphidden", (event) => {
      if (event.target === panel && active) {
        resizer.stop();
        positioner.stop();
        active = false;
        callbacks.onClose({ restoreFocus: false });
      }
    });
    return {
      show(anchor) {
        if (active) return;
        origin = document2.activeElement;
        originBrowser = window2.gBrowser.selectedBrowser;
        resizer.prepare();
        active = true;
        positioner.open(anchor);
        query.focus();
        query.select();
      },
      setTextSize,
      editing({ term, providerId, providers: providers2 }) {
        clearResult();
        word.textContent = "";
        status.textContent = term.status ? messages[term.status] : "Press Enter to look up this word, or choose a suggestion.";
        status.dir = "ltr";
        chooseProviders(term, providerId, providers2);
      },
      renderSuggestions({ outcome, label }) {
        clearMatches();
        if (outcome.status === "unsupported-suggestions") return;
        matches.hidden = false;
        matchLabel.textContent = outcome.status === "ok" ? label : outcome.status === "timeout" ? "Suggestions timed out. Press Enter to retry." : outcome.status === "missing-key" ? "Add an API key in Configure to use this dictionary." : "Suggestions unavailable. You can still press Enter to look up a word.";
        if (outcome.status !== "ok") return;
        const seen = /* @__PURE__ */ new Set();
        candidates2 = (outcome.suggestions || []).filter((item) => {
          const key = wordKey(item.word);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 8);
        if (!candidates2.length) {
          matchLabel.textContent = "No matching words found.";
          return;
        }
        query.setAttribute("aria-expanded", "true");
        for (const [index, item] of candidates2.entries()) {
          const li = el("li", displayWord2(item.word, item.language));
          li.id = `dw-match-${index}`;
          li.setAttribute("role", "option");
          li.setAttribute("aria-selected", "false");
          li.dir = item.language === "he" ? "rtl" : "ltr";
          li.lang = item.language || "en";
          li.addEventListener("mousedown", (event) => event.preventDefault());
          li.addEventListener("click", () => choose(item.word));
          list.append(li);
        }
      },
      render({ term, providerId, providers: providers2, outcome, textSize }) {
        if (outcome.status === "loading" || wordKey(query.value) !== wordKey(term.original)) {
          query.value = displayWord2(term.original, term.language);
          clearMatches();
        }
        setTextSize(textSize);
        chooseProviders(term, providerId, providers2);
        result.dir = term.language === "he" ? "rtl" : "ltr";
        result.lang = term.language || "en";
        word.textContent = displayWord2(term.original, term.language) || "Define";
        clearResult();
        status.textContent = messages[outcome.status] || "";
        status.dir = "ltr";
        status.lang = "en";
        if (outcome.status === "no-result") {
          const label = providers2.find((p) => p.id === providerId)?.label || "This dictionary";
          status.textContent = term.language === "he" ? `לא נמצא ערך עבור ״${term.original}״ ב${label}. נסו מילה מההצעות או חפשו את צורת הבסיס.` : `No entry for “${term.original}” in ${label}. Try a matching word or edit your search.`;
          if (providers2.length > 1) status.textContent += term.language === "he" ? " אפשר לבחור מילון אחר." : " Choose another dictionary above.";
          status.dir = term.language === "he" ? "rtl" : "ltr";
          status.lang = term.language || "en";
        }
        if (outcome.status === "ok") {
          const d = outcome.definition;
          result.dir = d.language === "he" ? "rtl" : "ltr";
          result.lang = d.language;
          if (d.headword && wordKey(d.headword) !== wordKey(term.original)) {
            headword.hidden = false;
            headword.textContent = (d.language === "he" ? "ערך במילון: " : "Dictionary entry: ") + displayWord2(d.headword, d.language);
          }
          status.textContent = outcome.normalizedRetry && term.language === "he" ? "נמצא ערך ללא ניקוד." : "";
          for (const sense of d.senses) {
            const li = el("li");
            if (sense.partOfSpeech) {
              const part = el("span", sense.partOfSpeech);
              part.className = "dw-part";
              li.append(part);
            }
            li.append(el("p", sense.text));
            for (const example of sense.examples || []) {
              const quote = el("blockquote", example);
              li.append(quote);
            }
            senses.append(li);
          }
          if (d.attribution.brand === "merriam-webster") {
            const logo = el("img");
            logo.src = "chrome://sine/content/define-word/assets/merriam-webster.png";
            logo.alt = "Merriam-Webster";
            logo.width = logo.height = 50;
            attribution.append(logo);
          }
          attribution.append(link(d.attribution.url, d.attribution.label));
          if (d.attribution.licenseLabel) attribution.append(link(d.attribution.licenseUrl, d.attribution.licenseLabel));
          sourceUrl = safeUrl(d.sourceUrl, hosts);
          source.hidden = !sourceUrl;
        }
      },
      close,
      destroy() {
        close();
        positioner.destroy();
        resizer.destroy();
        panel.remove();
      }
    };
  }

  // project:src/controller.mjs
  function createController(window2, deps) {
    const { document: document2 } = window2, menu = document2.getElementById("contentAreaContextMenu");
    const item = document2.createXULElement("menuitem");
    item.id = "define-word-menu";
    item.hidden = true;
    item.setAttribute("label", "Define");
    menu?.append(item);
    function updateAppearance(settings = deps.settings()) {
      const visible = settings.showIcon !== false;
      item.classList.toggle("menuitem-iconic", visible);
      if (visible) item.setAttribute("image", "chrome://sine/content/define-word/assets/define-word.svg");
      else item.removeAttribute("image");
      popup?.setTextSize?.(settings.textSize);
    }
    let generation = 0, pending, suggestionsPending, debounce, disposed2 = false, lastTerm, lastProvider, lastSelection, originBrowser;
    const available = (language) => [...deps.providers.values()].filter((p) => p.language === language);
    const current = () => originBrowser === window2.gBrowser.selectedBrowser && (!lastSelection || deps.selection.isCurrent(window2, lastSelection));
    function cancel() {
      generation++;
      pending?.abort();
      suggestionsPending?.abort();
      pending = suggestionsPending = null;
      window2.clearTimeout(debounce);
    }
    function close({ restoreFocus = false } = {}) {
      cancel();
      popup.close({ restoreFocus: restoreFocus && current() });
    }
    const popup = (deps.createPopup || createPopup)(window2, {
      onClose: close,
      readSize: deps.loadPopupSize,
      onSizeChange: deps.savePopupSize,
      onProviderChange(id, query = lastTerm?.original) {
        if (!lastTerm || !current()) {
          close();
          return;
        }
        const term = normalizeTerm(query || "");
        if (deps.providers.get(id)?.language !== term.language) return;
        deps.saveProvider?.(term.language, id);
        void run(term, id);
      },
      onSearch(query) {
        if (!current()) {
          close();
          return;
        }
        const term = normalizeTerm(query);
        void run(term, chooseProvider(term.language));
      },
      onQueryInput(query) {
        if (!current()) {
          close();
          return;
        }
        cancel();
        const token = generation, term = normalizeTerm(query), providerId = chooseProvider(term.language);
        popup.editing?.({ term, providerId, providers: available(term.language) });
        debounce = window2.setTimeout(() => {
          void suggest(term, providerId, token);
        }, 350);
      }
    });
    updateAppearance();
    const defaultProvider = (language) => language === "he" ? deps.settings().hebrewProvider : deps.settings().englishProvider;
    const chooseProvider = (language) => deps.providers.get(lastProvider)?.language === language ? lastProvider : defaultProvider(language);
    async function suggest(term, providerId, token) {
      if (term.status || !term.language || !deps.lookup.suggest) return;
      suggestionsPending?.abort();
      const operation = new AbortController();
      suggestionsPending = operation;
      let outcome;
      try {
        outcome = await deps.lookup.suggest({ term, providerId, signal: operation.signal });
      } catch {
        outcome = { status: "unavailable" };
      }
      if (disposed2 || token !== generation || operation.signal.aborted || outcome?.status === "cancelled") return;
      if (!current()) {
        close();
        return;
      }
      popup.renderSuggestions?.({ outcome: outcome || { status: "unavailable" }, label: deps.providers.get(providerId)?.suggestionsLabel || "Matching words" });
    }
    async function run(term, providerId, token) {
      if (disposed2 || !current()) {
        close();
        return;
      }
      if (token === void 0) {
        cancel();
        token = generation;
      } else {
        pending?.abort();
        suggestionsPending?.abort();
        window2.clearTimeout(debounce);
      }
      pending = new AbortController();
      lastTerm = term;
      lastProvider = providerId;
      const state = { term, providerId, providers: available(term.language), textSize: deps.settings().textSize };
      popup.render({ ...state, outcome: { status: term.status || (!term.language ? "unsupported" : "loading") } });
      popup.show(lastSelection?.anchor);
      if (term.status || !term.language) return;
      void suggest(term, providerId, token);
      let outcome;
      try {
        outcome = await deps.lookup.lookup({ term, providerId, signal: pending.signal });
      } catch {
        outcome = { status: "unavailable" };
      }
      outcome ||= { status: "unavailable" };
      if (disposed2 || token !== generation || outcome.status === "cancelled") return;
      if (!current()) {
        close();
        return;
      }
      popup.render({ ...state, outcome, textSize: deps.settings().textSize });
      if (outcome.status === "ok" && outcome.definition?.matches?.length) popup.renderSuggestions?.({ outcome: { status: "ok", suggestions: outcome.definition.matches }, label: "Matching dictionary entries" });
    }
    async function define(contextMenu) {
      if (disposed2) return;
      close();
      const token = generation;
      originBrowser = window2.gBrowser.selectedBrowser;
      let selection;
      try {
        selection = await deps.selection.capture(window2, contextMenu);
      } catch {
        if (token === generation) close();
        return;
      }
      if (disposed2 || token !== generation) return;
      lastSelection = selection;
      const term = normalizeTerm(selection?.rawText || "");
      await run(term, defaultProvider(term.language), token);
    }
    function showing() {
      const context = window2.gContextMenu;
      const value = context?.selectionInfo?.text || "";
      item.hidden = !value.trim() || !!context?.onPassword;
      item.setAttribute("label", `Define “${value.slice(0, 36)}${value.length > 36 ? "…" : ""}”`);
    }
    const command = () => {
      const context = window2.gContextMenu;
      if (!context || context.onPassword) return;
      const point = context.contentData?.context, scale = window2.devicePixelRatio || 1;
      const anchor = Number.isFinite(point?.screenXDevPx) && Number.isFinite(point?.screenYDevPx) ? { x: point.screenXDevPx / scale, y: point.screenYDevPx / scale, width: 1, height: 1 } : null;
      void define({ frameBrowsingContext: context.frameBrowsingContext, selectionInfo: { text: context.selectionInfo?.text || "" }, onPassword: context.onPassword, anchor });
    };
    item.addEventListener("command", command);
    menu?.addEventListener("popupshowing", showing);
    const dismiss = () => close();
    const progress = { onLocationChange(browser) {
      if (browser === originBrowser) close();
    } };
    const tabClosed = (event) => {
      if (event.target.linkedBrowser === originBrowser) close();
    };
    window2.gBrowser.tabContainer.addEventListener("TabSelect", dismiss);
    window2.gBrowser.tabContainer.addEventListener("TabClose", tabClosed);
    window2.gBrowser.addTabsProgressListener(progress);
    return { define, close, updateAppearance, credentialsChanged(id) {
      if (id === lastProvider) close();
    }, destroy() {
      if (disposed2) return;
      disposed2 = true;
      close();
      item.removeEventListener("command", command);
      item.remove();
      menu?.removeEventListener("popupshowing", showing);
      window2.gBrowser.tabContainer.removeEventListener("TabSelect", dismiss);
      window2.gBrowser.tabContainer.removeEventListener("TabClose", tabClosed);
      window2.gBrowser.removeTabsProgressListener(progress);
      popup.destroy();
      deps.selection.release();
    } };
  }

  // project:src/shortcut.mjs
  var DEFAULT_BINDING = { code: "KeyD", ctrl: true, alt: true, shift: false, meta: false };
  function validateBinding(value) {
    if (value === null) return null;
    if (!value || !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(value.code) || !["ctrl", "alt", "shift", "meta"].every((k) => typeof value[k] === "boolean") || !(value.ctrl || value.alt || value.meta)) throw new Error("Use Ctrl, Alt, or Meta with a letter, number, or function key.");
    return { code: value.code, ctrl: value.ctrl, alt: value.alt, shift: value.shift, meta: value.meta };
  }
  function bindingLabel(binding) {
    return binding ? [binding.ctrl ? "Ctrl" : null, binding.alt ? "Alt" : null, binding.shift ? "Shift" : null, binding.meta ? "Meta" : null, binding.code.replace(/^Key|^Digit/, "")].filter(Boolean).join("+") : "Disabled";
  }
  function findConflict(window2, binding) {
    if (!binding) return "";
    const isMac = /Mac/.test(window2.navigator.platform);
    for (const key of window2.document.querySelectorAll("key")) {
      if (key.getAttribute("disabled") === "true") continue;
      const name = key.getAttribute("key")?.toUpperCase(), code = key.getAttribute("keycode")?.replace(/^VK_/, "");
      const actual = binding.code.replace(/^Key|^Digit/, "");
      if (name !== actual && code !== actual) continue;
      const mods = new Set((key.getAttribute("modifiers") || "").split(/[ ,]+/));
      const flags = { ctrl: mods.has("control") || !isMac && mods.has("accel"), meta: mods.has("meta") || isMac && mods.has("accel"), alt: mods.has("alt"), shift: mods.has("shift") };
      if (["ctrl", "meta", "alt", "shift"].every((k) => flags[k] === binding[k])) return `Shortcut is already used by ${key.id || "a browser command"}. Choose another.`;
    }
    return "";
  }
  function createShortcut(window2, { binding, onInvoke, onConflict }) {
    let active = null, disposed2 = false;
    function update(value) {
      active = null;
      if (disposed2) return;
      try {
        const validated = validateBinding(value);
        const conflict = findConflict(window2, validated);
        onConflict(conflict);
        if (!conflict) active = validated;
      } catch (error) {
        onConflict(error.message);
      }
    }
    function keydown(event) {
      if (!active || event.defaultPrevented || event.repeat || event.isComposing || event.getModifierState?.("AltGraph")) return;
      if (event.code !== active.code || event.ctrlKey !== active.ctrl || event.altKey !== active.alt || event.shiftKey !== active.shift || event.metaKey !== active.meta) return;
      const conflict = findConflict(window2, active);
      if (conflict) {
        active = null;
        onConflict(conflict);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onInvoke();
    }
    window2.addEventListener("keydown", keydown);
    update(binding);
    return { update, destroy() {
      disposed2 = true;
      active = null;
      window2.removeEventListener("keydown", keydown);
    } };
  }

  // project:src/settings.mjs
  var PREF = "extension.define-word.";
  function readSettings(prefs) {
    const english = prefs.getStringPref(`${PREF}english`, "wiktionary-en"), hebrew = prefs.getStringPref(`${PREF}hebrew`, "academy-he");
    let shortcut2;
    try {
      const raw = prefs.getStringPref(`${PREF}shortcut`, JSON.stringify(DEFAULT_BINDING));
      shortcut2 = raw.trim() ? validateBinding(JSON.parse(raw)) : null;
    } catch {
      shortcut2 = null;
    }
    const requestedSize = Number(prefs.getStringPref(`${PREF}text-size`, "14"));
    return { englishProvider: providers.get(english)?.language === "en" ? english : "wiktionary-en", hebrewProvider: providers.get(hebrew)?.language === "he" ? hebrew : "academy-he", shortcut: shortcut2, showIcon: prefs.getBoolPref?.(`${PREF}show-icon`, true) ?? true, textSize: [12, 14, 16, 18, 20, 24].includes(requestedSize) ? requestedSize : 14 };
  }
  function createSettingsControls(window2, { prefs, credentials, onCredentialsChanged, browserWindow = () => window2 }) {
    const { document: document2 } = window2;
    const el = (tag, value) => {
      const n = document2.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (value !== void 0) n.textContent = value;
      return n;
    };
    const root = el("div");
    root.dataset.defineWordSettings = "";
    root.className = "dw-settings";
    let binding = readSettings(prefs).shortcut, recording = false, disposed2 = false;
    const error = el("p");
    error.setAttribute("role", "status");
    error.setAttribute("aria-live", "polite");
    root.append(el("h3", "Keyboard shortcut"), el("p", "Record a key combination, then save it. Use it to define the selected word."));
    const shortcutRow = el("div");
    shortcutRow.className = "dw-setting-row";
    root.append(shortcutRow);
    const label = el("label", "Current shortcut"), field = el("input");
    field.readOnly = true;
    field.value = bindingLabel(binding);
    label.append(field);
    shortcutRow.append(label);
    const actions = el("div");
    actions.className = "dw-actions";
    const record = el("button", "Record shortcut"), disable = el("button", "Disable shortcut"), save = el("button", "Save shortcut");
    for (const button of [record, disable, save]) button.type = "button";
    actions.append(record, disable, save);
    shortcutRow.append(actions);
    record.addEventListener("click", () => {
      recording = true;
      field.value = "Press a shortcut…";
      field.focus();
    });
    field.addEventListener("keydown", (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        recording = false;
        field.value = bindingLabel(binding);
        return;
      }
      if (event.isComposing || event.getModifierState?.("AltGraph")) return;
      try {
        const next = validateBinding({ code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
        const problem = findConflict(browserWindow(), next);
        if (problem) throw new Error(problem);
        binding = next;
        recording = false;
        field.value = bindingLabel(binding);
        error.textContent = "";
      } catch (problem) {
        error.textContent = problem.message;
      }
    });
    disable.addEventListener("click", () => {
      binding = null;
      recording = false;
      field.value = "Disabled";
    });
    save.addEventListener("click", () => {
      try {
        if (recording) throw new Error("Finish recording the shortcut first.");
        const problem = findConflict(browserWindow(), binding);
        if (problem) throw new Error(problem);
        prefs.setStringPref(`${PREF}shortcut`, JSON.stringify(validateBinding(binding)));
        error.textContent = "Shortcut saved.";
      } catch (problem) {
        error.textContent = problem.message;
      }
    });
    root.append(el("h3", "Dictionary API keys"), el("p", "Wiktionary and Free Dictionary API need no key. For Merriam-Webster, register below, request Collegiate and Learner’s Dictionary keys, and verify your email. Each dictionary needs its own key. Keys are saved in Firefox credential storage."));
    const keyControls = [];
    for (const id of ["mw-collegiate", "mw-learners", "lexicala-he"]) {
      let conceal = function() {
        input.type = "password";
        reveal.setAttribute("aria-label", `Show ${providerLabel} API key`);
        reveal.setAttribute("aria-pressed", "false");
      }, commit = function() {
        if (disposed2 || input.disabled || !loaded && !edited) return;
        const key = input.value.trim();
        if (key === pending || pending === void 0 && loaded && key === saved) return;
        version++;
        const request2 = ++requests;
        pending = key;
        status.textContent = "Saving…";
        const stillCurrent = () => !disposed2 && !input.disabled && request2 === requests && input.value.trim() === key;
        queue = queue.then(async () => {
          try {
            if (key) await credentials.set(id, key);
            else await credentials.remove(id);
            saved = key;
            loaded = true;
            onCredentialsChanged?.(id);
            if (stillCurrent()) {
              input.value = key;
              edited = false;
              status.textContent = key ? "Key saved." : "Key removed.";
            }
          } catch {
            if (stillCurrent()) status.textContent = "Could not save the key. Check its value and unlock Firefox credential storage, then leave the field to retry.";
          } finally {
            if (request2 === requests) pending = void 0;
          }
        });
      };
      const group = el("div");
      group.className = "dw-setting-row";
      root.append(group);
      const providerLabel = providers.get(id).label, row = el("label", providerLabel + " API key"), input = el("input");
      input.id = `dw-key-${id}`;
      row.htmlFor = input.id;
      input.type = "password";
      input.autocomplete = "off";
      input.maxLength = 512;
      input.placeholder = "Paste a key; clear to remove";
      const keyField = el("div");
      keyField.className = "dw-key-field";
      row.append(keyField);
      keyField.append(input);
      group.append(row);
      const reveal = el("button");
      reveal.type = "button";
      reveal.className = "dw-key-reveal";
      const eye = document2.createElementNS("http://www.w3.org/2000/svg", "svg");
      eye.setAttribute("viewBox", "0 0 24 24");
      eye.setAttribute("aria-hidden", "true");
      for (const data of ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"]) {
        const path = document2.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", data);
        eye.append(path);
      }
      reveal.append(eye);
      keyField.append(reveal);
      const status = el("p");
      status.dataset.keyStatus = id;
      status.id = `dw-key-status-${id}`;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      input.setAttribute("aria-describedby", status.id);
      row.append(status);
      conceal();
      reveal.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        reveal.setAttribute("aria-label", `${show ? "Hide" : "Show"} ${providerLabel} API key`);
        reveal.setAttribute("aria-pressed", String(show));
      });
      let queue = Promise.resolve(), saved = "", pending, version = 0, requests = 0, loaded = false, edited = false;
      input.addEventListener("input", () => {
        version++;
        edited = true;
        status.textContent = "Changes save when you leave this field.";
      });
      input.addEventListener("change", commit);
      input.addEventListener("blur", commit);
      async function refresh() {
        conceal();
        const current = ++version;
        input.disabled = true;
        status.textContent = "Loading saved key…";
        try {
          await queue;
          const key = await credentials.get(id);
          if (disposed2 || current !== version) return;
          saved = key || "";
          input.value = saved;
          loaded = true;
          edited = false;
          pending = void 0;
          status.textContent = "";
        } catch {
          if (!disposed2 && current === version) {
            loaded = false;
            status.textContent = "Could not load the saved key. Unlock Firefox credential storage and reopen Configure, or enter a replacement key.";
          }
        } finally {
          if (!disposed2 && current === version) input.disabled = false;
        }
      }
      keyControls.push({ input, refresh, conceal });
    }
    const info = el("button", "Get a Merriam-Webster API key");
    info.type = "button";
    info.className = "dw-key-help";
    info.addEventListener("click", () => browserWindow().openTrustedLinkIn("https://dictionaryapi.com/register/index", "tab"));
    root.append(info, error);
    const lexicalaInfo = el("button", "Get a Lexicala API key");
    lexicalaInfo.type = "button";
    lexicalaInfo.className = "dw-key-help";
    lexicalaInfo.addEventListener("click", () => browserWindow().openTrustedLinkIn("https://rapidapi.com/kdictionaries/api/lexicala1", "tab"));
    root.insertBefore(lexicalaInfo, error);
    root.insertBefore(el("p", "Lexicala Hebrew is a test integration. Subscribe to Lexicala on RapidAPI, save its X-RapidAPI-Key above, then select it as your Hebrew dictionary. It searches only when you submit a word; typing uses no quota. Check the provider’s current plan limits and display terms."), error);
    function reset() {
      for (const control of keyControls) void control.refresh();
      recording = false;
      binding = readSettings(prefs).shortcut;
      field.value = bindingLabel(binding);
      const conflict = findConflict(browserWindow(), binding);
      error.textContent = conflict ? `Shortcut inactive. ${conflict}` : "";
    }
    reset();
    return { element: root, reset, destroy() {
      disposed2 = true;
      for (const control of keyControls) {
        control.conceal();
        control.input.value = "";
      }
      recording = false;
      root.remove();
    } };
  }

  // project:src/sine-settings.mjs
  function createSineSettingsBridge(window2, options) {
    const { document: document2 } = window2;
    let controls, container, dialog, disposed2 = false;
    const style = document2.createElementNS("http://www.w3.org/1999/xhtml", "link");
    style.rel = "stylesheet";
    style.href = "chrome://sine/content/define-word/style.css?v=0.3.0";
    document2.documentElement.append(style);
    const reset = () => controls?.reset();
    function openRequestedDialog() {
      if (new URL(window2.location.href).searchParams.get("defineWordSettings") !== "1" || document2.documentElement.hasAttribute("data-define-word-settings-shown")) return;
      const button = container?.closest("[mod-id]")?.querySelector(".sineItemConfigureButton");
      if (!button) return;
      document2.documentElement.setAttribute("data-define-word-settings-shown", "");
      button.click();
    }
    function unmount() {
      dialog?.removeEventListener("close", reset);
      controls?.destroy();
      controls = container = dialog = null;
    }
    function mount() {
      if (disposed2) return;
      const next = document2.querySelector('[mod-id="define-word"] .sineItemPreferenceDialogContent');
      if (next === container && controls?.element.isConnected) {
        if (container.lastElementChild !== controls.element) container.append(controls.element);
        openRequestedDialog();
        return;
      }
      unmount();
      if (!next) return;
      container = next;
      controls = createSettingsControls(window2, options);
      container.append(controls.element);
      dialog = container.closest("dialog");
      dialog?.addEventListener("close", reset);
      openRequestedDialog();
    }
    const observer2 = new window2.MutationObserver((records) => {
      mount();
      if (records.some((record) => record.type === "attributes" && record.target === dialog) && dialog?.open) controls?.reset();
    });
    observer2.observe(document2.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    mount();
    return { destroy() {
      if (disposed2) return;
      disposed2 = true;
      observer2.disconnect();
      unmount();
      style.remove();
    } };
  }

  // project:src/credentials.sys.mjs
  var ORIGIN = "https://define-word.invalid";
  var allowed = /* @__PURE__ */ new Set(["mw-collegiate", "mw-learners", "lexicala-he"]);
  function createCredentials(manager, createLogin) {
    async function check(provider) {
      if (!allowed.has(provider)) throw new Error("Unsupported credential provider");
      await manager.initializationPromise;
      if (!manager.isLoggedIn) throw new Error("credential-unavailable");
    }
    async function find(provider) {
      await check(provider);
      return typeof manager.searchLoginsAsync === "function" ? manager.searchLoginsAsync({ origin: ORIGIN, httpRealm: `define-word:${provider}` }) : manager.findLogins(ORIGIN, null, `define-word:${provider}`);
    }
    return {
      async get(provider) {
        try {
          return (await find(provider))[0]?.password || null;
        } catch {
          throw new Error("credential-unavailable");
        }
      },
      async set(provider, key) {
        if (typeof key !== "string" || !key.trim() || key.length > 512) throw new Error("Enter a valid API key.");
        try {
          const existing = await find(provider);
          const login = createLogin({ origin: ORIGIN, formActionOrigin: null, httpRealm: `define-word:${provider}`, username: "api-key", password: key.trim(), usernameField: "", passwordField: "" });
          if (existing.length) await (manager.modifyLoginAsync ?? manager.modifyLogin).call(manager, existing[0], login);
          else await manager.addLoginAsync(login);
        } catch {
          throw new Error("credential-unavailable");
        }
      },
      async remove(provider) {
        try {
          for (const login of await find(provider)) await (manager.removeLoginAsync ?? manager.removeLogin).call(manager, login);
        } catch {
          throw new Error("credential-unavailable");
        }
      }
    };
  }

  // project:src/entry.js
  window.__defineWord?.unload();
  var CREDENTIAL_TOPIC = "define-word-credentials-changed";
  var controller;
  var shortcut;
  var settingsBridge;
  var observer;
  var credentialObserver;
  var disposed = false;
  var owner = { unload() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("load", start);
    window.removeEventListener("unload", owner.unload);
    if (observer) Services.prefs.removeObserver(PREF, observer);
    if (credentialObserver) Services.obs.removeObserver(credentialObserver, CREDENTIAL_TOPIC);
    shortcut?.destroy();
    controller?.destroy();
    settingsBridge?.destroy();
    if (window.__defineWord === owner) delete window.__defineWord;
  } };
  window.__defineWord = owner;
  window.addEventListener("unload", owner.unload, { once: true });
  window.addUnloadListener?.(owner.unload);
  function start() {
    if (disposed || controller || settingsBridge) return;
    let selection;
    try {
      const credentials = createCredentials(Services.logins, (fields) => {
        const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init(fields.origin, fields.formActionOrigin, fields.httpRealm, fields.username, fields.password, fields.usernameField, fields.passwordField);
        return login;
      });
      if (/^about:(preferences|settings)(?:[?#]|$)/.test(window.location.href)) {
        settingsBridge = createSineSettingsBridge(window, {
          prefs: Services.prefs,
          credentials,
          browserWindow: () => window.browsingContext?.topChromeWindow || Services.wm.getMostRecentWindow("navigator:browser"),
          onCredentialsChanged: (id) => Services.obs.notifyObservers(null, CREDENTIAL_TOPIC, id)
        });
        return;
      }
      const { acquireSelectionService } = ChromeUtils.importESModule("chrome://sine/content/define-word/src/selection.sys.mjs?v=0.3.0");
      selection = acquireSelectionService();
      const lookup = createLookupService({
        providers,
        credentials,
        fetch: window.fetch.bind(window),
        timers: window,
        parseDocument: (html) => new window.DOMParser().parseFromString(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">` + html, "text/html")
      });
      controller = createController(window, {
        providers,
        selection,
        lookup,
        settings: () => readSettings(Services.prefs),
        saveProvider(language, id) {
          Services.prefs.setStringPref(`${PREF}${language === "he" ? "hebrew" : "english"}`, id);
        },
        loadPopupSize() {
          try {
            return JSON.parse(Services.prefs.getStringPref(`${PREF}popup-size`, ""));
          } catch {
            return null;
          }
        },
        savePopupSize(size) {
          Services.prefs.setStringPref(`${PREF}popup-size`, size ? JSON.stringify(size) : "");
        }
      });
      shortcut = createShortcut(window, { binding: readSettings(Services.prefs).shortcut, onInvoke: () => {
        void controller.define();
      }, onConflict: () => {
      } });
      observer = { observe() {
        const settings = readSettings(Services.prefs);
        controller.updateAppearance(settings);
        shortcut.update(settings.shortcut);
      } };
      Services.prefs.addObserver(PREF, observer);
      credentialObserver = { observe(_subject, _topic, id) {
        controller.credentialsChanged(id);
      } };
      Services.obs.addObserver(credentialObserver, CREDENTIAL_TOPIC);
    } catch {
      if (!controller) selection?.release();
      owner.unload();
      console.error("[Define Word] Could not initialize browser integration.");
    }
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
