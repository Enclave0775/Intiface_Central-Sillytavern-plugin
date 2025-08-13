
// SPDX-License-Identifier: AGPL-3.0-or-later

import { renderExtensionTemplateAsync } from "../../../extensions.js";

// @ts-ignore: Hack to suppress IDE errors
const $ = window.$;
// @ts-ignore
const { getContext } = window.SillyTavern;
const NAME = "lovense-connect";
const extensionName = "lovense-sillytavern-plugin";

let buttplug;
let client;
let connector;
let device;
let intervalId;

function clickHandlerHack() {
    try {
        const element = document.querySelector("#extensions-settings-button .drawer-toggle");
        if (element) {
            const events = $._data(element, "events");
            if (events && events.click && events.click[0]) {
                const doNavbarIconClick = events.click[0].handler;
                $("#lovense-connect-button .drawer-toggle").on("click", doNavbarIconClick);
            }
        }
    } catch (error) {
        console.error(`${NAME}: Failed to apply click handler hack.`, error);
    }
}

function updateStatus(status, isError = false) {
    const statusPanel = $("#lovense-status-panel");
    statusPanel.text(`Status: ${status}`);
    if (isError) {
        statusPanel.removeClass("connected").addClass("disconnected");
    }
}

function updateButtonStates(isConnected) {
    $("#lovense-connect-action-button").text(isConnected ? "Disconnect" : "Connect");
    $("#lovense-scan-button").toggle(isConnected);
    $("#lovense-connect-button .drawer-icon").toggleClass("flashing-icon", isConnected);
}

async function connect() {
    try {
        updateStatus("Connecting...");
        await client.connect(connector);
        updateStatus("Connected");
        $("#lovense-status-panel").removeClass("disconnected").addClass("connected");
        updateButtonStates(true);
        intervalId = setInterval(processMessage, 1000); // Start processing messages
    } catch (e) {
        updateStatus(`Error connecting: ${e.message}`, true);
    }
}

async function disconnect() {
    try {
        await client.disconnect();
        updateStatus("Disconnected");
        $("#lovense-status-panel").removeClass("connected").addClass("disconnected");
        updateButtonStates(false);
        $("#lovense-devices").empty();
        if (intervalId) {
            clearInterval(intervalId); // Stop processing messages
            intervalId = null;
        }
        if (strokerIntervalId) {
            clearInterval(strokerIntervalId);
            strokerIntervalId = null;
        }
        isStroking = false;
        if (vibrateIntervalId) {
            clearTimeout(vibrateIntervalId);
            vibrateIntervalId = null;
        }
    } catch (e) {
        updateStatus(`Error disconnecting: ${e.message}`, true);
    }
}

async function startScanning() {
    try {
        updateStatus("Scanning for devices...");
        await client.startScanning();
    } catch (e) {
        updateStatus(`Error scanning: ${e.message}`, true);
    }
}

function handleDeviceAdded(newDevice) {
    updateStatus("Device found!");
    device = newDevice; // Store the device
    const devicesEl = $("#lovense-devices");
    devicesEl.empty(); // Clear previous devices
    const deviceDiv = $(`<div id="device-${device.index}"></div>`);
    deviceDiv.html(`<h3>${device.name}</h3>`);

    // Vibrate slider
    const vibrateSlider = $('<input type="range" min="0" max="100" value="50" id="vibrate-slider">');
    vibrateSlider.on("input", async () => {
        try {
            await device.vibrate(vibrateSlider.val() / 100);
        } catch (e) {
            console.error("Vibrate command failed:", e);
        }
    });
    deviceDiv.append("<span>Vibrate: </span>").append(vibrateSlider);
    const intervalDisplay = $('<div id="lovense-interval-display" style="margin-top: 10px;">Interval: N/A</div>');
    deviceDiv.append(intervalDisplay);
    try {
        device.vibrate(0.5); // Vibrate at 50% intensity when connected
    } catch (e) {
        console.error("Initial vibrate command failed:", e);
    }

    // Stroker controls
    const startPosSlider = $('<input type="range" min="0" max="100" value="10" id="start-pos-slider">');
    const endPosSlider = $('<input type="range" min="0" max="100" value="90" id="end-pos-slider">');
    const durationInput = $('<input type="number" id="duration-input" value="1000" style="width: 60px;">');
    const startStrokerBtn = $('<div class="menu_button">Start Stroking</div>');
    const stopStrokerBtn = $('<div class="menu_button">Stop Stroking</div>');

    deviceDiv.append("<div><span>Start Pos: </span></div>").append(startPosSlider);
    deviceDiv.append("<div><span>End Pos: </span></div>").append(endPosSlider);
    deviceDiv.append("<div><span>Duration (ms): </span></div>").append(durationInput);
    deviceDiv.append(startStrokerBtn).append(stopStrokerBtn);

    let isAtStart = true;

    startStrokerBtn.on("click", () => {
        if (strokerIntervalId) clearInterval(strokerIntervalId);
        const duration = parseInt(durationInput.val(), 10) || 1000;
        strokerIntervalId = setInterval(async () => {
            const targetPos = isAtStart ? endPosSlider.val() / 100 : startPosSlider.val() / 100;
            try {
                await device.linear(targetPos, duration);
                isAtStart = !isAtStart;
            } catch (e) {
                console.error("Stroker command failed:", e);
            }
        }, duration);
    });

    stopStrokerBtn.on("click", () => {
        if (strokerIntervalId) {
            clearInterval(strokerIntervalId);
            strokerIntervalId = null;
        }
    });
    
    devicesEl.append(deviceDiv);
}

function handleDeviceRemoved() {
    updateStatus("Device removed");
    device = null;
    $("#lovense-devices").empty();
    if (strokerIntervalId) {
        clearInterval(strokerIntervalId);
        strokerIntervalId = null;
    }
    isStroking = false;
    if (vibrateIntervalId) {
        clearTimeout(vibrateIntervalId);
        vibrateIntervalId = null;
    }
}

let strokerIntervalId = null;
let vibrateIntervalId = null;
let lastProcessedMessage = null;
let isStroking = false; // To control the async stroking loop

async function processMessage() {
    if (!device) return;

    const context = getContext();
    const lastMessage = context.chat[context.chat.length - 1];

    if (!lastMessage || !lastMessage.mes || lastMessage.mes === lastProcessedMessage) {
        return; // No new message or message already processed
    }

    const messageText = lastMessage.mes;

    // Regex definitions
    const multiVibrateRegex = /"VIBRATE"\s*:\s*({[^}]+})/i;
    const singleVibrateRegex = /"VIBRATE"\s*:\s*(\d+)/i;
    const linearRegex = /"LINEAR"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?duration(?:")?\s*:\s*(\d+)\s*}/i;
    const linearSpeedRegex = /"LINEAR_SPEED"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?start_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?steps(?:")?\s*:\s*(\d+)\s*}/i;

    const multiVibrateMatch = messageText.match(multiVibrateRegex);
    const singleVibrateMatch = messageText.match(singleVibrateRegex);
    const linearMatch = messageText.match(linearRegex);
    const linearSpeedMatch = messageText.match(linearSpeedRegex);

    // If any command is found, stop previous actions and mark the message as processed.
    if (multiVibrateMatch || singleVibrateMatch || linearMatch || linearSpeedMatch) {
        lastProcessedMessage = messageText;
    } else {
        return; // Not a command message, do nothing.
    }

    const stopActions = () => {
        if (vibrateIntervalId) {
            clearTimeout(vibrateIntervalId);
            vibrateIntervalId = null;
            $("#lovense-interval-display").text("Interval: N/A");
        }
        if (strokerIntervalId) {
            clearInterval(strokerIntervalId);
            strokerIntervalId = null;
        }
        isStroking = false;
    };

    stopActions();

    if (multiVibrateMatch && multiVibrateMatch[1]) {
        try {
            const command = JSON.parse(multiVibrateMatch[1]);
            if (command.pattern && Array.isArray(command.pattern) && command.interval) {
                const pattern = command.pattern;
                const intervals = Array.isArray(command.interval) ? command.interval : [command.interval];
                let patternIndex = 0;

                const executeVibration = async () => {
                    if (patternIndex >= pattern.length) {
                        patternIndex = 0; // Loop the pattern
                    }

                    const intensity = pattern[patternIndex];
                    if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
                        $("#vibrate-slider").val(intensity);
                        const vibrateValue = intensity / 100;
                        await device.vibrate(vibrateValue);
                        updateStatus(`Vibrating at ${intensity}% (Pattern)`);
                    }

                    const currentInterval = intervals[patternIndex % intervals.length];
                    $("#lovense-interval-display").text(`Interval: ${currentInterval}ms`);
                    patternIndex++;

                    if (vibrateIntervalId) {
                        clearTimeout(vibrateIntervalId);
                    }
                    vibrateIntervalId = setTimeout(executeVibration, currentInterval);
                };

                executeVibration(); // Start the vibration loop
            }
        } catch (e) {
            console.error("Could not parse multi-level VIBRATE command.", e);
        }
    } else if (singleVibrateMatch && singleVibrateMatch[1]) {
        const intensity = parseInt(singleVibrateMatch[1], 10);
        if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
            $("#vibrate-slider").val(intensity);
            const vibrateValue = intensity / 100;
            try {
                await device.vibrate(vibrateValue);
                updateStatus(`Vibrating at ${intensity}%`);
            } catch (e) {
                console.error("Vibrate command failed:", e);
                updateStatus(`Vibrate command failed for ${device.name}`);
            }
        }
    } else if (linearMatch && linearMatch.length === 4) {
        const startPos = parseInt(linearMatch[1], 10);
        const endPos = parseInt(linearMatch[2], 10);
        const duration = parseInt(linearMatch[3], 10);

        if (!isNaN(startPos) && !isNaN(endPos) && !isNaN(duration)) {
            $("#start-pos-slider").val(startPos);
            $("#end-pos-slider").val(endPos);
            $("#duration-input").val(duration);
            
            let isAtStart = true;
            // Initial move
            device.linear(isAtStart ? endPos / 100 : startPos / 100, duration).catch(e => console.error(e));
            isAtStart = !isAtStart;

            strokerIntervalId = setInterval(async () => {
                const targetPos = isAtStart ? endPos / 100 : startPos / 100;
                try {
                    await device.linear(targetPos, duration);
                    isAtStart = !isAtStart;
                } catch (e) {
                    console.error("Stroker command failed:", e);
                }
            }, duration);
        }
    } else if (linearSpeedMatch && linearSpeedMatch.length === 6) {
        const startPos = parseInt(linearSpeedMatch[1], 10);
        const endPos = parseInt(linearSpeedMatch[2], 10);
        const startDur = parseInt(linearSpeedMatch[3], 10);
        const endDur = parseInt(linearSpeedMatch[4], 10);
        const steps = parseInt(linearSpeedMatch[5], 10);

        if (!isNaN(startPos) && !isNaN(endPos) && !isNaN(startDur) && !isNaN(endDur) && !isNaN(steps) && steps > 1) {
            $("#start-pos-slider").val(startPos);
            $("#end-pos-slider").val(endPos);
            
            let isAtStart = true;
            let currentStep = 0;
            isStroking = true;

            const strokerLoop = async () => {
                while (isStroking) {
                    const progress = currentStep / (steps - 1);
                    const duration = Math.round(startDur + (endDur - startDur) * progress);

                    $("#duration-input").val(duration);
                    updateStatus(`Stroking. Duration: ${duration}ms`);

                    const targetPos = isAtStart ? endPos / 100 : startPos / 100;

                    try {
                        if (!isStroking) break;
                        await device.linear(targetPos, duration);
                        // Wait for the movement to complete
                        await new Promise(resolve => setTimeout(resolve, duration));

                        isAtStart = !isAtStart;
                        currentStep++;
                        if (currentStep >= steps) {
                            currentStep = 0; // Loop the pattern
                        }
                    } catch (e) {
                        console.error("Stroker command failed:", e);
                        isStroking = false; // Stop on error
                    }
                }
            };
            
            strokerLoop();
        }
    }
}

async function toggleConnection() {
    if (client.connected) {
        await disconnect();
    } else {
        await connect();
    }
}

// Dynamically load the buttplug.js library
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

$(async () => {
    try {
        await loadScript(`/scripts/extensions/third-party/${extensionName}/lib/buttplug.js`);
        // @ts-ignore
        buttplug = window.buttplug;
        client = new buttplug.ButtplugClient("SillyTavern Lovense Client");
        connector = new buttplug.ButtplugBrowserWebsocketClientConnector("ws://127.0.0.1:12345");

        client.on("deviceadded", handleDeviceAdded);
        client.on("deviceremoved", handleDeviceRemoved);

        const template = await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'settings');
        $("#extensions-settings-button").after(template);
        
        clickHandlerHack();

        $("#lovense-connect-action-button").on("click", toggleConnection);
        $("#lovense-scan-button").on("click", startScanning);

        updateButtonStates(client.connected);
        updateStatus("Disconnected");

    } catch (error) {
        console.error(`${NAME}: Failed to initialize.`, error);
        const statusPanel = $("#lovense-status-panel");
        if (statusPanel.length) {
            updateStatus("Failed to load Buttplug.js. Check console.", true);
        }
    }
});
