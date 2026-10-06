"use strict";

const fs = require("node:fs");
const path = require("node:path");
const document = require("../legal/cgv-2026-10-05.json");

function inline(value) {
  const escaped = String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

function renderBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === "h2") return `<h2>${inline(block.text)}</h2>`;
    if (block.type === "h3") {
      const match = /^Article (\d+)/.exec(block.text);
      return `<h3${match ? ` id="article-${match[1]}"` : ""}>${inline(block.text)}</h3>`;
    }
    if (block.type === "p") return `<p>${(block.lines || [block.text]).map(inline).join("<br>")}</p>`;
    if (block.type === "ul" || block.type === "ol") return `<${block.type}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${block.type}>`;
    if (block.type === "quote") return `<blockquote>${renderBlocks(block.blocks)}</blockquote>`;
    if (block.type === "table") return `<div class="legal-table"><table><thead><tr>${block.head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    throw new Error(`Type de bloc inconnu: ${block.type}`);
  }).join("\n");
}

function pageHtml() {
  const articles = document.blocks.filter((block) => block.type === "h3" && /^Article /.test(block.text));
  const summary = articles.map((block) => { const number = /^Article (\d+)/.exec(block.text)[1]; return `<li><a href="#article-${number}">${inline(block.text)}</a></li>`; }).join("");
  return `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conditions générales de vente | Dynastie d'Orkhan</title><meta name="description" content="Conditions générales de vente de la Boutique de l'Élevage de la Dynastie d'Orkhan."><link rel="stylesheet" href="/assets/orkhan-design.css"><style>.legal{max-width:920px;margin:auto;padding:32px 20px}.legal h1,.legal h2,.legal h3{color:var(--bordeaux)}.legal-nav{padding:18px 24px;background:#fff;border:1px solid var(--line);border-radius:8px}.legal-nav ol{columns:2}.legal blockquote{margin:18px 0;padding:14px 18px;border-left:4px solid var(--or);background:#fff}.legal-table{overflow:auto}.legal table{width:100%;border-collapse:collapse}.legal th,.legal td{padding:10px;border:1px solid var(--line);vertical-align:top}.site-footer{text-align:center;padding:24px;border-top:1px solid var(--line)}</style></head><body><main class="legal"><p><a href="/">← Retour à la boutique</a></p><h1>${inline(document.title)}</h1><nav class="legal-nav" aria-label="Sommaire"><h2>Sommaire</h2><ol>${summary}</ol></nav>${renderBlocks(document.blocks)}</main><footer class="site-footer"><a href="/conditions-generales-de-vente/">Conditions générales de vente</a> · <a href="/confidentialite/">Politique de confidentialité</a> · <a href="/mentions-legales/">Mentions légales</a></footer></body></html>\n`;
}

const output = path.join(process.cwd(), "conditions-generales-de-vente", "index.html");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, pageHtml(), "utf8");

module.exports = { inline, renderBlocks, pageHtml };

