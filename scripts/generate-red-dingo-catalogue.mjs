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
// Le PDF français et les visuels officiels corrigent quelques anciens codes du JSON-LD sauvegardé.
const correctedReferences = new Map([['01-FF', '01-FP'], ['01-OS', '01-OB']]);
const elevenColourReferences = new Set([
  '01-BO', '01-BN', '01-BB', '01-DG', '01-DH', '01-ST', '01-FW', '01-PP', '01-PC', '01-DA', '01-MU',
  '01-FH', '01-HT', '01-SK', '01-XB', '01-TA', '01-AW', '01-TF', '01-TH', '01-ZF', '01-CR', '01-HS',
]);
const catTagReferences = new Set(['01-KT', '01-MS', '01-FI', '01-FB']);
const doubleSidedReferences = new Set([
  '0T-BN', '0T-HT', '0T-CL', '0T-RT',
  '08-BN', '08-HT', '08-BI', '08-RT', '08-CL', '08-FI',
  '02-BN', '02-CL', '02-HT', '02-RT', '02-FI', '02-CH',
  '03-BN', '03-CL', '03-HT',
]);
const categoryOrder = [
  'Émaillées - couleur imposée', 'Émaillées - 11 couleurs', 'Médailles chat - 11 couleurs',
  'Paillettes - 7 couleurs', 'Alphabet', 'Acier inoxydable plat', 'Laiton plat',
  'Titanium', 'Diamante',
];
const findLocalImage = (reference) => {
  const prefix = `${reference}-`.toLowerCase();
  return localFiles.find((file) => file.toLowerCase().startsWith(prefix)) || null;
};
const categoryFor = (product) => {
  const reference = product.productID;
  const price = Number(product?.offers?.price);
  if (price === 16.95 && reference.startsWith('0X-')) return 'Paillettes - 7 couleurs';
  if (price === 16.95 && reference.startsWith('02-')) return 'Acier inoxydable plat';
  if (price === 16.95 && reference.startsWith('03-')) return 'Laiton plat';
  if (price === 16.95 && elevenColourReferences.has(reference)) return 'Émaillées - 11 couleurs';
  if (price === 16.95 && catTagReferences.has(reference)) return 'Médailles chat - 11 couleurs';
  if (price === 16.95 && reference.startsWith('01-')) return 'Émaillées - couleur imposée';
  if (price === 27.95 && reference.startsWith('08-')) return 'Diamante';
  if (price === 27.95 && reference.startsWith('0T-')) return 'Titanium';
  return null;
};

const products = catalogue.itemListElement
  .map((product) => {
    const reference = correctedReferences.get(product.productID) || product.productID;
    const image = reference && findLocalImage(reference);
    const category = categoryFor({ ...product, productID: reference });
    if (!reference || !image || !category) return null;
    return {
      reference,
      name: product.name.replace(/^((Diamante|Titanium) )?ID Tag /i, ''),
      category,
      price: Number(product.offers.price),
      color: product.color || '',
      image: `models/${image}`,
      elevenColours: elevenColourReferences.has(reference) || catTagReferences.has(reference),
      smallOnly: catTagReferences.has(reference),
      glitterColours: reference.startsWith('0X-'),
      doubleSided: doubleSidedReferences.has(reference),
    };
  })
  .filter(Boolean);

const manualProducts = [
  ['01-HN', 'Cœur', 'Dark Blue', '01-HN-DB.jpg'], ['01-HP', 'Cœur', 'Purple', '01-HP-PU.jpg'], ['01-HB', 'Cœur', 'Black', '01-HB-BB.jpg'],
  ['01-BL', 'Papillon', 'Light Blue', '01-BL-LB.jpg'], ['01-BP', 'Papillon', 'Pink', '01-BP-PK.jpg'],
  ['01-CB', 'Camouflage', 'Dark Blue', '01-CB-DB.jpg'], ['01-CP', 'Camouflage', 'Pink', '01-CP-PK.jpg'], ['01-DN', 'Dragon', 'Black', '01-DN-BB.jpg'],
  ['01-DO', 'Donut', 'Pink', '01-DO-PK.jpg'],
  ['01-EL', 'Abeille', 'Light Blue', '01-EL-LB.jpg'], ['01-EP', 'Abeille', 'Pink', '01-EP-PK.jpg'],
  ['01-FD', 'BFF', 'Light Blue', '01-FD-LB.jpg'],
  ['01-ON', 'Boss', 'Dark Blue', '01-ON-DB.jpg'], ['01-OP', 'Boss', 'Pink', '01-OP-PK.jpg'],
  ['01-MO', 'Monstre', 'Dark Blue', '01-MO-DB.jpg'], ['01-MO', 'Monstre', 'Pink', '01-MO-PK.jpg'], ['01-MO', 'Monstre', 'Green', '01-MO-GR.jpg'],
  ['01-CK', 'Cookie', 'Light Blue', '01-CK-LB.jpg'], ['01-CK', 'Cookie', 'Pink', '01-CK-PK.jpg'],
].map(([reference, name, color, expectedImage]) => {
  const image = localFiles.find((file) => file.toLowerCase() === expectedImage.toLowerCase());
  return image && { id: image.replace(/\.[^.]+$/, ''), reference, name, category: 'Émaillées - couleur imposée', price: 16.95, color, image: `models/${image}` };
}).filter(Boolean);
products.push(...manualProducts);

const alphabetImage = 'menu-alphabet-tags.jpg';
if (localFiles.includes(alphabetImage)) products.splice(categoryOrder.indexOf('Alphabet'), 0, {
  reference: '1J + lettre', name: 'Alphabet (A-Z)', category: 'Alphabet', price: 16.95,
  color: 'Rouge', image: `models/${alphabetImage}`, alphabet: true,
});

products.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.name.localeCompare(b.name, 'fr') || a.color.localeCompare(b.color, 'fr'));

fs.writeFileSync(outputFile, `${JSON.stringify(products, null, 2)}\n`);
console.log(`${products.length} modèles fiables générés.`);
