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

    if (device.vibrate) {
        const vibrateSlider = $('<input type="range" min="0" max="100" value="50" id="vibrate-slider">'); // Set initial value to 50 and add id
        vibrateSlider.on("input", async () => {
            await device.vibrate(vibrateSlider.val() / 100);
        });
        deviceDiv.append("<span>Vibrate: </span>").append(vibrateSlider);
        device.vibrate(0.5); // Vibrate at 50% intensity when connected
    }
    
    devicesEl.append(deviceDiv);
}

function handleDeviceRemoved() {
    updateStatus("Device removed");
    device = null;
    $("#lovense-devices").empty();
}

async function processMessage() {
    if (!device) return;

    const context = getContext();
    const lastMessage = context.chat[context.chat.length - 1];

    if (!lastMessage || !lastMessage.mes) return;

    const messageText = lastMessage.mes;
    const vibrateRegex = /"VIBRATE"\s*:\s*(\d+)/i;
    const match = messageText.match(vibrateRegex);

    if (match && match[1]) {
        const intensity = parseInt(match[1], 10);
        if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
            const vibrateValue = intensity / 100;
            await device.vibrate(vibrateValue);
            $("#vibrate-slider").val(intensity);
            updateStatus(`Vibrating at ${intensity}%`);
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
