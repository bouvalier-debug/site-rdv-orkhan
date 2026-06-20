import fs from 'node:fs';
import path from 'node:path';

const [sourceHtml, modelsDirectory, outputFile] = process.argv.slice(2);
if (!sourceHtml || !modelsDirectory || !outputFile) {
  throw new Error('Usage: node generate-red-dingo-catalogue.mjs <page.html> <models-dir> <output.json>');
}

const html = fs.readFileSync(sourceHtml, 'utf8');
const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]));
const catalogue = scripts.find((entry) => entry?.mainEntity?.['@type'] === 'OfferCatalog')?.mainEntity;
if (!catalogue?.itemListElement) throw new Error('Catalogue JSON-LD introuvable.');

const localFiles = fs.readdirSync(modelsDirectory);
const findLocalImage = (reference) => {
  const prefix = `${reference}-`.toLowerCase();
  return localFiles.find((file) => file.toLowerCase().startsWith(prefix)) || null;
};
const categoryFor = (product) => {
  const price = Number(product?.offers?.price);
  if (price === 16.95) return 'Émaillée';
  if (price === 27.95 && /diamante/i.test(product.name)) return 'Diamante';
  if (price === 27.95 && /titanium/i.test(product.name)) return 'Titanium';
  return null;
};

const products = catalogue.itemListElement
  .map((product) => {
    const reference = product.productID;
    const image = reference && findLocalImage(reference);
    const category = categoryFor(product);
    if (!reference || !image || !category) return null;
    return {
      reference,
      name: product.name.replace(/^((Diamante|Titanium) )?ID Tag /i, ''),
      category,
      price: Number(product.offers.price),
      color: product.color || '',
      image: `models/${image}`,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr'));

fs.writeFileSync(outputFile, `${JSON.stringify(products, null, 2)}\n`);
console.log(`${products.length} modèles fiables générés.`);
