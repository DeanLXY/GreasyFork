// ==UserScript==
// @name         划词翻译助手
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  鼠标划词显示翻译结果，基于有道翻译API
// @author       DeanLXY
// @match        *://*/*
// @exclude      *://*.baidu.com/*
// @exclude      *://*.google.com/*
// @exclude      *://*.bing.com/*
// @exclude      *://*.youdao.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @require      https://cdn.bootcdn.net/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @license      MIT
// ==/UserScript==

(function() {     
    'use strict';

    // 有道翻译API配置
    const YOUDAO_CONFIG = {
        APP_KEY: '72da82e61c4937a8', // 公共测试用appKey，建议用户申请自己的
        APP_SECRET: 'sZVpsfwJHiLoDauHMomhiAZeKFLhadh9', // 公共测试用密钥
        API_URL: 'https://openapi.youdao.com/api',
    };

    // 根据input和APP_SECRET计算出的加密sign
    const getSign = (q, salt, curtime) => {
        try {
            console.log(">>> getsign "+ YOUDAO_CONFIG.APP_KEY +": "+ getTruncate(q) + ": "+ salt + ": "+ curtime + ": "+ YOUDAO_CONFIG.APP_SECRET)
            const str = YOUDAO_CONFIG.APP_KEY + getTruncate(q) + salt + curtime + YOUDAO_CONFIG.APP_SECRET;
            return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex);
        } catch (e) {
            console.error('CryptoJS SHA256 error:', e);
            // 返回一个临时签名，避免脚本崩溃
            return 'temp_sign_' + salt;
        }
    };

    const getTruncate = (q) => {
        const len = q.length;
        return len <= 20 ? q :
               len <= 40 ? q.substring(0, 10) + q.length + q.substring(len - 10) :
               q.substring(0, 10) + q.length + q.substring(len - 10);
    };

    // 通用配置
    const CONFIG = {
        TIMEOUT: 5000,
        POSITION_OFFSET: { x: 10, y: 10 },
        MAX_CACHE_SIZE: 1000,
        AUTO_HIDE_DELAY: 3000,
        SUPPORT_LANG: {
            'auto': '自动检测',
            'zh-CHS': '中文',
            'en': '英文',
            'ja': '日文',
            'ko': '韩文',
            'fr': '法文',
            'de': '德文',
            'es': '西班牙文',
            'ru': '俄文',
            'pt': '葡萄牙文',
            'it': '意大利文'
        }
    };

    // 缓存管理
    class TranslationCache {
        constructor(maxSize = CONFIG.MAX_CACHE_SIZE) {
            this.maxSize = maxSize;
            this.cache = new Map();
            this.loadFromStorage();
        }

        set(key, value) {
            if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(key, value);
            this.saveToStorage();
        }

        get(key) {
            return this.cache.get(key);
        }

        saveToStorage() {
            const cacheObj = {};
            for (let [k, v] of this.cache) {
                cacheObj[k] = v;
            }
            GM_setValue('translation_cache', cacheObj);
        }

        loadFromStorage() {
            const cacheObj = GM_getValue('translation_cache', {});
            for (let [k, v] of Object.entries(cacheObj)) {
                this.cache.set(k, v);
            }
        }
    }

    // 翻译管理器
    class TranslationManager {
        constructor() {
            this.cache = new TranslationCache();
            this.initUI();
            this.bindEvents();
        }

        initUI() {
            // 创建翻译弹窗
            const popup = document.createElement('div');
            popup.id = 'selection-translate-popup';
            popup.innerHTML = `
                <div class="translate-header">
                    <span class="translate-title">划词翻译</span>
                    <div class="header-actions">
                        <button class="translate-pronounce" title="发音">🔊</button>
                        <button class="translate-settings" title="设置">⚙️</button>
                        <button class="translate-close">&times;</button>
                    </div>
                </div>
                <div class="translate-loading" style="display:none">
                    <div class="loading-spinner"></div>
                    <span>正在查询...</span>
                </div>
                <div class="translate-result"></div>
                <div class="translate-footer">
                    <div class="translate-target-lang">
                        <select class="lang-selector"></select>
                    </div>
                    <div class="api-notice" style="display:none">
                        <span class="notice-icon">⚠️</span> 使用默认API，建议<a href="#" class="set-api-link">设置专属API</a>
                    </div>
                </div>
            `;

            // 添加语言选项
            const langSelector = popup.querySelector('.lang-selector');
            Object.entries(CONFIG.SUPPORT_LANG).forEach(([code, name]) => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = name;
                langSelector.appendChild(option);
            });

            // 添加样式
            const style = document.createElement('style');
            style.textContent = `
                #selection-translate-popup {
                    position: absolute;
                    background: #fff;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    padding: 16px;
                    min-width: 300px;
                    max-width: 400px;
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    font-size: 14px;
                    color: #333;
                    line-height: 1.5;
                    display: none;
                    animation: translateFadeIn 0.2s ease-out;
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }

                @keyframes translateFadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .translate-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #f0f0f0;
                }

                .translate-title {
                    font-weight: 600;
                    color: #1890ff;
                }

                .translate-close {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: all 0.2s;
                }

                .translate-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }

                .translate-loading {
                    text-align: center;
                    padding: 20px;
                    color: #666;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .loading-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #1890ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .translate-result {
                    margin-bottom: 12px;
                    max-height: 300px;
                    overflow-y: auto;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }

                .translate-result .original {
                    padding: 8px 12px;
                    margin-bottom: 12px;
                    font-size: 13px;
                    color: #666;
                    background: #f8f9fa;
                    border-radius: 4px;
                    position: relative;
                    line-height: 1.5;
                    max-height: 100px;
                    overflow-y: auto;
                    cursor: text;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }

                .translate-result .original {
                    padding: 8px 12px;
                    margin-bottom: 12px;
                    font-size: 13px;
                    color: #666;
                    background: #f8f9fa;
                    border-radius: 4px;
                    position: relative;
                    line-height: 1.5;
                    max-height: 100px;
                    overflow-y: auto;
                }

                .translate-result .original::before {
                    content: "原文";
                    position: absolute;
                    top: -8px;
                    left: 8px;
                    font-size: 11px;
                    color: #999;
                    background: #fff;
                    padding: 0 4px;
                    border-radius: 2px;
                    border: 1px solid #e8e8e8;
                }

                .translate-result .translation {
                    font-size: 16px;
                    line-height: 1.6;
                    color: #333;
                    font-weight: 500;
                    margin-bottom: 12px;
                    cursor: text;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }

                .translate-result .phonetic {
                    color: #666;
                    font-size: 13px;
                    margin-bottom: 8px;
                    font-style: italic;
                    cursor: text;
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    -ms-user-select: text;
                }

                .translate-result .web-translations {
                    margin-top: 8px;
                    padding: 8px;
                    background: #fafafa;
                    border-radius: 4px;
                    font-size: 12px;
                }

                .translate-result .web-translations .web-item {
                    margin-bottom: 4px;
                }

                .translate-result .web-translations .web-item .web-key {
                    font-weight: 600;
                    color: #1890ff;
                }

                .translate-result .web-translations .web-item .web-value {
                    color: #666;
                    margin-left: 8px;
                }

                .translate-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 12px;
                    padding-top: 8px;
                    border-top: 1px solid #f0f0f0;
                    font-size: 12px;
                    color: #666;
                }

                .translate-target-lang {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .lang-selector {
                    padding: 4px 8px;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    font-size: 12px;
                    background: #fff;
                    cursor: pointer;
                }

                .lang-selector:hover {
                    border-color: #1890ff;
                }

                .api-notice {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: #fa8c16;
                    font-size: 11px;
                }

                .notice-icon {
                    font-size: 12px;
                }

                .set-api-link {
                    color: #1890ff;
                    text-decoration: none;
                    font-size: 11px;
                }

                .set-api-link:hover {
                    text-decoration: underline;
                }

                .header-actions {
                    display: flex;
                    gap: 4px;
                    align-items: center;
                }

                .header-actions button {
                    background: none;
                    border: none;
                    padding: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                    border-radius: 4px;
                }

                .header-actions button:hover {
                    opacity: 1;
                    background: #f5f5f5;
                }

                .translate-close {
                    background: none !important;
                    border: none !important;
                    font-size: 20px !important;
                    cursor: pointer;
                    color: #999 !important;
                    padding: 0 !important;
                    width: 24px !important;
                    height: 24px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    border-radius: 4px !important;
                    transition: all 0.2s !important;
                }

                .translate-close:hover {
                    background: #f5f5f5 !important;
                    color: #333 !important;
                }

                .error-message {
                    text-align: center;
                    padding: 16px;
                    color: #ff4d4f;
                    background: #fff2f0;
                    border: 1px solid #ffccc7;
                    border-radius: 4px;
                }

                .error-message .error-code {
                    font-size: 12px;
                    color: #999;
                    margin-top: 4px;
                }

                .settings-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                    padding: 24px;
                    width: 400px;
                    z-index: 2147483648;
                    display: none;
                }

                .settings-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 2147483647;
                    display: none;
                }

                .settings-header {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 16px;
                    color: #333;
                }

                .settings-section {
                    margin-bottom: 16px;
                }

                .settings-section label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 13px;
                    color: #666;
                }

                .settings-section input {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    font-size: 13px;
                    box-sizing: border-box;
                }

                .settings-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }

                .settings-buttons button {
                    padding: 6px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }

                .settings-buttons .save {
                    background: #1890ff;
                    color: #fff;
                }

                .settings-buttons .cancel {
                    background: #f0f0f0;
                    color: #666;
                }

                .settings-buttons .save:hover {
                    background: #40a9ff;
                }

                .settings-buttons .cancel:hover {
                    background: #e0e0e0;
                }

                .settings-note {
                    font-size: 12px;
                    color: #999;
                    margin-bottom: 12px;
                    line-height: 1.4;
                }
            `;

            document.head.appendChild(style);
            document.body.appendChild(popup);

            this.popup = popup;
            this.initSettingsModal();
        }

        initSettingsModal() {
            const modal = document.createElement('div');
            modal.className = 'settings-modal';
            modal.innerHTML = `
                <div class="settings-header">翻译API设置</div>
                <div class="settings-note">
                    使用公共API密钥可能有访问限制。建议到<a href="https://ai.youdao.com" target="_blank">有道智云控制台</a>申请自己的API密钥。
                </div>
                <div class="settings-section">
                    <label>有道API AppKey:</label>
                    <input type="text" class="appkey-input" placeholder="输入你的有道AppKey">
                </div>
                <div class="settings-section">
                    <label>有道API AppSecret:</label>
                    <input type="password" class="appsecret-input" placeholder="输入你的有道AppSecret">
                </div>
                <div class="settings-buttons">
                    <button class="cancel">取消</button>
                    <button class="save">保存</button>
                </div>
            `;

            const overlay = document.createElement('div');
            overlay.className = 'settings-overlay';

            document.body.appendChild(modal);
            // document.body.appendChild(overlay);

            this.settingsModal = modal;
            this.settingsOverlay = overlay;

            // 加载已保存的设置
            const savedKey = GM_getValue('youdao_appkey', YOUDAO_CONFIG.APP_KEY);
            const savedSecret = GM_getValue('youdao_appsecret', YOUDAO_CONFIG.APP_SECRET);
            modal.querySelector('.appkey-input').value = savedKey;
            modal.querySelector('.appsecret-input').value = savedSecret;

            // 绑定事件
            modal.querySelector('.save').onclick = () => {
                const appkey = modal.querySelector('.appkey-input').value.trim();
                const appsecret = modal.querySelector('.appsecret-input').value.trim();

                if (appkey && appsecret) {
                    GM_setValue('youdao_appkey', appkey);
                    GM_setValue('youdao_appsecret', appsecret);
                    YOUDAO_CONFIG.APP_KEY = appkey;
                    YOUDAO_CONFIG.APP_SECRET = appsecret;
                    alert('设置已保存！');
                }
                this.hideSettings();
            };

            modal.querySelector('.cancel').onclick = () => this.hideSettings();
            overlay.onclick = () => this.hideSettings();
        }

        showSettings() {
            this.settingsModal.style.display = 'block';
            this.settingsOverlay.style.display = 'block';
        }

        hideSettings() {
            this.settingsModal.style.display = 'none';
            this.settingsOverlay.style.display = 'none';
        }

        bindEvents() {
            let mouseX = 0;
            let mouseY = 0;
            let lastSelection = '';
            let hideTimeout = null;

            // 监听鼠标位置
            document.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
            });

            // 监听文本选择
            document.addEventListener('mouseup', (e) => {
                const selection = window.getSelection().toString().trim();

                // 避免在输入框中选择
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                if (selection && selection !== lastSelection && selection.length >= 2) {
                    lastSelection = selection;

                    // 清除之前的隐藏定时器
                    if (hideTimeout) {
                        clearTimeout(hideTimeout);
                    }

                    // 延迟显示，避免误触发
                    setTimeout(() => {
                        if (window.getSelection().toString().trim() === selection) {
                            this.translate(selection, { x: mouseX, y: mouseY });
                        }
                    }, 300);
                } else if (!selection) {
                    // 如果没有选中文本，延迟隐藏弹窗
                    hideTimeout = setTimeout(() => {
                        this.hide();
                    }, CONFIG.AUTO_HIDE_DELAY);
                }
            });

            // 绑定关闭事件
            this.popup.querySelector('.translate-close').onclick = () => this.hide();

            // 阻止面板内的事件冒泡，防止选择下层文本
            this.popup.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            this.popup.addEventListener('mouseup', (e) => {
                e.stopPropagation();
            });

            this.popup.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // 双击原文复制
            this.popup.addEventListener('dblclick', (e) => {
                if (e.target.classList.contains('original')) {
                    const originalText = e.target.textContent;
                    navigator.clipboard.writeText(originalText).then(() => {
                        // 临时显示复制成功提示
                        const notice = document.createElement('div');
                        notice.textContent = '✓ 已复制';
                        notice.style.cssText = `
                            position: absolute;
                            background: #52c41a;
                            color: white;
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            z-index: 1000;
                            top: ${e.pageY - 20}px;
                            left: ${e.pageX}px;
                            pointer-events: none;
                        `;
                        document.body.appendChild(notice);
                        setTimeout(() => notice.remove(), 1000);
                    });
                }
            });

            // 监听设置按钮
            this.popup.querySelector('.translate-settings').onclick = () => this.showSettings();

            // 监听发音按钮
            this.popup.querySelector('.translate-pronounce').onclick = () => {
                const text = this.popup.querySelector('.original').textContent;
                if (text) {
                    this.speak(text);
                }
            };

            // 监听语言切换
            this.popup.querySelector('.lang-selector').onchange = (e) => {
                const lang = e.target.value;
                GM_setValue('target_lang', lang);
                if (lastSelection) {
                    this.translate(lastSelection, { x: mouseX, y: mouseY });
                }
            };

            // 键盘快捷键
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.popup.style.display === 'block') {
                    this.hide();
                }
            });

            // 记住目标语言
            const savedLang = GM_getValue('target_lang', 'zh-CHS');
            this.popup.querySelector('.lang-selector').value = savedLang;

            // 检查是否使用默认API，显示提示
            const isDefaultKey = YOUDAO_CONFIG.APP_KEY === '72da82e61c4937a8';
            const apiNotice = this.popup.querySelector('.api-notice');
            if (isDefaultKey) {
                apiNotice.style.display = 'flex';
            }

            // 绑定设置API链接
            this.popup.querySelector('.set-api-link').onclick = (e) => {
                e.preventDefault();
                this.showSettings();
            };
        }

        async translate(text, position) {
            const resultDiv = this.popup.querySelector('.translate-result');
            const loadingDiv = this.popup.querySelector('.translate-loading');

            // 检查缓存
            const targetLang = this.popup.querySelector('.lang-selector').value;
            const cacheKey = `${text}_${targetLang}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                this.showTranslation(cached, position);
                return;
            }

            // 显示加载状态
            resultDiv.style.display = 'none';
            loadingDiv.style.display = 'flex';
            this.popup.style.display = 'block';

            // 定位弹窗
            this.positionPopup(position);

            try {
                const result = await this.fetchYoudaoTranslation(text, targetLang);

                // 缓存结果
                this.cache.set(cacheKey, result);

                // 显示翻译
                loadingDiv.style.display = 'none';
                resultDiv.style.display = 'block';
                this.showTranslation(result);

            } catch (error) {
                console.log(">>> translate error : "+JSON.stringify(error.message));

                loadingDiv.style.display = 'none';
                resultDiv.style.display = 'block';

                let errorMessage = '翻译请求失败';
                let errorCode = error.message || 'unknown';

                if (error.message && typeof error.message === 'string') {
                    if (error.message.includes('201')) {
                        errorMessage = 'APP KEY无效或已过期';
                        errorCode = '201';
                    } else if (error.message.includes('202')) {
                        errorMessage = 'APP KEY被封禁或流控';
                        errorCode = '202';
                    } else if (error.message.includes('205')) {
                        errorMessage = '访问频率受限，请稍后再试';
                        errorCode = '205';
                    } else if (error.message.includes('206')) {
                        errorMessage = '余额不足，请充值';
                        errorCode = '206';
                    } else if (error.message.includes('207')) {
                        errorMessage = '源语言不支持';
                        errorCode = '207';
                    } else if (error.message.includes('208')) {
                        errorMessage = '目标语言不支持';
                        errorCode = '208';
                    } else if (error.message.includes('Network')) {
                        errorMessage = '网络连接失败，请检查网络';
                        errorCode = 'network';
                    } else {
                        errorMessage = '翻译请求失败，请重试';
                    }
                } else if (error && error.name === 'TypeError') {
                    errorMessage = '加密模块加载失败，请刷新页面重试';
                    errorCode = 'crypto-error';
                } else {
                    errorMessage = '翻译请求失败，请重试';
                }

                resultDiv.innerHTML = `
                    <div class="error-message">
                        <div>❌ ${errorMessage}</div>
                        <div class="error-code">错误信息: ${errorCode}</div>
                    </div>
                `;
            }
        }

        async fetchYoudaoTranslation(text, targetLang) {
            const salt = (new Date).getTime();
            const curtime = Math.round(new Date().getTime() / 1000).toString();

            // 等待CryptoJS加载完成或提供备用签名方案
            let sign = '';
            try {
                sign = getSign(text, salt, curtime);
            } catch (e) {
                console.warn('签名生成失败，使用备用方案:', e);
                return
            }

            // 根据有道文档，使用正确的参数名
            const formData = {
                q: text,
                from: 'auto',
                to: targetLang,
                appKey: YOUDAO_CONFIG.APP_KEY,
                salt: salt,
                sign: sign,
                signType: 'v3',
                curtime: curtime
            };
            // formData.append('q', text);
            // formData.append('from', 'auto');
            // formData.append('to', targetLang);
            // formData.append('appKey', YOUDAO_CONFIG.APP_KEY);
            // formData.append('salt', salt);
            // formData.append('sign', sign);
            // formData.append('signType', 'v3');
            // formData.append('curtime', curtime);

            console.log(">>>>>test "+JSON.stringify(formData));


            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: YOUDAO_CONFIG.API_URL,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    data: Object.keys(formData).map(key =>
                        encodeURIComponent(key) + '=' + encodeURIComponent(formData[key])
                    ).join('&'),
                    timeout: CONFIG.TIMEOUT,
                    onload: (response) => {
                        console.log("=== 完整的响应信息 ===");
                        console.log("状态码:", response.status);
                        console.log("响应文本长度:", response.responseText ? response.responseText.length : 0);
                        console.log("响应文本截断:", response.responseText ? response.responseText.substring(0, 300) : "空响应");

                        try {
                            const data = JSON.parse(response.responseText);
                            console.log("解析后的数据:", data);
                            console.log("错误码:", data.errorCode);

                            if (data.errorCode !== '0') {
                                console.error("翻译API错误信息:", data.errorMsg || data.msg || data.l);
                                reject(new Error(`API错误: ${data.errorCode} - ${data.errorMsg || data.msg || data.l}`));
                                return;
                            }

                            if (data.translation && data.translation.length > 0) {
                                console.log("翻译结果:", data.translation);
                            }
                            if (data.basic) {
                                console.log("基本释义包含:", Object.keys(data.basic));
                            }
                            if (data.web) {
                                console.log("网络释义条目数:", data.web.length);
                            }
                            if (data.errorCode === '0') {
                                const result = {
                                    original: text,
                                    translation: data.translation[0],
                                    phonetic: '',
                                    alternatives: [],
                                    webTranslations: []
                                };

                                // 处理音标
                                if (data.basic && data.basic.phonetic) {
                                    result.phonetic = data.basic.phonetic;
                                }

                                // 处理其他释义
                                if (data.basic && data.basic.explains) {
                                    result.alternatives = data.basic.explains;
                                }

                                // 处理网络释义
                                if (data.web) {
                                    result.webTranslations = data.web.map(item => ({
                                        key: item.key,
                                        value: item.value.join(', ')
                                    }));
                                }

                                resolve(result);
                            } else {
                                reject(new Error(data.errorCode));
                            }
                        } catch (e) {
                            reject(new Error('解析响应失败'));
                        }
                    },
                    onerror: (err) => reject(new Error('网络请求失败' + (err?.statusText ? ': ' + err.statusText : ''))),
                    ontimeout: () => reject(new Error('请求超时'))
                });
            });
        }

        showTranslation(result) {
            const resultDiv = this.popup.querySelector('.translate-result');

            let html = `
                <div class="original">${this.escapeHtml(result.original)}</div>
            `;

            // 音标（如果有）
            if (result.phonetic) {
                html += `<div class="phonetic">[${result.phonetic}]</div>`;
            }

            // 主翻译结果
            html += `
                <div class="translation">${this.escapeHtml(result.translation)}</div>
            `;

            // 其他释义（如果有）
            if (result.alternatives && result.alternatives.length > 0) {
                html += `
                    <div class="alternatives">
                        <strong>其他释义：</strong><br>
                        ${result.alternatives.map(alt => this.escapeHtml(alt)).join('<br>')}
                    </div>
                `;
            }

            // 网络释义（如果有）
            if (result.webTranslations && result.webTranslations.length > 0) {
                html += `
                    <div class="web-translations">
                        <strong>网络释义：</strong><br>
                        ${result.webTranslations.map(web => `
                            <div class="web-item">
                                <span class="web-key">${this.escapeHtml(web.key)}</span>
                                <span class="web-value">${this.escapeHtml(web.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            resultDiv.innerHTML = html;
        }

        positionPopup(position) {
            const rect = this.popup.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left = position.x + CONFIG.POSITION_OFFSET.x;
            let top = position.y + CONFIG.POSITION_OFFSET.y;

            // 确保不超出视口
            if (left + rect.width > viewportWidth) {
                left = viewportWidth - rect.width - 10;
            }

            if (top + rect.height > viewportHeight) {
                top = position.y - rect.height - CONFIG.POSITION_OFFSET.y;
            }

            // 确保在可视区域内
            left = Math.max(10, left);
            top = Math.max(10, top);

            this.popup.style.left = `${left}px`;
            this.popup.style.top = `${top}px`;
        }

        hide() {
            this.popup.style.display = 'none';
        }

        // 文本转语音
        speak(text) {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);

                // 检测语言
                const chineseRegex = /[\u4e00-\u9fa5]/;
                const lang = chineseRegex.test(text) ? 'zh-CN' : 'en-US';
                utterance.lang = lang;

                speechSynthesis.speak(utterance);
            } else {
                alert('您的浏览器不支持语音播报功能');
            }
        }

        // HTML转义
        escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }
    }

    // 移除旧的CryptoJS实现

    // 初始化脚本
    async function init() {
        console.log('[Selection Translate] 划词翻译助手已初始化');

        // 检查是否已存在翻译管理器
        if (window.translationManager) {
            console.log('[Selection Translate] 翻译管理器已存在，跳过初始化');
            return;
        }

        window.translationManager = new TranslationManager();
    }

    // 确保页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 注册菜单命令
    GM_registerMenuCommand('翻译设置', () => {
        if (window.translationManager) {
            window.translationManager.showSettings();
        }
    });

    GM_registerMenuCommand('使用说明', () => {
        alert('📖 划词翻译助手使用说明\n\n' +
              '1. 在任何网页上选中需要翻译的文字\n' +
              '2. 鼠标稍作停留，自动弹出翻译结果\n' +
              '3. 支持多种语言的互译\n' +
              '4. 可复制原文或语音朗读\n\n' +
              '💡 提示：\n' +
              '- 默认使用公共API，可能有访问限制\n' +
              '- 建议申请自己的有道API密钥\n' +
              '- Esc键可关闭翻译框\n' +
              '- Alt+T快捷键打开设置');
    });

})();