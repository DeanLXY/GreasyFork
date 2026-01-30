# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of Greasemonkey/Tampermonkey user scripts designed to enhance web browsing experiences on specific Chinese websites. Each script is a standalone JavaScript file that injects functionality into targeted web pages.

## Repository Structure

```
GreasyFork/
├── scripts/                    # User scripts
│   ├── 12306_check_status.js  # Train ticket monitoring for 12306.cn
│   ├── audio_speed_controller.js # Audio speed control for tingshuw.com
│   ├── code_goto_hpx.js       # Git to HPX integration for Meituan internal
│   └── mt_code_pr_review.js   # PR review automation for Meituan internal
└── images/                    # Screenshot documentation
```

## Script Development Guidelines

### Script Metadata Headers
Each script must begin with proper Greasemonkey metadata:
```javascript
// ==UserScript==
// @name         Script Name
// @namespace    http://tampermonkey.net/
// @version      x.x.x
// @description  Brief description
// @author       Name
// @match        https://target-domain.com/*
// @grant        none
// @license      MIT
// ==/UserScript==
```

### Common Patterns in Scripts

1. **jQuery Usage**: Scripts use jQuery via CDN injection pattern:
   ```javascript
   var script = document.createElement('script');
   script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
   script.onload = function() {
       // Script logic here
   };
   document.head.appendChild(script);
   ```

2. **Local Storage**: Scripts persist user preferences using localStorage:
   ```javascript
   localStorage.setItem('key', JSON.stringify(data));
   var saved = JSON.parse(localStorage.getItem('key') || '{}');
   ```

3. **Native Browser Notifications**:
   ```javascript
   new Notification('Title', { body: 'Message', icon: 'icon.png' });
   ```

4. **UI Panel Creation**: Most scripts inject visual panels using jQuery DOM manipulation

## Testing and Development

- **No Build Process**: Scripts are standalone JavaScript files
- **No Automated Tests**: Testing is manual via browser extension loading
- **Installation**: Users install directly via Tampermonkey/Greasemonkey

## Key Script Features

### 12306_check_status.js
- Monitors train ticket availability on China's railway booking site
- Features custom train selection panel and browser notifications
- Version tracking in PR comments

### mt_code_pr_review.js
- Automates Meituan internal PR review workflow
- Includes logging and changelog functionality
- Version history maintained within the script

## Important Notes

- All scripts are in Chinese language
- Scripts target specific internal/external Chinese websites
- No external dependencies beyond jQuery CDN
- Each script is self-contained with inline documentation