import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOAD_ROOT = path.join('E:/OpenCode/vc-work');

// --- Helper Functions ---

// 1. Hash Image for Deduplication
async function getImageHash(buffer) {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
}

// 2. Find Largest Image from srcset
function getLargestImage(imgElement) {
    const src = imgElement.attribs['src'];
    const srcset = imgElement.attribs['srcset'];
    
    if (!srcset) return src;

    const candidates = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        const url = parts[0];
        const width = parts.length > 1 ? parseInt(parts[1].replace('w', '')) : 0;
        return { url, width };
    });

    candidates.sort((a, b) => b.width - a.width);
    return candidates[0].url;
}

// 3. Download and Save Image
async function downloadImage(url, savePath) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const hash = await getImageHash(buffer);
        
        // Check local deduplication (simplified: check if hash filename exists in ANY folder? 
        // For now, we check in the current target folder or use a global db)
        // Let's stick to filename=hash for easy checking.
        
        const ext = path.extname(url).split('?')[0] || '.jpg';
        const filename = `${hash}${ext}`;
        const filePath = path.join(savePath, filename);

        if (await fs.pathExists(filePath)) {
            console.log(chalk.yellow(`  [Skip] Duplicate found: ${filename}`));
            return null;
        }

        // Check size (Must be >= 380KB)
        const sizeKB = buffer.length / 1024;
        if (sizeKB < 380) {
            console.log(chalk.gray(`  [Skip] Too small (${sizeKB.toFixed(1)} KB): ${path.basename(url)}`));
            return null;
        }

        await fs.writeFile(filePath, buffer);
        console.log(chalk.green(`  [Saved] ${filename} (${sizeKB.toFixed(1)} KB)`));
        return filePath;
    } catch (error) {
        console.error(chalk.red(`  [Error] Failed to download ${url}: ${error.message}`));
        return null;
    }
}

// 4. Save Article as HTML
async function saveArticle(url, htmlContent, savePath) {
    const doc = new JSDOM(htmlContent, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article) {
        console.log(chalk.yellow('  [Warn] Readability could not parse article content. Saving raw HTML.'));
        await fs.writeFile(path.join(savePath, 'full_page.html'), htmlContent);
        return;
    }

    const cleanHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${article.title}</title>
<style>body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; } img { max-width: 100%; height: auto; }</style>
</head>
<body>
<h1>${article.title}</h1>
<p><em>By ${article.byline || 'Unknown'}</em></p>
<hr>
${article.content}
</body>
</html>`;

    const filename = `${article.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.html`;
    await fs.writeFile(path.join(savePath, filename), cleanHtml);
    console.log(chalk.green(`  [Saved Article] ${filename}`));
}

// --- Main Logic ---

async function main() {
    program
        .option('-u, --url <type>', 'URL to scrape')
        .option('--daily', 'Look for daily updates')
        .parse(process.argv);

    const options = program.opts();
    let url = options.url || program.args[0];

    if (!url) {
        const answers = await inquirer.prompt([{
            type: 'input',
            name: 'url',
            message: 'Please enter the website URL to scrape:',
            validate: input => input.startsWith('http') ? true : 'Must start with http/https'
        }]);
        url = answers.url;
    }

    console.log(chalk.blue(`\n🚀 Analyzing ${url}...`));

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); // Better for srcset resolution
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        const content = await page.content();
        const $ = cheerio.load(content);

        // 1. Find Content Candidates (Articles / Galleries)
        // Heuristic: Look for links with images or common article class names
        const candidates = [];
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim() || $(el).find('img').attr('alt') || 'Untitled';
            const img = $(el).find('img').attr('src');
            
            if (href && (href.includes('article') || href.includes('post') || href.includes('blog') || img)) {
                // De-dupe by URL
                if (!candidates.find(c => c.href === href)) {
                    candidates.push({ title, href, hasImage: !!img });
                }
            }
        });

        if (candidates.length === 0) {
            console.log(chalk.yellow('No obvious articles or galleries found. Extracting images from current page...'));
            // Fallback: Just get images from current page
        } else {
            // Check for auto mode or non-interactive environment
            const autoMode = true; // Force auto-select for Agent interaction

            let selectedUrls = [];
            if (autoMode) {
                console.log(chalk.green('  [Auto] Selecting all 15 candidates...'));
                selectedUrls = candidates.slice(0, 15).map(c => c.href);
            } else {
                // 2. Ask User to Select
                const choices = candidates.slice(0, 15).map(c => ({
                    name: `${c.hasImage ? '🖼️' : '📄'} ${c.title} (${c.href})`,
                    value: c.href
                }));

                const answer = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'selectedUrls',
                    message: 'Found these potential items. Select ones to download:',
                    choices: choices
                }]);
                selectedUrls = answer.selectedUrls;
            }

            if (selectedUrls.length > 0) {
                for (const link of selectedUrls) {
                    const absoluteUrl = new URL(link, url).href;
                    console.log(chalk.cyan(`\nProcessing: ${absoluteUrl}`));
                    await processPage(browser, absoluteUrl);
                }
            }
        }
        
        // Always process current page if requested or as fallback
        // await processPage(browser, url); // Optional based on flow

    } catch (e) {
        console.error(chalk.red(`Fatal Error: ${e.message}`));
    } finally {
        await browser.close();
    }
}

async function processPage(browser, url) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const content = await page.content();
    const $ = cheerio.load(content);

    // Setup Download Folder
    const domain = new URL(url).hostname;
    const date = new Date().toISOString().split('T')[0];
    const savePath = path.join(DOWNLOAD_ROOT, domain, date);
    await fs.ensureDir(savePath);

    // 1. Save Article Text (DISABLED)
    // await saveArticle(url, content, savePath);

    // 2. Find and Save Images
    const images = [];
    $('img').each((i, el) => {
        const largestSrc = getLargestImage(el);
        if (largestSrc && !largestSrc.startsWith('data:')) {
            images.push(new URL(largestSrc, url).href);
        }
    });

    console.log(chalk.blue(`  Found ${images.length} images. Checking sizes...`));
    
    // Download in parallel with concurrency limit (e.g., 5)
    // Simple loop for now
    for (const imgUrl of images) {
        await downloadImage(imgUrl, savePath);
    }
    
    await page.close();
}

main();
