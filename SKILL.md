---
name: image-collector
description: |
  Collects images and articles from websites.
  Capabilities:
  1. Scrapes daily updates or recommended content.
  2. Interactively asks user to select content.
  3. Saves articles as clean HTML.
  4. Downloads images with deduplication (hash check) and max resolution selection.
  5. Auto-categorizes downloads by domain and date.
allowed-tools:
  - Bash
  - AskUserQuestion
metadata:
  trigger: "download images", "collect articles", "scrape website", "crawl images"
---

# Image Collector Skill

A smart scraping agent that helps you curate and archive content from the web.

## Usage

```bash
# Interactive mode (prompts for URL)
/image-collector

# Direct mode
/image-collector https://example.com
```

## Features

- **Smart Detection**: Identifies "Daily Updates" or major article lists.
- **Interactive Selection**: Lets you choose exactly what to download.
- **High-Res Priority**: Automatically parses `srcset` to find the largest available image version.
- **Deduplication**: Uses SHA-256 content hashing to prevent duplicate downloads, even if filenames differ.
- **Clean Archiving**: Saves articles using Mozilla's Readability engine for clutter-free HTML.

## Structure

- `scripts/collect.ts`: Main logic entry point.
- `downloads/`: Default output directory (organized by Domain/Date).
