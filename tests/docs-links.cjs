#!/usr/bin/env node
// Documentation link guard: every relative link, anchor (including cross-file
// anchors) and image reference in the docs must resolve. Run manually or in CI.
//
//   node tests/docs-links.cjs
//
// Relative paths resolve against the *directory of the file that contains the
// link*, never the cwd -- getting this wrong produces both false positives and
// silent misses.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOCS = ["README.md"];

// GitHub's anchor algorithm, good enough for Latin + CJK headings.
function slug(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-");
}

function anchorsOf(file) {
    const set = new Set();
    let inFence = false;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
        if (m) set.add(slug(m[2]));
    }
    return set;
}

const cache = new Map();
function anchors(file) {
    if (!cache.has(file)) cache.set(file, anchorsOf(file));
    return cache.get(file);
}

let broken = 0;
const fail = (msg) => {
    console.error(msg);
    broken++;
};

for (const rel of DOCS) {
    const file = path.join(ROOT, rel);
    const dir = path.dirname(file);
    const lines = fs.readFileSync(file, "utf8").split("\n");

    lines.forEach((line, i) => {
        const where = `${rel}:${i + 1}`;

        for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
            const target = m[1];
            if (/^https?:|^mailto:/.test(target)) continue;

            if (target.startsWith("#")) {
                const a = decodeURIComponent(target.slice(1));
                if (!anchors(file).has(a)) fail(`BROKEN ANCHOR ${where} -> ${target}`);
                continue;
            }

            const [p, frag] = target.split("#");
            const resolved = path.resolve(dir, decodeURIComponent(p));
            if (!fs.existsSync(resolved)) {
                fail(`MISSING FILE ${where} -> ${target}`);
                continue;
            }
            if (frag && resolved.endsWith(".md")) {
                const a = decodeURIComponent(frag);
                if (!anchors(resolved).has(a)) fail(`BROKEN ANCHOR ${where} -> ${target}`);
            }
        }

        for (const m of line.matchAll(/!?<img[^>]*src="([^"]+)"/g)) {
            const t = m[1];
            if (/^https?:/.test(t)) continue;
            if (!fs.existsSync(path.resolve(dir, t))) fail(`MISSING IMAGE ${where} -> ${t}`);
        }
    });
}

// Every image shipped in docs/ should actually be referenced somewhere.
const allDocs = DOCS.map((r) => fs.readFileSync(path.join(ROOT, r), "utf8")).join("\n");
for (const f of fs.readdirSync(path.join(ROOT, "docs"))) {
    if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(f)) continue;
    if (!allDocs.includes(f)) console.log(`note: docs/${f} is not referenced by any doc`);
}

if (broken) {
    console.error(`\n${broken} broken reference(s)`);
    process.exit(1);
}
console.log(`docs links OK (${DOCS.length} files)`);
