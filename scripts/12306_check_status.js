// ==UserScript==
// @name         12306火车查询脚本
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  12306火车查询脚本, 遇到未放票的车次，可以通过监控提醒您。
// @author       Dean
// @match        https://kyfw.12306.cn/otn/leftTicket/init*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
	"use strict";

	// 定义需要查询的火车列表 - 改为空数组，由用户选择
	var train_list = [];
	var train_date = "2025-09-26";

	// 默认查询间隔时长为10分钟
	var DEFAULT_INTERVAL = 300000;

	// 刷新延迟时间为3秒
	var REFRESH_DELAY = 3000;
	// 内部属性
	var intervalId = null;
	var logIndex = 0;

	// 查询统计信息
	var queryStats = {
		startTime: Date.now(),
		queryCount: 0,
		lastQueryTime: 0,
		avgQueryDuration: 0,
		totalQueryDuration: 0
	};

	// 检查火车信息
	var checkTrain = function (train_list) {
		var t_list = document.getElementById("t-list");
		var rows = t_list.getElementsByTagName("tr");
		log("查询到" + rows.length + "辆车次，尝试获取目标车次状态...");
		for (var i = 0; i < rows.length; i++) {
			var cells = rows[i].cells;
			var letterText = "";
			var emit = false;
			var booking = false;
			var stationFromTo = "";
			for (var j = 0; j < cells.length; j++) {
				if (j === 0) {
					const trainResult = checkTrainNumber(cells[j], train_list);
					emit = trainResult.checkTrainStatus;
					if (emit) {
						rows[i].className = "";
						rows[i].style.backgroundColor = "lightgreen";
					}
					letterText = trainResult.letterText;
					stationFromTo = trainResult.stationFromTo;
					letterText = `${stationFromTo}  ${letterText}`;
				} else if (j == 1 && emit) {
				} else if (j === 12 && emit) {
					const trainStatus = checkTrainStatus(cells[j], letterText);
					booking = trainStatus.booking;
					letterText += trainStatus.letterText;
					// break trainLoop
				}
			}

			if (letterText && emit) {
				log(letterText + "--->预订状态：" + booking);
				if (booking) {
					// if (bookingBtn) {
					// 开始预定
					// log(`开始预定 ---->${letterText}`)
					// log(bookingBtn)
					// bookingBtn.getElementsByTagName('a')[0].click()
					// setTimeout(() => {
					// checkUser()
					// }, 1000);
					// } else {
					sendMessage("12306火车查询", letterText);
					sendStrongMessage(letterText);
					log("已查询到指定车次，定时逻辑关闭。如需重新开启，请刷新页面...");
					clearInterval(intervalId);
					// }
				} else {
					log("");
				}
			}
		}
	};

	var checkUser = function () {
		var loginModal = document.getElementById("login");
		if (loginModal) {
			// 未登录，输入账号密码
			// var J_userName = document.getElementById('J-userName')
			// var J_password = document.getElementById('J-password')
			// if (J_userName && J_password) {
			// 	J_userName.value = username
			// 	J_password.value = password
			// 	log(`密码输入完成...✅✅✅`)
			// 	document.getElementById('J-login').click()
			// }
		}
	};

	// 检查火车车次是否在查询列表中
	var checkTrainNumber = function (cell, train_list) {
		var numberTag = cell.getElementsByClassName("number");
		var number = numberTag[0]?.innerText;
		if (number) {
			if (train_list.includes(number)) {
				var cdzTags = cell.getElementsByClassName("cdz");
				var stationFromTo = "";
				if (cdzTags) {
					var from = cdzTags[0].getElementsByTagName("strong")[0];
					var to = cdzTags[0].getElementsByTagName("strong")[1];
					stationFromTo = `${from.innerHTML} -> ${to.innerHTML}`;
				}
				return { letterText: number, checkTrainStatus: true, stationFromTo };
			} else {
				return { letterText: "未查询到车次", checkTrainStatus: false };
			}
		} else {
			return {};
		}
	};

	// 检查火车状态并发送消息
	var checkTrainStatus = function (cell) {
		var a_link = cell.getElementsByTagName("a");
		if (a_link && a_link.length > 0 && a_link[0].tagName === "A") {
			const letterText = "[" + cell.innerText + "]\n可以预定了，赶快进入12306预定吧！！！";
			return { letterText, booking: true };
		} else {
			const letterText = "[" + cell.innerHTML + "]";
			return { letterText, booking: false };
		}
	};


	var sendStrongMessage = function (message) {
		setInterval(() => sendMessage("12306强提醒", message), 10000);
	};

	// 发送消息
	var sendMessage = function (train, letterText) {
		log(letterText);
		// 检查浏览器是否支持Notification API
		if ("Notification" in window) {
			// 请求用户权限
			Notification.requestPermission().then((permission) => {
				if (permission === "granted") {
					// 如果用户授权，则创建通知
					const notification = new Notification(train, {
						body: letterText,
						icon: "https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net",
						sound: "system",
					});

					// 可以添加事件监听器来处理点击事件等
					notification.onclick = function (event) {
						window.focus();
					};
				}
			});
		} else {
			alert("你的浏览器不支持通知功能");
		}
	};


	const validCheckTrainStart = function () {
		var currentHour = new Date().getHours();
		if (currentHour < 24 && currentHour > 6) {
			return startCheckTrain;
		} else {
			log("12306封禁期，暂不做任何处理...✊✊✊");
			return () => { };
		}
	};

	// 创建一个更直观的监控信息面板
	function createMonitorPanel() {
		const panel = document.createElement("div");
		panel.id = "monitor-panel";
		panel.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			width: 350px;
			padding: 20px;
			background-color: rgba(33, 33, 33, 0.95);
			color: #fff;
			border-radius: 12px;
			z-index: 9999;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			max-height: 85vh;
			overflow-y: auto;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08);
			backdrop-filter: blur(10px);
			border: 1px solid rgba(255, 255, 255, 0.1);
		`;
		panel.innerHTML = `
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
				<h2 style="margin: 0; color: #4CAF50; font-size: 1.5em;">12306 监控面板</h2>
				<div style="width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; animation: pulse 2s infinite;"></div>
			</div>
			<style>
				@keyframes pulse {
					0% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.2); opacity: 0.5; }
					100% { transform: scale(1); opacity: 1; }
				}
				.monitor-section {
					background: rgba(255, 255, 255, 0.05);
					padding: 12px;
					border-radius: 8px;
					margin-bottom: 12px;
				}
				.monitor-section h3 {
					margin: 0 0 8px 0;
					color: #4CAF50;
					font-size: 1.1em;
				}
				.stats-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 8px;
					margin-bottom: 8px;
				}
				.stat-item {
					background: rgba(76, 175, 80, 0.1);
					padding: 8px;
					border-radius: 6px;
					text-align: center;
					border: 1px solid rgba(76, 175, 80, 0.2);
				}
				.stat-value {
					font-size: 1.2em;
					font-weight: bold;
					color: #4CAF50;
					display: block;
				}
				.stat-label {
					font-size: 0.8em;
					color: #888;
					margin-top: 2px;
				}
				.status-indicator {
					display: inline-block;
					width: 10px;
					height: 10px;
					border-radius: 50%;
					margin-right: 8px;
					animation: pulse 2s infinite;
				}
				.status-active { background-color: #4CAF50; }
				.status-paused { background-color: #FF9800; }
				.status-finished { background-color: #9E9E9E; }
				.fatigue-warning {
					background: rgba(255, 152, 0, 0.1);
					border: 1px solid rgba(255, 152, 0, 0.3);
					border-radius: 6px;
					padding: 10px;
					margin-top: 10px;
					color: #FF9800;
					font-size: 0.9em;
				}

				.train-tag {
					display: inline-block;
					background-color: #4CAF50;
					color: white;
					padding: 4px 8px;
					margin: 2px;
					border-radius: 4px;
					font-size: 0.9em;
					transition: all 0.3s ease;
				}
				.train-tag:hover {
					transform: translateY(-2px);
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				}
				.log-entry {
					padding: 8px;
					border-bottom: 1px solid rgba(255, 255, 255, 0.1);
					font-size: 0.9em;
					transition: background-color 0.3s ease;
				}
				.log-entry:hover {
					background-color: rgba(255, 255, 255, 0.05);
				}
				.timestamp {
					color: #888;
					font-size: 0.8em;
				}
			</style>
			<div id="monitor-info" class="monitor-section"></div>
			<div id="stats-section" class="monitor-section"></div>
			<div id="train-list" class="monitor-section"></div>
			<div id="next-refresh" class="monitor-section"></div>
			<div id="log-container" class="monitor-section" style="max-height: 300px; overflow-y: auto;"></div>
			<button id="reset-config" style="
				width: 100%;
				padding: 10px;
				background-color: #f44336;
				color: white;
				border: none;
				border-radius: 6px;
				cursor: pointer;
				font-weight: bold;
				transition: all 0.3s ease;
				margin-top: 10px;
			">重置配置</button>
		`;
		document.body.appendChild(panel);

		// 添加按钮悬停效果
		const resetButton = document.getElementById("reset-config");
		resetButton.addEventListener("mouseenter", () => {
			resetButton.style.backgroundColor = "#d32f2f";
		});
		resetButton.addEventListener("mouseleave", () => {
			resetButton.style.backgroundColor = "#f44336";
		});

		// 添加重置配置按钮的事件监听
		resetButton.addEventListener("click", resetConfig);
	}

	// 创建车次选择界面
	function createTrainSelector() {
		const selector = document.createElement("div");
		selector.id = "train-selector";
		selector.style.cssText = `
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
			background-color: rgba(0, 0, 0, 0.9);
		color: #fff;
			padding: 30px;
			border-radius: 15px;
		text-align: center;
			z-index: 10001;
			min-width: 400px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			backdrop-filter: blur(10px);
			border: 1px solid rgba(255, 255, 255, 0.1);
	  `;
		selector.innerHTML = `
			<h2 style="color: #4CAF50; margin-bottom: 20px;">选择监控车次</h2>
			<div style="margin-bottom: 20px;">
				<label style="display: block; margin-bottom: 10px; color: #ccc;">请输入要监控的车次（用逗号分隔）：</label>
				<input type="text" id="train-input" placeholder="例如：K179,K180,G123" style="
					width: 100%;
					padding: 12px;
					border: 1px solid #555;
					border-radius: 8px;
					background-color: rgba(255, 255, 255, 0.1);
					color: #fff;
					font-size: 16px;
					box-sizing: border-box;
				">
				<div style="margin-top: 10px; font-size: 12px; color: #888;">
					提示：车次号不区分大小写，系统会自动处理格式
			</div>
			</div>
			<div style="margin-bottom: 20px;">
				<h3 style="color: #4CAF50; margin-bottom: 10px;">常用车次快选：</h3>
				<div id="quick-select" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
					<button class="quick-train" data-train="K179">K179</button>
					<button class="quick-train" data-train="K180">K180</button>
					<button class="quick-train" data-train="G123">G123</button>
					<button class="quick-train" data-train="D123">D123</button>
					<button class="quick-train" data-train="T123">T123</button>
					<button class="quick-train" data-train="Z123">Z123</button>
				</div>
			</div>
			<div style="display: flex; gap: 15px; justify-content: center;">
				<button id="confirm-trains" style="
					padding: 12px 24px;
					background-color: #4CAF50;
					color: white;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					font-weight: bold;
					font-size: 16px;
					transition: all 0.3s ease;
				">确认选择</button>
				<button id="cancel-trains" style="
					padding: 12px 24px;
					background-color: #f44336;
					color: white;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					font-weight: bold;
					font-size: 16px;
					transition: all 0.3s ease;
				">取消</button>
			</div>
			<style>
				.quick-train {
					padding: 8px 12px;
					background-color: rgba(76, 175, 80, 0.2);
					color: #4CAF50;
					border: 1px solid #4CAF50;
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.3s ease;
					font-weight: bold;
				}
				.quick-train:hover {
					background-color: #4CAF50;
					color: white;
					transform: translateY(-2px);
				}
				.quick-train.selected {
					background-color: #4CAF50;
					color: white;
				}
			</style>
			`;

		document.body.appendChild(selector);

		// 添加快选按钮事件
		const quickButtons = selector.querySelectorAll('.quick-train');
		const trainInput = document.getElementById('train-input');

		quickButtons.forEach(button => {
			button.addEventListener('click', () => {
				const trainNumber = button.dataset.train;
				const currentValue = trainInput.value.trim();

				if (button.classList.contains('selected')) {
					// 取消选择
					button.classList.remove('selected');
					const trains = currentValue.split(',').map(t => t.trim()).filter(t => t !== trainNumber);
					trainInput.value = trains.join(',');
				} else {
					// 添加选择
					button.classList.add('selected');
					if (currentValue) {
						const trains = currentValue.split(',').map(t => t.trim());
						if (!trains.includes(trainNumber)) {
							trains.push(trainNumber);
							trainInput.value = trains.join(',');
						}
					} else {
						trainInput.value = trainNumber;
					}
				}
			});
		});

		// 输入框变化时更新快选按钮状态
		trainInput.addEventListener('input', () => {
			const inputTrains = trainInput.value.split(',').map(t => t.trim().toUpperCase());
			quickButtons.forEach(button => {
				const trainNumber = button.dataset.train.toUpperCase();
				if (inputTrains.includes(trainNumber)) {
					button.classList.add('selected');
				} else {
					button.classList.remove('selected');
				}
			});
		});

		// 确认按钮事件
		document.getElementById('confirm-trains').addEventListener('click', () => {
			const inputValue = trainInput.value.trim();
			if (!inputValue) {
				alert('请输入至少一个车次号！');
				return;
			}

			const selectedTrains = inputValue.split(',')
				.map(train => train.trim().toUpperCase())
				.filter(train => train.length > 0);

			if (selectedTrains.length === 0) {
				alert('请输入有效的车次号！');
				return;
			}

			// 保存选择的车次
			train_list = selectedTrains;
			localStorage.setItem("train_list", JSON.stringify(selectedTrains));

			// 移除选择界面
			selector.remove();

			// 继续初始化流程
			log(`已选择监控车次: ${selectedTrains.join(', ')}`);
			continueInitialization();
		});

		// 取消按钮事件
		document.getElementById('cancel-trains').addEventListener('click', () => {
			selector.remove();
			log('用户取消了车次选择');
		});
	}

	// 创建日期选择提醒
	function createDateReminder() {
		const reminder = document.createElement("div");
		reminder.id = "date-reminder";
		reminder.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background-color: rgba(0, 0, 0, 0.8);
			color: #fff;
			padding: 20px;
			border-radius: 10px;
			text-align: center;
			z-index: 10000;
		`;
		reminder.innerHTML = `
			<h3>请选择查询日期</h3>
			<p>点击日期输入框选择您要查询的日期</p>
			<button id="close-reminder" style="
				margin-top: 10px;
				padding: 5px 10px;
				background-color: #4CAF50;
				color: white;
				border: none;
				border-radius: 5px;
				cursor: pointer;
			">我知道了</button>
		`;
		document.body.appendChild(reminder);

		document.getElementById("close-reminder").addEventListener("click", () => {
			reminder.style.display = "none";
			// 日期选择完成后，显示车次选择
			setTimeout(() => {
				createTrainSelector();
			}, 500);
		});
	}

	// 继续初始化流程
	function continueInitialization() {
		const fromStationText = document.getElementById("fromStationText");
		const toStationText = document.getElementById("toStationText");
		const trainDateInput = document.getElementById("train_date");
		if (fromStationText && toStationText && trainDateInput) {
			updateMonitorInfo(fromStationText.value, toStationText.value, trainDateInput.value);
			updateTrainList(train_list);
			updateStatsSection(); // 新增：更新状态统计
			updateMonitorDate(trainDateInput.value);
			log(`监控已启动,正在查询指定车次`, true);
			validCheckTrainStart()(train_list);
			intervalId = setInterval(() => {
				log(`定时刷新,重新查询车次`, true);
				validCheckTrainStart()(train_list);
			}, DEFAULT_INTERVAL);
		} else {
			log("获取车站信息失败,请检查页面是否正确加载", true);
		}
	}

	// 触发日期选择器并设置监听
	function triggerDatePicker() {
		const dateInput = document.getElementById("train_date");
		if (dateInput) {
			dateInput.focus();
			// 模拟点击事件以打开日期选择器
			// const event = new MouseEvent('click', {
			// 	view: window,
			// 	bubbles: true,
			// 	cancelable: true
			// });
			// dateInput.dispatchEvent(event);

			// 获取初始值
			let lastValue = dateInput.value;
			log(`初始日期值: ${lastValue}`);

			// 使用多种事件监听方式
			const handleDateChange = function (eventType) {
				const newValue = this.value;
				console.log(`${eventType} 事件触发，当前值: ${newValue}, 上次值: ${lastValue}`);
				if (newValue && newValue !== lastValue) {
					log(`检测到日期变更 (${eventType}): ${lastValue} -> ${newValue}`);
					lastValue = newValue;
					// 提取日期部分（去掉星期）
					const dateOnly = newValue.split(' ')[0];
					updateMonitorDate(dateOnly);
				}
			};

			// 添加多种事件监听
			dateInput.addEventListener('change', function () { handleDateChange.call(this, 'change'); });

			// 监听整个文档的点击事件，可能日期选择器会触发
			document.addEventListener('click', function (e) {
				// 延迟检查，因为日期选择器可能需要时间更新值
				setTimeout(() => {
					const currentValue = dateInput.value;
					if (currentValue !== lastValue && currentValue) {
						log(`通过文档点击检测到日期变更: ${lastValue} -> ${currentValue}`);
						lastValue = currentValue;
						const dateOnly = currentValue.split(' ')[0];
						updateMonitorDate(dateOnly);
					}
				}, 100);
			});

			// 使用 MutationObserver 监听属性和子节点变化
			const observer = new MutationObserver(function (mutations) {
				mutations.forEach(function (mutation) {
					if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
						const newValue = dateInput.value;
						if (newValue && newValue !== lastValue) {
							log(`通过属性监听检测到日期变更: ${lastValue} -> ${newValue}`);
							lastValue = newValue;
							const dateOnly = newValue.split(' ')[0];
							updateMonitorDate(dateOnly);
						}
					}
				});
			});

			observer.observe(dateInput, {
				attributes: true,
				attributeFilter: ['value'],
				childList: true,
				subtree: true
			});

			// 定时检查值变化（作为备用方案）
			const checkInterval = setInterval(() => {
				const currentValue = dateInput.value;
				if (currentValue !== lastValue && currentValue) {
					log(`通过定时检查检测到日期变更: ${lastValue} -> ${currentValue}`);
					lastValue = currentValue;
					const dateOnly = currentValue.split(' ')[0];
					updateMonitorDate(dateOnly);
				}
			}, 500); // 缩短检查间隔到500ms

			// 5分钟后清除定时检查（避免无限运行）
			setTimeout(() => {
				clearInterval(checkInterval);
				observer.disconnect();
			}, 300000);

			log("已设置日期变更监听（多种方式）");
		}
	}

	// 更新监控日期并刷新页面
	function updateMonitorDate(newDate) {
		// 提取纯日期部分，去掉可能的星期信息
		const dateOnly = newDate.split(' ')[0];

		if (dateOnly === train_date) {
			return; // 避免重复更新
		}

		const oldDate = train_date;
		train_date = dateOnly; // 更新全局变量
		log(`日期更新: ${oldDate} -> ${dateOnly}`);

		// 更新localStorage中的日期
		localStorage.setItem("train_date", dateOnly);
		// 重定向问题修复，undefined



		// 更新监控信息显示
		const fromStationText = document.getElementById("fromStationText");
		const toStationText = document.getElementById("toStationText");
		if (fromStationText && toStationText) {
			updateMonitorInfo(fromStationText.value, toStationText.value, dateOnly);
		}

		// 立即执行一次查询
		log(`日期已更新为 ${dateOnly}，正在刷新查询...`);
		const savedTrainList = JSON.parse(localStorage.getItem("train_list")) || train_list;
		if (savedTrainList && savedTrainList.length > 0) {
			validCheckTrainStart()(savedTrainList);
		}

		// 更新下次刷新时间
		updateNextRefreshTime();

	}

	// 更新监控信息
	function updateMonitorInfo(fromStation, toStation, date) {
		const infoDiv = document.getElementById("monitor-info");
		infoDiv.innerHTML = `
			<h3>监控信息</h3>
			<div style="display: grid; grid-template-columns: auto 1fr; gap: 8px;">
				<span style="color: #888;">出发站:</span>
				<span style="color: #fff;">${fromStation}</span>
				<span style="color: #888;">到达站:</span>
				<span style="color: #fff;">${toStation}</span>
				<span style="color: #888;">日期:</span>
				<span style="color: #fff;">${date}</span>
				<span style="color: #888;">刷新间隔:</span>
				<span style="color: #fff;">${DEFAULT_INTERVAL / 60000}分钟</span>
			</div>
		`;
	}

	// 更新列车列表
	function updateTrainList(trainList) {
		const listDiv = document.getElementById("train-list");
		listDiv.innerHTML = "<h3>监控车次</h3><div style='display: flex; flex-wrap: wrap; gap: 4px;'>";
		trainList.forEach(train => {
			listDiv.innerHTML += `<span class="train-tag">${train}</span>`;
		});
		listDiv.innerHTML += "</div>";
	}

	// 更新状态统计区域
	function updateStatsSection() {
		const statsDiv = document.getElementById("stats-section");
		const runTime = Date.now() - queryStats.startTime;
		const runTimeText = formatDuration(runTime);
		const avgInterval = queryStats.queryCount > 0 ?
			Math.round(queryStats.totalQueryDuration / queryStats.queryCount / 1000) : 0;

		statsDiv.innerHTML = `
			<h3>状态统计</h3>
			<div class="stats-grid">
				<div class="stat-item">
					<span class="stat-value" id="query-count">${queryStats.queryCount}</span>
					<span class="stat-label">查询次数</span>
				</div>
				<div class="stat-item">
					<span class="stat-value">${runTimeText}</span>
					<span class="stat-label">运行时长</span>
				</div>
				<div class="stat-item">
					<span class="stat-value">
						<span class="status-indicator status-active"></span>
						运行中
					</span>
					<span class="stat-label">监控状态</span>
				</div>
				<div class="stat-item">
					<span class="stat-value">${avgInterval}秒</span>
					<span class="stat-label">平均间隔</span>
				</div>
			</div>
		`;

		// 检查是否需要显示疲劳提醒
		checkFatigueWarning();
	}

	// 格式化时长显示
	function formatDuration(ms) {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days}天 ${hours % 24}小时`;
		} else if (hours > 0) {
			return `${hours}小时 ${minutes % 60}分钟`;
		} else if (minutes > 0) {
			return `${minutes}分钟 ${seconds % 60}秒`;
		} else {
			return `${seconds}秒`;
		}
	}

	// 检查疲劳提醒
	function checkFatigueWarning() {
		const statsDiv = document.getElementById("stats-section");
		if (queryStats.queryCount >= 60 && !document.getElementById("fatigue-warning")) {
			const warningDiv = document.createElement("div");
			warningDiv.id = "fatigue-warning";
			warningDiv.className = "fatigue-warning";
			warningDiv.innerHTML = `
				<strong>💡 温馨提示</strong><br>
				已查询${queryStats.queryCount}次暂无结果，建议：<br>
				1. 增加监控车次数量<br>
				2. 考虑前后1-2天的日期<br>
				3. 先提交候补订单再继续监控
			`;
			statsDiv.appendChild(warningDiv);
		}
	}

	// 更新下次刷新时间
	function updateNextRefreshTime() {
		const nextRefreshDiv = document.getElementById("next-refresh");
		const nextRefreshTime = new Date(Date.now() + DEFAULT_INTERVAL);
		nextRefreshDiv.innerHTML = `
			<h3>下次刷新</h3>
			<div style="display: flex; align-items: center; gap: 8px;">
				<span style="color: #4CAF50;">${nextRefreshTime.toLocaleTimeString()}</span>
				<div style="flex-grow: 1; height: 2px; background: linear-gradient(to right, #4CAF50, transparent);"></div>
			</div>
		`;
	}

	// 优化日志显示
	function log(message, showTimestamp = true) {
		if (!message) {
			return;
		}
		const logContainer = document.getElementById("log-container");
		if (!logContainer) {
			console.error("Log container not found");
			return;
		}

		const logEntry = document.createElement("div");
		logEntry.className = "log-entry";

		if (showTimestamp) {
			const timestamp = new Date().toLocaleTimeString();
			logEntry.innerHTML = `
				<span class="timestamp">[${timestamp}]</span>
				<span style="margin-left: 8px;">${message}</span>
			`;
		} else {
			logEntry.textContent = message;
		}

		// 添加新日志时的动画效果
		logEntry.style.opacity = "0";
		logEntry.style.transform = "translateY(-10px)";
		logContainer.insertBefore(logEntry, logContainer.firstChild);

		// 触发动画
		setTimeout(() => {

			logEntry.style.transition = "all 0.3s ease";
			logEntry.style.opacity = "1";
			logEntry.style.transform = "translateY(0)";
		}, 50);

		// 限制日志条目数量，保持最新的20条
		while (logContainer.children.length > 5) {
			logContainer.removeChild(logContainer.lastChild);
		}

		// 自动滚动到顶部
		logContainer.scrollTop = 0;
	}

	// 重置配置函数
	function resetConfig() {
		localStorage.removeItem("12306_first_visit");
		localStorage.removeItem("train_list");
		localStorage.removeItem("train_date");
		log("配置已重置，请刷新页面以应用更改。");
		// 500ms后刷新页面
		setTimeout(() => {
			window.location.reload();
		}, 500);
	}

	// 开始查询火车信息
	function startCheckTrain(trainList) {
		const queryTicket = document.getElementById("query_ticket");
		const queryStartTime = Date.now();

		// 更新查询计数
		queryStats.queryCount++;
		queryStats.lastQueryTime = queryStartTime;

		log(`${queryStats.queryCount}. 尝试刷新车次列表...`);

		// 更新状态统计显示
		if (document.getElementById("query-count")) {
			document.getElementById("query-count").textContent = queryStats.queryCount;
		}

		if (queryTicket) {
			queryTicket.click();
			log("刷新车次列表成功 ✅");
			setTimeout(() => {
				checkTrain(trainList);
				// 计算查询耗时
				const queryDuration = Date.now() - queryStartTime;
				queryStats.totalQueryDuration += queryDuration;
			}, REFRESH_DELAY);
		} else {
			log("刷新车次列表失败,请检查后重试 ❌", true);
			sendMessage("12306刷新车次失败", "刷新车次列表失败,请检查后重试");
		}
		updateNextRefreshTime();
	}

	// 检查页面状态与配置是否一致
	function checkPageConsistency() {
		const fromStationText = document.getElementById("fromStationText");
		const toStationText = document.getElementById("toStationText");
		const trainDateInput = document.getElementById("train_date");

		if (!fromStationText || !toStationText || !trainDateInput) {
			log("页面元素未找到，无法检查一致性", true);
			return false;
		}

		// 获取页面当前显示的日期
		const currentPageDate = trainDateInput.value;
		const pageDate = currentPageDate ? currentPageDate.split(' ')[0] : '';

		// 获取保存的配置
		const savedTrainDate = localStorage.getItem("train_date");
		const savedTrainList = JSON.parse(localStorage.getItem("train_list")) || [];

		log(`页面显示日期: ${pageDate}, 监控配置日期: ${savedTrainDate}`, true);

		// 检查日期是否一致
		if (savedTrainDate && pageDate && pageDate !== savedTrainDate) {
			log(`⚠️ 检测到日期不一致！页面: ${pageDate}, 配置: ${savedTrainDate}`, true);
			showInconsistencyAlert(pageDate, savedTrainDate, savedTrainList);
			return false;
		}

		// 检查是否有监控车次配置
		if (!savedTrainList || savedTrainList.length === 0) {
			log("⚠️ 未找到监控车次配置", true);
			showNoConfigAlert();
			return false;
		}

		return true;
	}

	// 显示不一致提醒并提供选择
	function showInconsistencyAlert(pageDate, configDate, trainList) {
		const alert = document.createElement("div");
		alert.id = "inconsistency-alert";
		alert.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background-color: rgba(255, 87, 34, 0.95);
			color: #fff;
			padding: 30px;
			border-radius: 15px;
			text-align: center;
			z-index: 10002;
			min-width: 450px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			backdrop-filter: blur(10px);
			border: 2px solid #ff5722;
		`;

		alert.innerHTML = `
			<div style="margin-bottom: 20px;">
				<h2 style="color: #ffeb3b; margin-bottom: 15px;">⚠️ 日期不一致警告</h2>
				<div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
					<p style="margin: 5px 0;"><strong>页面显示日期:</strong> ${pageDate}</p>
					<p style="margin: 5px 0;"><strong>监控配置日期:</strong> ${configDate}</p>
					<p style="margin: 5px 0;"><strong>监控车次:</strong> ${trainList.join(', ')}</p>
				</div>
				<p style="color: #ffcdd2; font-size: 14px;">
					页面日期与监控配置不一致，可能导致监控错误！
				</p>
			</div>
			<div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
				<button id="use-page-date" style="
					padding: 12px 20px;
					background-color: #4CAF50;
					color: white;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					font-weight: bold;
					transition: all 0.3s ease;
				">使用页面日期 (${pageDate})</button>
				<button id="redirect-to-config" style="
					padding: 12px 20px;
					background-color: #2196F3;
					color: white;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					font-weight: bold;
					transition: all 0.3s ease;
				">跳转到配置日期 (${configDate})</button>
				<button id="reconfig-all" style="
					padding: 12px 20px;
					background-color: #9C27B0;
					color: white;
					border: none;
					border-radius: 8px;
					cursor: pointer;
					font-weight: bold;
					transition: all 0.3s ease;
				">重新配置</button>
			</div>
		`;

		document.body.appendChild(alert);

		// 使用页面日期
		document.getElementById("use-page-date").addEventListener("click", () => {
			train_date = pageDate;
			localStorage.setItem("train_date", pageDate);
			log(`已更新监控日期为页面日期: ${pageDate}`, true);
			alert.remove();
			continueInitialization();
		});

		// 跳转到配置日期
		document.getElementById("redirect-to-config").addEventListener("click", () => {
			alert.remove();
			redirectToConfigDate(configDate, trainList);
		});

		// 重新配置
		document.getElementById("reconfig-all").addEventListener("click", () => {
			alert.remove();
			resetConfig();
		});
	}

	// 显示无配置提醒
	function showNoConfigAlert() {
		const alert = document.createElement("div");
		alert.id = "no-config-alert";
		alert.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background-color: rgba(255, 152, 0, 0.95);
			color: #fff;
			padding: 30px;
			border-radius: 15px;
			text-align: center;
			z-index: 10002;
			min-width: 400px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			backdrop-filter: blur(10px);
			border: 2px solid #ff9800;
		`;

		alert.innerHTML = `
			<div style="margin-bottom: 20px;">
				<h2 style="color: #ffeb3b; margin-bottom: 15px;">📋 未找到监控配置</h2>
				<p style="color: #fff3e0; margin-bottom: 15px;">
					系统未找到保存的监控车次配置，请重新设置监控参数。
				</p>
			</div>
			<button id="start-config" style="
				padding: 12px 24px;
				background-color: #4CAF50;
				color: white;
				border: none;
				border-radius: 8px;
				cursor: pointer;
				font-weight: bold;
				font-size: 16px;
				transition: all 0.3s ease;
			">开始配置</button>
		`;

		document.body.appendChild(alert);

		document.getElementById("start-config").addEventListener("click", () => {
			alert.remove();
			createDateReminder();
			triggerDatePicker();
		});
	}

	// 重定向到配置的日期
	function redirectToConfigDate(targetDate, trainList) {
		log(`正在跳转到配置日期: ${targetDate}`, true);

		// 显示跳转提示
		const loadingAlert = document.createElement("div");
		loadingAlert.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background-color: rgba(33, 150, 243, 0.95);
			color: #fff;
			padding: 20px;
			border-radius: 10px;
			text-align: center;
			z-index: 10003;
			backdrop-filter: blur(10px);
		`;
		loadingAlert.innerHTML = `
			<h3>🔄 正在跳转...</h3>
			<p>跳转到监控日期: ${targetDate}</p>
			<div style="margin-top: 10px;">
				<div style="width: 30px; height: 30px; border: 3px solid #fff; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
			</div>
			<style>
				@keyframes spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
			}
			</style>
		`;
		document.body.appendChild(loadingAlert);

		// 获取当前URL参数
		const currentUrl = new URL(window.location.href);
		const urlParams = new URLSearchParams(currentUrl.search);

		// 获取出发站和到达站信息
		let fromStationParam = urlParams.get('fs') || '';
		let toStationParam = urlParams.get('ts') || '';

		// 如果URL参数中没有车站信息，尝试从页面元素获取
		if (!fromStationParam || !toStationParam) {
			const fromStationText = document.getElementById("fromStationText")?.value || '';
			const toStationText = document.getElementById("toStationText")?.value || '';
			const fromStationCode = document.getElementById("fromStation")?.value || '';
			const toStationCode = document.getElementById("toStation")?.value || '';

			// 构建车站参数格式：站名,代码
			if (fromStationText && fromStationCode) {
				fromStationParam = `${encodeURIComponent(fromStationText)},${fromStationCode}`;
			}
			if (toStationText && toStationCode) {
				toStationParam = `${encodeURIComponent(toStationText)},${toStationCode}`;
			}
		}

		// 构建新的URL参数
		const params = new URLSearchParams();
		params.set('linktypeid', urlParams.get('linktypeid') || 'dc');
		if (fromStationParam) params.set('fs', fromStationParam);
		if (toStationParam) params.set('ts', toStationParam);
		params.set('date', targetDate);
		params.set('flag', urlParams.get('flag') || 'N,N,Y');
		const redirectUrl = `${currentUrl.origin}${currentUrl.pathname}?${decodeURIComponent(params.toString())}`;

		log(`重定向URL: ${redirectUrl}`, true);

		// 延迟跳转，让用户看到提示
		setTimeout(() => {
			window.location.href = redirectUrl;
		}, 1500);
	}

	// 修改主函数，添加一致性检查
	function main() {
		createMonitorPanel();
		log("12306监控脚本已启动", true);

		const fromStationText = document.getElementById("fromStationText");
		const toStationText = document.getElementById("toStationText");
		const trainDateInput = document.getElementById("train_date");

		if (fromStationText && toStationText && trainDateInput) {
			// 获取当前页面的日期值并处理格式
			const currentDateValue = trainDateInput.value;
			if (currentDateValue) {
				const dateOnly = currentDateValue.split(' ')[0];
				log(`检测到页面当前日期: ${currentDateValue}, 提取日期: ${dateOnly}`);
			}

			// 检查是否是首次访问
			if (!localStorage.getItem("12306_first_visit")) {
				log("首次访问，请配置监控参数", true);
				createDateReminder();
				triggerDatePicker();
				localStorage.setItem("12306_first_visit", "true");
			} else {
				// 检查页面状态与配置的一致性
				if (checkPageConsistency()) {
					// 一致性检查通过，加载配置并继续
					const savedTrainList = JSON.parse(localStorage.getItem("train_list"));
					const savedTrainDate = localStorage.getItem("train_date");

					train_list = savedTrainList;
					train_date = savedTrainDate;

					log("配置一致性检查通过，继续监控", true);
					continueInitialization();
					triggerDatePicker();
				}
				// 如果一致性检查失败，相应的提醒已经在checkPageConsistency中显示
			}
		} else {
			log("获取车站信息失败,请检查页面是否正确加载", true);
		}
	}

	// 确保在页面加载完成后再执行脚本
	window.addEventListener('load', () => {
		main();
	});
})();
