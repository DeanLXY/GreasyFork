// ==UserScript==
// @name         Git仓库一键跳转HPX
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  在Git仓库页面添加跳转到HPX打包页面的按钮
// @author       Dean
// @match        https://dev.sankuai.com/code/repo-detail/*
// @grant        GM_xmlhttpRequest
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 常量定义
    const CONFIG = {
        SITE_URL: 'dev.sankuai.com/code/repo-detail',
        API_ENDPOINT: 'https://hpx.sankuai.com/api/open/getProjectUrlList',
        CACHE_KEY: 'HPX_PROJECT_CACHE',
        CACHE_EXPIRE: 24 * 60 * 60 * 1000, // 24小时
        BUTTON_ID: 'zy_hpx_button',
        CONTAINER_SELECTOR: '.btn-box',
        DEBOUNCE_DELAY: 300
    };

    // 防抖函数
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        #${CONFIG.BUTTON_ID} {
            margin-right: 0.5rem;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        #${CONFIG.BUTTON_ID}:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        #${CONFIG.BUTTON_ID}:active {
            transform: translateY(0);
        }
        .mtd-button-content {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 2;
        }
        .mtdicon-fast-forward {
            margin-right: 0.25rem;
        }

        /* 加载动画 */
        .btn-loading .mtd-button-content::after {
            content: '';
            width: 1rem;
            height: 1rem;
            border: 2px solid #ffffff;
            border-top-color: transparent;
            border-radius: 50%;
            margin-left: 0.5rem;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* 节日装饰样式 */
        .festival-icon {
            position: absolute;
            pointer-events: none;
            font-size: 12px;
            z-index: 1;
        }
        .spring-festival .festival-icon {
            animation: springFestival 2s infinite;
        }
        .christmas .festival-icon {
            animation: snowfall 3s infinite;
        }
        .halloween .festival-icon {
            animation: spooky 3s infinite;
        }
        .lantern-festival .festival-icon {
            animation: floating 3s infinite;
        }

        @keyframes springFestival {
            0% { transform: scale(1) rotate(0deg); opacity: 1; }
            50% { transform: scale(1.2) rotate(180deg); opacity: 0.8; }
            100% { transform: scale(1) rotate(360deg); opacity: 1; }
        }
        @keyframes snowfall {
            0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100%) rotate(360deg); opacity: 0; }
        }
        @keyframes spooky {
            0% { transform: translateX(-20px) translateY(0); opacity: 1; }
            50% { transform: translateX(20px) translateY(-10px); opacity: 0.7; }
            100% { transform: translateX(-20px) translateY(0); opacity: 1; }
        }
        @keyframes floating {
            0% { transform: translateY(0) rotate(-5deg); }
            50% { transform: translateY(-10px) rotate(5deg); }
            100% { transform: translateY(0) rotate(-5deg); }
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            #${CONFIG.BUTTON_ID} {
                margin-right: 0.25rem;
                padding: 0.5rem 0.75rem;
                font-size: 0.875rem;
            }
            .mtd-button-content span:last-child {
                display: none;
            }
        }

        /* 节日光效 */
        .festival-sparkle {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 1;
        }
        .festival-sparkle::before,
        .festival-sparkle::after {
            content: '';
            position: absolute;
            width: 2px;
            height: 2px;
            border-radius: 50%;
            background: rgba(255,255,255,0.6);
            animation: sparkle 2s infinite;
        }
        .festival-sparkle::after {
            animation-delay: 1s;
        }
        @keyframes sparkle {
            0%, 100% { transform: translate(0, 0) scale(0); opacity: 0; }
            50% { transform: translate(20px, -20px) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    // 日志函数
    const logger = (log) => console.log("[Go to HPX]", log);

    // 判断是否在目标页面
    const isTargetPage = () => window.location.href.includes(CONFIG.SITE_URL);

    // 获取缓存数据
    const getCachedProject = (git) => {
        try {
            const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
            const data = cache[git];
            if (data && (Date.now() - data.timestamp) < CONFIG.CACHE_EXPIRE) {
                return data.project;
            }
        } catch (e) {
            logger('读取缓存失败', e);
        }
        return null;
    };

    // 设置缓存数据
    const setCachedProject = (git, project) => {
        try {
            const cache = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || '{}');
            cache[git] = { project, timestamp: Date.now() };
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            logger('设置缓存失败', e);
        }
    };

    // 获取Git地址
    const getGitAddress = () => {
        return new Promise((resolve) => {
            const str = CONFIG.SITE_URL;
            const index = window.location.href.indexOf(str);
            const reset = window.location.href.substring(index + str.length);
            const components = reset.split('/');

            if (components.length >= 3) {
                const url = `https://dev.sankuai.com/rest/api/2.0/projects/${components[1]}/repos/${components[2]}`;
                $.get(url, (data) => {
                    const sshLink = data.links.clone.find(link => link.name === 'ssh');
                    resolve(sshLink ? sshLink.href : '');
                }).fail(() => resolve(''));
            } else {
                resolve('');
            }
        });
    };

    // 请求项目数据
    const requestProjectData = (git) => {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${CONFIG.API_ENDPOINT}?repoUrl=${git}`,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.data?.length > 0) {
                            resolve(data.data[0]);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        logger('解析数据失败', e);
                        resolve(null);
                    }
                },
                onerror: () => {
                    logger('网络请求失败');
                    resolve(null);
                }
            });
        });
    };

    // 获取当前节日
    const getFestival = () => {
        const date = new Date();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // 节日映射表
        const festivals = {
            'spring-festival': [1, 20, 2, 20], // 春节
            'lantern-festival': [2, 24, 2, 26], // 元宵节
            'halloween': [10, 29, 11, 2], // 万圣节
            'christmas': [12, 20, 12, 26] // 圣诞节
        };

        for (const [name, [startMonth, startDay, endMonth, endDay]] of Object.entries(festivals)) {
            if ((month === startMonth && day >= startDay) || (month === endMonth && day <= endDay)) {
                return name;
            }
        }
        return '';
    };

    // 渲染加载中按钮
    const renderLoadingButton = () => {
        removeButton();
        $(CONFIG.CONTAINER_SELECTOR).prepend(`
            <button id="${CONFIG.BUTTON_ID}" type="button" class="mtd-btn mtd-btn-primary btn-loading" disabled>
                <span>
                    <div class="mtd-button-content">
                        <span class="mtdicon mtdicon-fast-forward"></span>
                        <span>Loading...</span>
                    </div>
                </span>
            </button>
        `);
    };

    // 渲染按钮
    const renderHPXButton = (project) => {
        removeButton();
        const festival = getFestival();
        const festivalConfig = {
            'spring-festival': {
                icon: '🏮',
                text: '新年快乐',
                icons: ['🏮', '💰', '🧨', '🎊', '🐲', '福']
            },
            'lantern-festival': {
                icon: '🏮',
                text: '元宵节快乐',
                icons: ['🏮', '👻', '🌕', '⭐']
            },
            'halloween': {
                icon: '🎃',
                text: 'Happy Halloween',
                icons: ['🎃', '👻', '🦇', '🕷️', '🕸️']
            },
            'christmas': {
                icon: '🎄',
                text: 'Merry Xmas',
                icons: ['❄️', '🎄', '🎅', '🎁', '⛄', '🦌']
            }
        };

        // 在首部插入Button
        const config = festivalConfig[festival] || { icon: '', text: 'Go to HyperloopX' };
        $(CONFIG.CONTAINER_SELECTOR).prepend(`
            <button id="${CONFIG.BUTTON_ID}" type="button" class="mtd-btn mtd-btn-primary ${festival}" title="${config.text}">
                ${festival ? '<div class="festival-sparkle"></div>' : ''}
                <span>
                    <div class="mtd-button-content">
                        <span class="mtdicon mtdicon-fast-forward"></span>
                        <span>Go to HyperloopX</span>
                        ${festival ? `<span style="margin-left: 4px" class="festival-main-icon">${config.icon}</span>` : ''}
                    </div>
                </span>
            </button>
        `);

        // 绑定点击事件
        $(`#${CONFIG.BUTTON_ID}`).on('click', function() {
            // 点击效果
            if (festival) {
                const icon = config.icons[Math.floor(Math.random() * config.icons.length)];
                const $icon = $(`<span class="festival-icon">${icon}</span>`);
                $icon.css({
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%) scale(3)',
                    opacity: 0
                });
                $(this).append($icon);
                $icon.animate({ opacity: 1 }, 200).animate({ opacity: 0 }, 300, () => $icon.remove());
            }

            // 打开窗口
            window.open(project, '_blank', 'noopener,noreferrer');
        });
    };

    // 移除按钮
    const removeButton = () => $(`#${CONFIG.BUTTON_ID}`).remove();

    // 主要注入函数
    async function inject() {
        const $container = $(CONFIG.CONTAINER_SELECTOR);
        if ($container.length === 0) {
            logger('没有查到元素');
            return false;
        }
        logger('查到元素');

        // 渲染加载中按钮
        renderLoadingButton();

        try {
            // 获取git地址
            const git = await getGitAddress();
            if (!git) {
                removeButton();
                return false;
            }

            // 检查缓存
            const cachedProject = getCachedProject(git);
            if (cachedProject) {
                logger('使用缓存数据');
                renderHPXButton(cachedProject);

                // 异步更新缓存
                updateProjectCache(git);
                return true;
            }

            // 请求新数据
            const project = await requestProjectData(git);
            if (project) {
                logger('获取新数据');
                setCachedProject(git, project);
                renderHPXButton(project);
                return true;
            }

            // 未获取到数据，移除按钮
            removeButton();
            return false;
        } catch (error) {
            logger('注入失败', error);
            removeButton();
            return false;
        }
    }

    // 异步更新缓存
    const updateProjectCache = (git) => {
        requestProjectData(git).then(project => {
            if (project) {
                setCachedProject(git, project);
                logger('缓存已更新');
            }
        });
    }

    // 页面加载完成后执行
    function init() {
        if (isTargetPage()) {
            // 使用 MutationObserver 监听DOM变化
            const observer = new MutationObserver((mutations) => {
                const $container = $(CONFIG.CONTAINER_SELECTOR);
                const $button = $(`#${CONFIG.BUTTON_ID}`);

                if ($container.length > 0 && $button.length === 0) {
                    logger('检测到按钮容器');
                    observer.disconnect();
                    inject();
                }
            });

            // 立即检查是否已存在按钮容器
            const $container = $(CONFIG.CONTAINER_SELECTOR);
            if ($container.length > 0) {
                logger('按钮容器已存在');
                inject();
            } else {
                logger('等待按钮容器');
                observer.observe(document.body, { childList: true, subtree: true });
            }

            // 添加页面URL变化监听（防抖处理）
            let lastUrl = location.href;
            const debouncedUrlChange = debounce(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    logger('URL 发生变化');
                    if (isTargetPage()) {
                        inject();
                    }
                }
            }, CONFIG.DEBOUNCE_DELAY);

            new MutationObserver(debouncedUrlChange).observe(document, { subtree: true, childList: true });
        }
    }

    // 确保jQuery加载完成
    function checkJQuery() {
        if (typeof $ !== 'undefined' || typeof jQuery !== 'undefined') {
            logger('jQuery 已加载');
            init();
        } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
            logger('等待jQuery中...');
            setTimeout(checkJQuery, 100);
        }
    }

    // 检查jQuery并启动
    checkJQuery();

})();