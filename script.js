// SPDX-License-Identifier: AGPL-3.0-or-later

import { renderExtensionTemplateAsync } from "../../../extensions.js"

// @ts-ignore: Hack to suppress IDE errors
const $ = window.$
// @ts-ignore
const { getContext } = window.SillyTavern
const NAME = "intiface-connect"
const extensionName = "Intiface_Central-Sillytavern-plugin"

let buttplug
let client
let connector
let device
let intervalId // Kept for other intervals if any, but not for processMessage
let disconnectTimerId = null
let countdownIntervalId = null
let isTimerPaused = false
let remainingTimeOnPause = 0
let disconnectTime = 0

// New variables for streaming support & queue
let executedCommands = new Set()
let lastMessageId = null
let chatObserver = null
let commandQueue = [];
let isProcessingQueue = false;
let lastExecTime = 0;
let lastCommandIndex = 0;

// Variables for looping
let currentMessageMatches = [];
let currentMessageElement = null;

// Animation control
let readingAnimationId = null;
let readingAnimationResolver = null;

function getMaxVibrate(motorIndex) {
  const inputId = motorIndex === 0 ? "#intiface-max-vibrate-1-input" : "#intiface-max-vibrate-2-input"
  const maxValue = Number.parseInt($(inputId).val(), 10)
  return isNaN(maxValue) ? 100 : Math.max(0, Math.min(100, maxValue))
}

function getMaxOscillate() {
  const maxValue = Number.parseInt($("#intiface-max-oscillate-input").val(), 10)
  return isNaN(maxValue) ? 100 : Math.max(0, Math.min(100, maxValue))
}

function applyMaxVibrate(value, motorIndex = 0) {
  const maxVibrate = getMaxVibrate(motorIndex)
  return Math.min(value, maxVibrate)
}

function applyMaxOscillate(value) {
  const maxOscillate = getMaxOscillate()
  return Math.min(value, maxOscillate)
}

function clickHandlerHack() {
  try {
    const element = document.querySelector("#extensions-settings-button .drawer-toggle")
    if (element) {
      const events = $._data(element, "events")
      if (events && events.click && events.click[0]) {
        const doNavbarIconClick = events.click[0].handler
        $("#intiface-connect-button .drawer-toggle").on("click", doNavbarIconClick)
      }
    }
  } catch (error) {
    console.error(`${NAME}: Failed to apply click handler hack.`, error)
  }
}

function updateStatus(status, isError = false) {
  const statusPanel = $("#intiface-status-panel")
  statusPanel.text(`Status: ${status}`)
  if (isError) {
    statusPanel.removeClass("connected").addClass("disconnected")
  }
}

function updateButtonStates(isConnected) {
  const connectButton = $("#intiface-connect-action-button")
  if (isConnected) {
    connectButton
      .html('<i class="fa-solid fa-power-off"></i> Disconnect')
      .removeClass("connect-button")
      .addClass("disconnect-button")
  } else {
    connectButton
      .html('<i class="fa-solid fa-power-off"></i> Connect')
      .removeClass("disconnect-button")
      .addClass("connect-button")
  }
  $("#intiface-rescan-button").toggle(isConnected)
  $("#intiface-start-timer-button").toggle(isConnected)
  $("#intiface-connect-button .drawer-icon").toggleClass("flashing-icon", isConnected)
}

function initializeClient() {
    client = new buttplug.ButtplugClient("SillyTavern Intiface Client");
    client.addListener("deviceadded", handleDeviceAdded);
    client.addListener("deviceremoved", handleDeviceRemoved);
}

async function connect() {
  try {
    const serverIp = $("#intiface-ip-input").val()
    const serverUrl = `ws://${serverIp}`
    localStorage.setItem("intiface-server-ip", serverIp) // Save on connect
    
    // Re-initialize client to ensure fresh state and listeners
    initializeClient();
    
    connector = new buttplug.ButtplugBrowserWebsocketClientConnector(serverUrl)
    updateStatus("Connecting...")
    await client.connect(connector)
    updateStatus("Connected")
    // Ensure we scan for devices upon connection
    await client.startScanning();
    $("#intiface-status-panel").removeClass("disconnected").addClass("connected")
    updateButtonStates(true)
    // Observer is already running, no need to start interval
  } catch (e) {
    updateStatus(`Error connecting: ${e.message}`, true)
  }
}

function resetQueueState() {
    executedCommands.clear();
    lastCommandIndex = 0;
    lastExecTime = Date.now(); // Set to NOW so first command distance is calculated correctly from start
    commandQueue = [];
    isProcessingQueue = false;
    currentMessageMatches = []; 
    
    // Stop any running animations
    if (readingAnimationResolver) {
        readingAnimationResolver();
        readingAnimationResolver = null;
    }
    if (readingAnimationId) {
        cancelAnimationFrame(readingAnimationId);
        readingAnimationId = null;
    }
    clearHighlights();
}

async function disconnect() {
  try {
    if (disconnectTimerId) {
      clearTimeout(disconnectTimerId)
      disconnectTimerId = null
    }
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId)
      countdownIntervalId = null
    }
    $("#intiface-countdown-panel").hide().text("")
    $("#intiface-pause-timer-button").hide()
    isTimerPaused = false
    remainingTimeOnPause = 0
    disconnectTime = 0
    await client.disconnect()
    updateStatus("Disconnected")
    $("#intiface-status-panel").removeClass("connected").addClass("disconnected")
    updateButtonStates(false)
    $("#intiface-devices").empty()
    
    stopActions()
    resetQueueState();

  } catch (e) {
    updateStatus(`Error disconnecting: ${e.message}`, true)
  }
}

function stopActions() {
    if (strokerIntervalId) {
        clearInterval(strokerIntervalId)
        strokerIntervalId = null
    }
    isStroking = false
    if (vibrateIntervalId) {
        clearTimeout(vibrateIntervalId)
        vibrateIntervalId = null
        $("#intiface-interval-display").text("Interval: N/A")
    }
    if (oscillateIntervalId) {
        clearTimeout(oscillateIntervalId)
        oscillateIntervalId = null
        $("#intiface-oscillate-interval-display").text("Oscillate Interval: N/A")
    }
}

function startTimer() {
  if (!client.connected) {
    updateStatus("Not connected. Cannot start timer.", true)
    return
  }

  const timerMinutes = Number.parseInt($("#intiface-timer-input").val(), 10)
  if (!isNaN(timerMinutes) && timerMinutes > 0) {
    const timerMilliseconds = timerMinutes * 60 * 1000
    updateStatus(`Timer started. Disconnecting in ${timerMinutes} minutes.`)

    isTimerPaused = false
    remainingTimeOnPause = 0
    $("#intiface-pause-timer-button").text("暫停計時").show()

    disconnectTime = Date.now() + timerMilliseconds

    if (disconnectTimerId) {
      clearTimeout(disconnectTimerId)
    }
    disconnectTimerId = setTimeout(() => {
      console.log("Timer expired. Disconnecting...")
      disconnect()
    }, timerMilliseconds)

    const countdownPanel = $("#intiface-countdown-panel")

    if (countdownIntervalId) {
      clearInterval(countdownIntervalId)
    }

    countdownIntervalId = setInterval(() => {
      const remaining = disconnectTime - Date.now()
      if (remaining <= 0) {
        clearInterval(countdownIntervalId)
        countdownIntervalId = null
        countdownPanel.hide()
        $("#intiface-pause-timer-button").hide()
        return
      }
      const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24)
        .toString()
        .padStart(2, "0")
      const minutes = Math.floor((remaining / 1000 / 60) % 60)
        .toString()
        .padStart(2, "0")
      const seconds = Math.floor((remaining / 1000) % 60)
        .toString()
        .padStart(2, "0")
      countdownPanel.text(`自動斷開倒數計時: ${hours}:${minutes}:${seconds}`).show()
    }, 1000)
  } else {
    updateStatus("Please enter a valid time in minutes.", true)
  }
}

function togglePauseTimer() {
  const pauseButton = $("#intiface-pause-timer-button")
  if (isTimerPaused) {
    // Resume
    isTimerPaused = false
    pauseButton.text("暫停計時")
    updateStatus("Timer resumed.")

    disconnectTime = Date.now() + remainingTimeOnPause

    if (disconnectTimerId) {
      clearTimeout(disconnectTimerId)
    }
    disconnectTimerId = setTimeout(() => {
      console.log("Timer expired. Disconnecting...")
      disconnect()
    }, remainingTimeOnPause)

    if (countdownIntervalId) {
      clearInterval(countdownIntervalId)
    }
    countdownIntervalId = setInterval(() => {
      const remaining = disconnectTime - Date.now()
      if (remaining <= 0) {
        clearInterval(countdownIntervalId)
        countdownIntervalId = null
        $("#intiface-countdown-panel").hide()
        $("#intiface-pause-timer-button").hide()
        return
      }
      const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24)
        .toString()
        .padStart(2, "0")
      const minutes = Math.floor((remaining / 1000 / 60) % 60)
        .toString()
        .padStart(2, "0")
      const seconds = Math.floor((remaining / 1000) % 60)
        .toString()
        .padStart(2, "0")
      $("#intiface-countdown-panel").text(`自動斷開倒數計時: ${hours}:${minutes}:${seconds}`).show()
    }, 1000)
  } else {
    // Pause
    isTimerPaused = true
    pauseButton.text("繼續計時")
    updateStatus("Timer paused.")

    clearTimeout(disconnectTimerId)
    clearInterval(countdownIntervalId)
    remainingTimeOnPause = disconnectTime - Date.now()
  }
}

async function handleDeviceAdded(newDevice) {
  updateStatus("Device found!")
  device = newDevice // Store the device
  const devicesEl = $("#intiface-devices")
  devicesEl.empty() // Clear previous devices
  const deviceDiv = $(`<div id="device-${device.index}"></div>`)
  deviceDiv.html(`<h3>${device.name}</h3>`)

  const devMode = $("#intiface-dev-mode-checkbox").is(":checked");

  // Vibrate sliders
  const vibrateAttributes = device.vibrateAttributes
  if (vibrateAttributes && vibrateAttributes.length > 0) {
    const vibrateContainer = $('<div id="vibrate-controls"></div>')
    vibrateAttributes.forEach((attr, index) => {
      const sliderId = `vibrate-slider-${index}`
      const label = $(`<span>Vibrate ${index + 1}: </span>`)
      const slider = $(
        `<input type="range" min="0" max="100" value="0" id="${sliderId}" class="vibrate-slider" data-index="${index}">`,
      )
      vibrateContainer.append($("<div>").append(label).append(slider))
    })
    deviceDiv.append(vibrateContainer)

    // Shared event handler for all vibrate sliders within this device
    vibrateContainer.on("input", ".vibrate-slider", async () => {
      const speeds = []
      vibrateContainer.find(".vibrate-slider").each(function (index) {
        const rawValue = $(this).val()
        const cappedValue = applyMaxVibrate(rawValue, index)
        speeds.push(cappedValue / 100)
      })
      try {
        // Asynchronous execution with a delay
        if (vibrateAttributes && vibrateAttributes.length > 0) {
          for (let i = 0; i < speeds.length; i++) {
            const speed = speeds[i]
            // @ts-ignore
            const scalarCommand = new buttplug.ScalarSubcommand(vibrateAttributes[i].Index, speed, "Vibrate")
            await device.scalar(scalarCommand)
            await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
          }
        }
      } catch (e) {
        console.error("Vibrate command failed:", e)
      }
    })

    const intervalDisplay = $('<div id="intiface-interval-display" style="margin-top: 10px;">Interval: N/A</div>')
    deviceDiv.append(intervalDisplay)

    try {
      // Initialize motors to 0 when connected
      const initialSpeeds = new Array(vibrateAttributes.length).fill(0)
      if (vibrateAttributes && vibrateAttributes.length > 0) {
        for (let i = 0; i < initialSpeeds.length; i++) {
          const speed = initialSpeeds[i]
          // @ts-ignore
          const scalarCommand = new buttplug.ScalarSubcommand(vibrateAttributes[i].Index, speed, "Vibrate")
          await device.scalar(scalarCommand)
          await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
        }
      }
    } catch (e) {
      console.error("Initial vibrate command failed:", e)
    }
  }

  // Oscillate slider
  if (devMode || (device.oscillateAttributes && device.oscillateAttributes.length > 0)) {
      const oscillateSlider = $('<input type="range" min="0" max="100" value="0" id="oscillate-slider">')
      oscillateSlider.on("input", async () => {
        try {
          const rawValue = oscillateSlider.val()
          const cappedValue = applyMaxOscillate(rawValue)
          await device.oscillate(cappedValue / 100)
        } catch (e) {
          // Don't worry about it, some devices don't support this.
        }
      })
      deviceDiv.append("<span>Oscillate: </span>").append(oscillateSlider)
      const oscillateIntervalDisplay = $(
        '<div id="intiface-oscillate-interval-display" style="margin-top: 10px;">Oscillate Interval: N/A</div>',
      )
      deviceDiv.append(oscillateIntervalDisplay)
  }

  // Linear Controls
  if (devMode || (device.linearAttributes && device.linearAttributes.length > 0)) {
      deviceDiv.append("<h4>Linear Controls</h4>")
      const startPosSlider = $('<input type="range" min="0" max="100" value="10" id="start-pos-slider">')
      const endPosSlider = $('<input type="range" min="0" max="100" value="90" id="end-pos-slider">')
      const durationInput = $('<input type="number" id="duration-input" class="text_pole" value="1000" style="width: 100%;">')
      const startStrokerBtn = $('<div class="menu_button">Start Stroking</div>')
      const stopStrokerBtn = $('<div class="menu_button">Stop Stroking</div>')

      deviceDiv.append("<div><span>Start Pos: </span></div>").append(startPosSlider)
      deviceDiv.append("<div><span>End Pos: </span></div>").append(endPosSlider)
      deviceDiv.append("<div><span>Duration (ms): </span></div>").append(durationInput)
      deviceDiv.append(startStrokerBtn).append(stopStrokerBtn)

      let isAtStart = true

      startStrokerBtn.on("click", () => {
        if (strokerIntervalId) clearInterval(strokerIntervalId)
        const duration = Number.parseInt(durationInput.val(), 10) || 1000
        strokerIntervalId = setInterval(async () => {
          const targetPos = isAtStart ? endPosSlider.val() / 100 : startPosSlider.val() / 100
          try {
            await device.linear(targetPos, duration)
            isAtStart = !isAtStart
          } catch (e) {
            const errorMsg = `Manual Linear failed: ${e.message}`
            console.error(errorMsg, e)
            updateStatus(errorMsg, true)
          }
        }, duration)
      })

      stopStrokerBtn.on("click", () => {
        if (strokerIntervalId) {
          clearInterval(strokerIntervalId)
          strokerIntervalId = null
        }
      })
  }

  devicesEl.append(deviceDiv)
}

function handleDeviceRemoved() {
  updateStatus("Device removed")
  device = null
  $("#intiface-devices").empty()
  stopActions()
}

let strokerIntervalId = null
let vibrateIntervalId = null
let oscillateIntervalId = null
let isStroking = false // To control the async stroking loop

async function rescanLastMessage() {
    updateStatus("Rescanning last message...")
    resetQueueState();

    const chat = document.querySelector('#chat');
    if (chat) {
        const messages = chat.querySelectorAll('.mes');
        if (messages.length > 0) {
            const lastMessageDiv = messages[messages.length - 1];
            const textDiv = lastMessageDiv.querySelector('.mes_text');
            if (textDiv) {
                // Use textContent to ensure indices match DOM TextNodes for highlighting
                const text = textDiv.textContent; 
                processText(text, textDiv); // Note: Passing element for highlight
            }
        }
    }
}

// -------------------------------------------------------------------------
// DOM HIGHLIGHTING (CSS Custom Highlight API + Fallback)
// -------------------------------------------------------------------------

function createRangeFromIndices(element, startIndex, endIndex) {
    if (!element) return null;
    
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let currentOffset = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    while (node = walker.nextNode()) {
        const nodeLength = node.nodeValue.length;
        
        // Check for start
        if (!startNode && currentOffset + nodeLength > startIndex) {
            startNode = node;
            startOffset = Math.max(0, startIndex - currentOffset);
        }
        
        // Check for end
        if (startNode && !endNode && currentOffset + nodeLength >= endIndex) {
            endNode = node;
            endOffset = Math.max(0, endIndex - currentOffset);
            break; 
        }
        
        currentOffset += nodeLength;
    }

    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
    }
    return null;
}

function clearHighlights() {
    if (window.CSS && CSS.highlights) {
        CSS.highlights.delete('intiface-reading');
        CSS.highlights.delete('intiface-command');
    }
    // Remove DOM spans if any (fallback)
    const highlights = document.querySelectorAll('.intiface-command-highlight');
    highlights.forEach(el => {
        el.style.backgroundColor = 'transparent';
    });
}

function highlightCommand(element, startIndex, length) {
    if (!element) return;
    
    if (window.CSS && CSS.highlights) {
        // Use Highlight API
        const range = createRangeFromIndices(element, startIndex, startIndex + length);
        if (range) {
            // @ts-ignore
            const highlight = new Highlight(range);
            // @ts-ignore
            CSS.highlights.set('intiface-command', highlight);
            
            // Auto clear after 2 seconds
            setTimeout(() => {
                // We rely on the next command/reading to overwrite or clear if needed.
                // Or we can manually fade out by CSS transition if supported? Highlight API CSS support is limited.
                // For now, let it stick until next action to show "last triggered".
                // But user requested "yellow done THEN pink".
            }, 2000); 
        }
    } else {
        // Fallback: DOM manipulation
        const range = createRangeFromIndices(element, startIndex, startIndex + length);
        if (range) {
            try {
                const span = document.createElement('span');
                span.className = 'intiface-command-highlight';
                range.surroundContents(span);
                setTimeout(() => { 
                    span.style.backgroundColor = 'transparent'; 
                }, 2000);
            } catch (e) {
                console.warn("Intiface: Highlight failed (likely tag boundary issue)", e);
            }
        }
    }
}

function animateReading(element, start, end, duration) {
    // Only support Highlight API for reading animation
    if (!window.CSS || !CSS.highlights) return Promise.resolve();
    if (duration < 50) return Promise.resolve();

    return new Promise(resolve => {
        // If there was an old resolver, call it to unblock previous await (though race condition unlikely in single queue)
        if (readingAnimationResolver) readingAnimationResolver();
        
        readingAnimationResolver = resolve;
        const startTime = performance.now();
        
        // Ensure previous reading highlight is cleared
        CSS.highlights.delete('intiface-reading');

        if (readingAnimationId) cancelAnimationFrame(readingAnimationId);

        function step(now) {
            const elapsed = now - startTime;
            if (elapsed > duration) {
                // @ts-ignore
                CSS.highlights.delete('intiface-reading');
                readingAnimationId = null;
                readingAnimationResolver = null;
                resolve();
                return;
            }
            
            const progress = elapsed / duration;
            const currentPos = Math.floor(start + (end - start) * progress);
            
            // Don't highlight if range is empty
            if (currentPos > start) {
                const range = createRangeFromIndices(element, start, currentPos);
                if (range) {
                    // @ts-ignore
                    const highlight = new Highlight(range);
                    // @ts-ignore
                    CSS.highlights.set('intiface-reading', highlight);
                }
            }
            
            readingAnimationId = requestAnimationFrame(step);
        }
        
        readingAnimationId = requestAnimationFrame(step);
    });
}


// -------------------------------------------------------------------------
// NEW STREAMING & MULTI-COMMAND LOGIC
// -------------------------------------------------------------------------

const REGEX_PATTERNS = {
    LINEAR_PATTERN: /"LINEAR_PATTERN"\s*:\s*({)/gi,
    VIBRATE_ARRAY: /"VIBRATE"\s*:\s*(\[.*?\])/gi,
    VIBRATE_MULTI: /"VIBRATE"\s*:\s*({[^}]+})/gi,
    VIBRATE_SINGLE: /"VIBRATE"\s*:\s*(\d+)/gi,
    OSCILLATE_MULTI: /"OSCILLATE"\s*:\s*({[^}]+})/gi,
    OSCILLATE_SINGLE: /"OSCILLATE"\s*:\s*(\d+)/gi,
    LINEAR: /"LINEAR"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?duration(?:")?\s*:\s*(\d+)\s*}/gi,
    LINEAR_SPEED: /"LINEAR_SPEED"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?start_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?steps(?:")?\s*:\s*(\d+)\s*}/gi
};

function scanForLinearPattern(text) {
    const matches = [];
    const regex = REGEX_PATTERNS.LINEAR_PATTERN;
    regex.lastIndex = 0;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        const objectStartIndex = match.index + match[0].length - 1;
        let balance = 1;
        let objectEndIndex = -1;

        for (let i = objectStartIndex + 1; i < text.length; i++) {
            if (text[i] === "{") {
                balance++;
            } else if (text[i] === "}") {
                balance--;
            }
            if (balance === 0) {
                objectEndIndex = i;
                break;
            }
        }

        if (objectEndIndex !== -1) {
            const jsonString = text.substring(objectStartIndex, objectEndIndex + 1);
            matches.push({
                index: match.index,
                type: 'LINEAR_PATTERN',
                text: match[0] + '...}', // Approximate text for key
                length: (objectEndIndex + 1) - match.index, // Actual length
                fullJson: jsonString
            });
            regex.lastIndex = objectEndIndex + 1;
        }
    }
    return matches;
}

function processText(text, element) {
    if (!device) return;

    // Collect all potential matches
    let allMatches = [];

    // 1. Scan for LINEAR_PATTERN (complex)
    const linearPatterns = scanForLinearPattern(text);
    allMatches = allMatches.concat(linearPatterns);

    // 2. Scan for others
    for (const [type, regex] of Object.entries(REGEX_PATTERNS)) {
        if (type === 'LINEAR_PATTERN') continue;
        
        regex.lastIndex = 0; // Reset regex
        let match;
        while ((match = regex.exec(text)) !== null) {
            allMatches.push({
                index: match.index,
                type: type,
                text: match[0],
                length: match[0].length,
                captures: match
            });
        }
    }

    // 3. Sort by position
    allMatches.sort((a, b) => a.index - b.index);
    
    // Store for looping
    currentMessageMatches = allMatches;
    currentMessageElement = element;

    // 4. Add new matches to Queue
    for (const match of allMatches) {
        const uniqueKey = `${match.index}-${match.text}`;
        
        if (!executedCommands.has(uniqueKey)) {
            console.log(`Intiface: Queuing command at index ${match.index}: ${match.type}`);
            executedCommands.add(uniqueKey);
            addToQueue(match, element);
        }
    }
}

function addToQueue(match, element) {
    commandQueue.push({ ...match, element });
    processQueue();
}

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (commandQueue.length > 0) {
        const cmd = commandQueue[0];
        
        // --- DELAY LOGIC ---
        const distance = cmd.index - lastCommandIndex;
        // Reading speed logic
        const userSpeed = parseInt($("#intiface-reading-speed-input").val()) || 20;
        const readingSpeedMsPerChar = 1000 / userSpeed; 
        
        const calculatedDelay = Math.max(0, distance * readingSpeedMsPerChar);
        const now = Date.now();
        const timeSinceLastExec = now - lastExecTime;
        
        // Wait if simulated reading time hasn't passed
        if (lastExecTime > 0 && distance > 0 && timeSinceLastExec < calculatedDelay) {
            const waitTime = calculatedDelay - timeSinceLastExec;
            
            // Wait for reading animation to FINISH before executing command
            // Use currentMessageElement to handle DOM updates (e.g. Markdown rendering replacing the node)
            await animateReading(currentMessageElement, lastCommandIndex, cmd.index, waitTime);
        }
        
        // --- EXECUTION ---
        commandQueue.shift(); // Remove from queue
        
        // Ensure reading highlight is cleared (just in case)
        if (window.CSS && CSS.highlights) {
            // @ts-ignore
            CSS.highlights.delete('intiface-reading');
        }

        // Use currentMessageElement to ensure we highlight the valid DOM node
        highlightCommand(currentMessageElement, cmd.index, cmd.length);
        await executeCommand(cmd);
        
        lastExecTime = Date.now();
        lastCommandIndex = cmd.index + cmd.length;
    }

    // Handle trailing text after the last command
    if (currentMessageElement) {
        const textContent = currentMessageElement.textContent;
        if (textContent) {
            const totalLength = textContent.length;
            const distance = totalLength - lastCommandIndex;
            
            if (distance > 0) {
                 const readingSpeed = parseInt($("#intiface-reading-speed-input").val()) || 20;
                 const readingSpeedMsPerChar = 1000 / readingSpeed; 
                 const calculatedDelay = Math.max(0, distance * readingSpeedMsPerChar);
                 
                 const now = Date.now();
                 const timeSinceLastExec = now - lastExecTime;
                 
                 if (lastExecTime > 0 && timeSinceLastExec < calculatedDelay) {
                     const waitTime = calculatedDelay - timeSinceLastExec;
                     if (waitTime < 5000) {
                        await animateReading(currentMessageElement, lastCommandIndex, totalLength, waitTime);
                        await new Promise(r => setTimeout(r, waitTime));
                     }
                 }
                 
                 lastExecTime = Date.now();
                 lastCommandIndex = totalLength;
            }
        }
    }
    
    // --- LOOP LOGIC ---
    // Check if queue is empty and looping is enabled
    // Only loop if connected and there are matches
    if (commandQueue.length === 0 && currentMessageMatches.length > 0) {
        if ($('#intiface-loop-pattern-checkbox').is(':checked') && client && client.connected) {
            
            // Loop Delay
            const loopInterval = parseInt($("#intiface-loop-interval-input").val()) || 1000;
            await new Promise(r => setTimeout(r, loopInterval));
            
            // Check again after delay
            if ($('#intiface-loop-pattern-checkbox').is(':checked') && 
                client && client.connected && 
                commandQueue.length === 0) {
                
                console.log("Intiface: Looping message patterns...");
                // Reset indices for loop
                lastCommandIndex = 0; 
                // Reset lastExecTime to NOW so the first command delay is calculated correctly relative to start of message
                lastExecTime = Date.now(); 
                
                for (const match of currentMessageMatches) {
                    // We directly push to queue, bypassing executedCommands check
                    commandQueue.push({ ...match, element: currentMessageElement });
                }
                
                // Trigger queue processing again (recursively, but async)
                isProcessingQueue = false; // Allow re-entry
                processQueue();
                return; // Exit this instance
            }
        }
    }
    
    isProcessingQueue = false;
}


async function executeCommand(matchData) {
    // Stop previous actions when a new one triggers (Override behavior)
    // Exception: LINEAR_PATTERN handles its own stopping internally if valid
    stopActions();

    const { type, captures, fullJson } = matchData;

    try {
        switch (type) {
            case 'LINEAR_PATTERN':
                try {
                    const command = JSON.parse(fullJson);
                    handleLinearPattern(command);
                } catch (e) {
                    console.error("Failed to parse LINEAR_PATTERN JSON", e);
                }
                break;
            case 'VIBRATE_ARRAY':
                if (captures[1]) {
                    const speeds = JSON.parse(captures[1]);
                    handleArrayVibrate(speeds);
                }
                break;
            case 'VIBRATE_MULTI':
                if (captures[1]) {
                    const command = JSON.parse(captures[1]);
                    handleMultiVibrate(command);
                }
                break;
            case 'VIBRATE_SINGLE':
                if (captures[1]) {
                    const intensity = parseInt(captures[1], 10);
                    handleSingleVibrate(intensity);
                }
                break;
            case 'OSCILLATE_MULTI':
                if (captures[1]) {
                    const command = JSON.parse(captures[1]);
                    handleMultiOscillate(command);
                }
                break;
            case 'OSCILLATE_SINGLE':
                if (captures[1]) {
                    const intensity = parseInt(captures[1], 10);
                    handleSingleOscillate(intensity);
                }
                break;
            case 'LINEAR':
                if (captures.length === 4) {
                    const start = parseInt(captures[1], 10);
                    const end = parseInt(captures[2], 10);
                    const dur = parseInt(captures[3], 10);
                    handleLinear(start, end, dur);
                }
                break;
            case 'LINEAR_SPEED':
                 if (captures.length === 6) {
                    const startPos = parseInt(captures[1], 10);
                    const endPos = parseInt(captures[2], 10);
                    const startDur = parseInt(captures[3], 10);
                    const endDur = parseInt(captures[4], 10);
                    const steps = parseInt(captures[5], 10);
                    handleLinearSpeed(startPos, endPos, startDur, endDur, steps);
                }
                break;
        }
    } catch (e) {
        console.error(`Error executing command ${type}:`, e);
        updateStatus(`Command Error: ${e.message}`, true);
    }
}

// -------------------------------------------------------------------------
// COMMAND HANDLERS
// -------------------------------------------------------------------------

function handleLinearPattern(command) {
    const segments = command.segments
    const repeat = command.repeat === true

    if (Array.isArray(segments) && segments.length > 0) {
        let segmentIndex = 0
        let loopIndex = 0
        let durationIndex = 0
        let isAtStart = true

        const executeSegment = async () => {
        if (segmentIndex >= segments.length) {
            if (repeat) {
            segmentIndex = 0
            loopIndex = 0
            durationIndex = 0
            updateStatus("Repeating pattern...")
            strokerIntervalId = setTimeout(executeSegment, 100)
            return
            }
            updateStatus("All segments finished.")
            if (strokerIntervalId) clearTimeout(strokerIntervalId)
            strokerIntervalId = null
            return
        }

        const segment = segments[segmentIndex]
        const startPos = segment.start
        const endPos = segment.end
        const durations = segment.durations
        const loopCount = segment.loop || 1

        if (isNaN(startPos) || isNaN(endPos) || !Array.isArray(durations) || durations.length === 0) {
            segmentIndex++
            executeSegment()
            return
        }

        if (loopIndex >= loopCount) {
            segmentIndex++
            loopIndex = 0
            durationIndex = 0
            executeSegment()
            return
        }

        if (durationIndex >= durations.length) {
            durationIndex = 0
            loopIndex++
        }

        const duration = durations[durationIndex]
        const targetPos = isAtStart ? endPos : startPos

        $("#start-pos-slider").val(startPos).trigger("input")
        $("#end-pos-slider").val(endPos).trigger("input")
        $("#duration-input").val(duration).trigger("input")
        updateStatus(
            `Segment ${segmentIndex + 1}, Loop ${loopIndex + 1}: Stroking to ${targetPos}% over ${duration}ms`,
        )

        try {
            await device.linear(targetPos / 100, duration)
            isAtStart = !isAtStart
            durationIndex++
            if (strokerIntervalId) clearTimeout(strokerIntervalId)
            strokerIntervalId = setTimeout(executeSegment, duration)
        } catch (e) {
            const errorMsg = `Segment ${segmentIndex + 1} failed: ${e.message}`
            console.error(errorMsg, e)
            updateStatus(errorMsg, true)
            if (strokerIntervalId) clearTimeout(strokerIntervalId)

            // Skip to the next segment after a failure
            segmentIndex++
            loopIndex = 0
            durationIndex = 0
            strokerIntervalId = setTimeout(executeSegment, 500) // Wait 0.5s before trying next segment
        }
        }
        executeSegment()
    }
}

async function handleArrayVibrate(speeds) {
    if (Array.isArray(speeds)) {
    const normalizedSpeeds = speeds.map((s, index) => {
        const intensity = Number.parseInt(s, 10)
        const clamped = isNaN(intensity) ? 0 : Math.max(0, Math.min(100, intensity))
        return applyMaxVibrate(clamped, index)
    })

    // Update sliders on UI
    normalizedSpeeds.forEach((speed, index) => {
        $(`#vibrate-slider-${index}`).val(speed)
    })

    const vibrateAttributes = device.vibrateAttributes
    if (vibrateAttributes && vibrateAttributes.length >= normalizedSpeeds.length) {
        // Asynchronous execution with a delay
        for (let i = 0; i < normalizedSpeeds.length; i++) {
        const speed = normalizedSpeeds[i]
        // @ts-ignore
        const scalarCommand = new buttplug.ScalarSubcommand(vibrateAttributes[i].Index, speed / 100, "Vibrate")
        await device.scalar(scalarCommand)
        await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
        }
    } else {
        // Fallback to the original method if something is off, also async
        const speeds = normalizedSpeeds.map((s) => s / 100)
        for (const speed of speeds) {
        await device.vibrate(speed)
        await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
        }
    }
    updateStatus(`Vibrating with pattern: [${normalizedSpeeds.join(", ")}]%`)
    }
}

async function handleMultiVibrate(command) {
    if (command.pattern && Array.isArray(command.pattern) && command.interval) {
        const pattern = command.pattern
        const intervals = Array.isArray(command.interval) ? command.interval : [command.interval]
        const loopCount = command.loop
        let patternIndex = 0
        let currentLoop = 0

        const executeVibration = async () => {
          if (patternIndex >= pattern.length) {
            patternIndex = 0
            currentLoop++
            if (loopCount && currentLoop >= loopCount) {
              if (vibrateIntervalId) clearTimeout(vibrateIntervalId)
              vibrateIntervalId = null
              await device.vibrate(0)
              updateStatus("Vibration pattern finished")
              $("#intiface-interval-display").text("Interval: N/A")
              return
            }
          }
          const patternStep = pattern[patternIndex]
          if (Array.isArray(patternStep)) {
            // It's an array of speeds for multiple motors
            const normalizedSpeeds = patternStep.map((s, index) => {
              const intensity = Number.parseInt(s, 10)
              const clamped = isNaN(intensity) ? 0 : Math.max(0, Math.min(100, intensity))
              return applyMaxVibrate(clamped, index)
            })

            // Update sliders on UI
            normalizedSpeeds.forEach((speed, index) => {
              $(`#vibrate-slider-${index}`).val(speed)
            })

            const vibrateAttributes = device.vibrateAttributes
            if (vibrateAttributes && vibrateAttributes.length >= normalizedSpeeds.length) {
              // Asynchronous execution with a delay
              for (let i = 0; i < normalizedSpeeds.length; i++) {
                const speed = normalizedSpeeds[i]
                // @ts-ignore
                const scalarCommand = new buttplug.ScalarSubcommand(vibrateAttributes[i].Index, speed / 100, "Vibrate")
                await device.scalar(scalarCommand)
                await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
              }
            } else {
              // Fallback to the original method if something is off, also async
              const speeds = normalizedSpeeds.map((s) => s / 100)
              for (const speed of speeds) {
                await device.vibrate(speed)
                await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms delay
              }
            }
            updateStatus(`Vibrating with pattern: [${normalizedSpeeds.join(", ")}]%`)
          } else {
            // It's a single intensity for all motors (backward compatibility)
            const intensity = patternStep
            if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
              const cappedIntensity = applyMaxVibrate(intensity, 0)
              $(".vibrate-slider").val(cappedIntensity)
              await device.vibrate(cappedIntensity / 100)
              updateStatus(`Vibrating at ${cappedIntensity}% (Pattern)`)
            }
          }
          const currentInterval = intervals[patternIndex % intervals.length]
          $("#intiface-interval-display").text(`Interval: ${currentInterval}ms`)
          patternIndex++
          if (vibrateIntervalId) clearTimeout(vibrateIntervalId)
          vibrateIntervalId = setTimeout(executeVibration, currentInterval)
        }
        executeVibration()
      }
}

async function handleSingleVibrate(intensity) {
    if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
      const cappedIntensity = applyMaxVibrate(intensity, 0)
      $(".vibrate-slider").val(cappedIntensity)
      try {
        await device.vibrate(cappedIntensity / 100)
        updateStatus(`Vibrating at ${cappedIntensity}%`)
      } catch (e) {
        updateStatus(`Vibrate command failed: ${e.message}`, true)
      }
    }
}

async function handleMultiOscillate(command) {
    if (command.pattern && Array.isArray(command.pattern) && command.interval) {
        const pattern = command.pattern
        const intervals = Array.isArray(command.interval) ? command.interval : [command.interval]
        const loopCount = command.loop
        let patternIndex = 0
        let currentLoop = 0

        const executeOscillation = async () => {
          if (patternIndex >= pattern.length) {
            patternIndex = 0
            currentLoop++
            if (loopCount && currentLoop >= loopCount) {
              if (oscillateIntervalId) clearTimeout(oscillateIntervalId)
              oscillateIntervalId = null
              try {
                await device.oscillate(0)
              } catch (e) {
                /* Ignore */
              }
              updateStatus("Oscillation pattern finished")
              $("#intiface-oscillate-interval-display").text("Oscillate Interval: N/A")
              return
            }
          }
          const intensity = pattern[patternIndex]
          if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
            const cappedIntensity = applyMaxOscillate(intensity)
            $("#oscillate-slider").val(cappedIntensity).trigger("input")
            try {
              await device.oscillate(cappedIntensity / 100)
            } catch (e) {
              /* Ignore */
            }
            updateStatus(`Oscillating at ${cappedIntensity}% (Pattern)`)
          }
          const currentInterval = intervals[patternIndex % intervals.length]
          $("#intiface-oscillate-interval-display").text(`Oscillate Interval: ${currentInterval}ms`)
          patternIndex++
          if (oscillateIntervalId) clearTimeout(oscillateIntervalId)
          oscillateIntervalId = setTimeout(executeOscillation, currentInterval)
        }
        executeOscillation()
      }
}

async function handleSingleOscillate(intensity) {
    if (!isNaN(intensity) && intensity >= 0 && intensity <= 100) {
      const cappedIntensity = applyMaxOscillate(intensity)
      $("#oscillate-slider").val(cappedIntensity).trigger("input")
      try {
        await device.oscillate(cappedIntensity / 100)
        updateStatus(`Oscillating at ${cappedIntensity}%`)
      } catch (e) {
        // Don't worry about it, some devices don't support this.
      }
    }
}

function handleLinear(startPos, endPos, duration) {
    if (!isNaN(startPos) && !isNaN(endPos) && !isNaN(duration)) {
      updateStatus(`Linear command received: ${startPos}-${endPos}% over ${duration}ms`)
      $("#start-pos-slider").val(startPos).trigger("input")
      $("#end-pos-slider").val(endPos).trigger("input")
      $("#duration-input").val(duration).trigger("input")

      let isAtStart = true
      const move = () =>
        device.linear(isAtStart ? endPos / 100 : startPos / 100, duration).catch((e) => {
          const errorMsg = `Linear command failed: ${e.message}`
          console.error(errorMsg, e)
          updateStatus(errorMsg, true)
        })
      move()
      isAtStart = !isAtStart
      strokerIntervalId = setInterval(() => {
        move()
        isAtStart = !isAtStart
      }, duration)
    }
}

function handleLinearSpeed(startPos, endPos, startDur, endDur, steps) {
    if (!isNaN(startPos) && !isNaN(endPos) && !isNaN(startDur) && !isNaN(endDur) && !isNaN(steps) && steps > 1) {
      $("#start-pos-slider").val(startPos).trigger("input")
      $("#end-pos-slider").val(endPos).trigger("input")

      let isAtStart = true
      let currentStep = 0
      isStroking = true

      const strokerLoop = async () => {
        if (!isStroking) return
        const progress = currentStep / (steps - 1)
        const duration = Math.round(startDur + (endDur - startDur) * progress)
        $("#duration-input").val(duration).trigger("input")
        updateStatus(`Stroking. Duration: ${duration}ms`)
        const targetPos = isAtStart ? endPos / 100 : startPos / 100
        try {
          await device.linear(targetPos, duration)
          await new Promise((resolve) => setTimeout(resolve, duration))
          isAtStart = !isAtStart
          currentStep++
          if (currentStep >= steps) currentStep = 0
          strokerLoop()
        } catch (e) {
          const errorMsg = `Linear Speed command failed: ${e.message}`
          console.error(errorMsg, e)
          updateStatus(errorMsg, true)
          isStroking = false
        }
      }
      strokerLoop()
    }
}

// -------------------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------------------

async function toggleConnection() {
  if (client.connected) {
    await disconnect()
  } else {
    await connect()
  }
}

// Dynamically load the buttplug.js library
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = url
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function initObserver() {
    const chatContainer = document.querySelector('#chat');
    if (!chatContainer) {
        setTimeout(initObserver, 1000); // Retry
        return;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutations) => {
        // Efficiently find the last message
        const messages = chatContainer.querySelectorAll('.mes');
        if (messages.length === 0) return;
        
        const lastMessageDiv = messages[messages.length - 1];
        
        // Generate a unique ID for the current message state to track if we switched messages
        // SillyTavern usually has 'data-ch-name' or similar, but index is good enough for "latest"
        const msgIndex = messages.length - 1;
        // Use a composite ID of index + timestamp if available to detect edits vs new msgs
        // But for now, index is fine. Streaming usually happens on the last index.
        const currentMsgId = `msg-${msgIndex}`;

        if (currentMsgId !== lastMessageId) {
            // New message started
            lastMessageId = currentMsgId;
            resetQueueState();
        }

        const textDiv = lastMessageDiv.querySelector('.mes_text');
        if (textDiv) {
            // Use textContent to ensure indices match DOM TextNodes for highlighting
            const text = textDiv.textContent;
            processText(text, textDiv);
        }
    });

    chatObserver.observe(chatContainer, { 
        childList: true, 
        subtree: true, 
        characterData: true 
    });
    
    console.log("Intiface Plugin: Chat observer initialized.");
}

$(async () => {
  try {
    if (!localStorage.getItem("intifaceDisclaimerShown")) {
      alert(
        "本插件為免費插件，如果你是付費購買的，請立即要求退款。\n對於插件有問題可聯絡提問\n\nThis is a free plugin. If you paid for it, please request a refund immediately.\nIf you have any questions about the plugin, you can contact the author.",
      )
      localStorage.setItem("intifaceDisclaimerShown", "true")
    }
    await loadScript(`/scripts/extensions/third-party/${extensionName}/lib/buttplug.js`)
    // @ts-ignore
    buttplug = window.buttplug
    client = new buttplug.ButtplugClient("SillyTavern Intiface Client") // Initial client

    // Connector is now created dynamically in connect()

    const template = await renderExtensionTemplateAsync(`third-party/${extensionName}`, "settings")
    $("#extensions-settings-button").after(template)

    clickHandlerHack()

    $("#intiface-connect-action-button").on("click", toggleConnection)
    $("#intiface-start-timer-button").on("click", startTimer)
    $("#intiface-pause-timer-button").on("click", togglePauseTimer)
    $("#intiface-rescan-button").on("click", rescanLastMessage)

    // Load saved IP address
    const savedIp = localStorage.getItem("intiface-server-ip")
    if (savedIp) {
      $("#intiface-ip-input").val(savedIp)
    }

    // Save IP on change
    $("#intiface-ip-input").on("input", function () {
      localStorage.setItem("intiface-server-ip", $(this).val())
    })

    // Load saved max vibrate values
    const savedMaxVibrate1 = localStorage.getItem("intiface-max-vibrate-1")
    if (savedMaxVibrate1) {
      $("#intiface-max-vibrate-1-input").val(savedMaxVibrate1)
    }

    const savedMaxVibrate2 = localStorage.getItem("intiface-max-vibrate-2")
    if (savedMaxVibrate2) {
      $("#intiface-max-vibrate-2-input").val(savedMaxVibrate2)
    }

    const savedMaxOscillate = localStorage.getItem("intiface-max-oscillate")
    if (savedMaxOscillate) {
      $("#intiface-max-oscillate-input").val(savedMaxOscillate)
    }

    $("#intiface-max-vibrate-1-input").on("input", function () {
      localStorage.setItem("intiface-max-vibrate-1", $(this).val())
    })

    $("#intiface-max-vibrate-2-input").on("input", function () {
      localStorage.setItem("intiface-max-vibrate-2", $(this).val())
    })

    $("#intiface-max-oscillate-input").on("input", function () {
      localStorage.setItem("intiface-max-oscillate", $(this).val())
    })

    // Loop setting
    const savedLoopSetting = localStorage.getItem("intiface-loop-pattern") === "true";
    $("#intiface-loop-pattern-checkbox").prop("checked", savedLoopSetting);
    
    // Initial visibility
    $("#intiface-loop-interval-container").toggle(savedLoopSetting);

    $("#intiface-loop-pattern-checkbox").on("change", function() {
        const isChecked = $(this).is(":checked");
        localStorage.setItem("intiface-loop-pattern", isChecked);
        $("#intiface-loop-interval-container").toggle(isChecked);
    });

    // Loop Interval setting
    const savedLoopInterval = localStorage.getItem("intiface-loop-interval");
    if (savedLoopInterval) {
        $("#intiface-loop-interval-input").val(savedLoopInterval);
    }
    $("#intiface-loop-interval-input").on("input", function() {
        const val = parseInt($(this).val());
        if (!isNaN(val) && val >= 0) {
            localStorage.setItem("intiface-loop-interval", val.toString());
        }
    });

    // Reading Speed setting
    const savedReadingSpeed = localStorage.getItem("intiface-reading-speed");
    if (savedReadingSpeed) {
        $("#intiface-reading-speed-input").val(savedReadingSpeed);
    }
    $("#intiface-reading-speed-input").on("input", function() {
        const val = parseInt($(this).val());
        if (!isNaN(val) && val > 0) {
            localStorage.setItem("intiface-reading-speed", val.toString());
        }
    });

    // Dev Mode setting
    const savedDevMode = localStorage.getItem("intiface-dev-mode") === "true";
    $("#intiface-dev-mode-checkbox").prop("checked", savedDevMode);
    $("#intiface-dev-mode-checkbox").on("change", function() {
        const isChecked = $(this).is(":checked");
        localStorage.setItem("intiface-dev-mode", isChecked);
        // Refresh UI if connected
        if (client && client.connected && device) {
            handleDeviceAdded(device);
        }
    });

    // Colors
    const defaultReadingColor = "rgba(255, 255, 0, 0.3)";
    const defaultCommandColor = "rgba(255, 105, 180, 0.6)";

    function initColorPickers() {
        const reading = localStorage.getItem("intiface-reading-color") || defaultReadingColor;
        const command = localStorage.getItem("intiface-command-color") || defaultCommandColor;
        
        // Initial CSS vars
        document.documentElement.style.setProperty('--intiface-reading-color', reading);
        document.documentElement.style.setProperty('--intiface-command-color', command);

        // Inject Pickers dynamically to bypass HTML sanitization
        const readingPicker = $('<toolcool-color-picker id="intiface-reading-color-picker"></toolcool-color-picker>');
        const commandPicker = $('<toolcool-color-picker id="intiface-command-color-picker"></toolcool-color-picker>');
        
        readingPicker.attr('color', reading);
        commandPicker.attr('color', command);
        
        // Add some style to ensure they look like buttons if default style is missing
        const pickerStyle = {
            'cursor': 'pointer',
            'display': 'inline-block'
        };
        readingPicker.css(pickerStyle);
        commandPicker.css(pickerStyle);

        $("#intiface-reading-color-picker-container").append(readingPicker);
        $("#intiface-command-color-picker-container").append(commandPicker);

        // Event Listeners
        readingPicker[0].addEventListener('change', (evt) => {
            // @ts-ignore
            const val = evt.detail.rgba;
            localStorage.setItem("intiface-reading-color", val);
            document.documentElement.style.setProperty('--intiface-reading-color', val);
        });
        
        commandPicker[0].addEventListener('change', (evt) => {
            // @ts-ignore
            const val = evt.detail.rgba;
            localStorage.setItem("intiface-command-color", val);
            document.documentElement.style.setProperty('--intiface-command-color', val);
        });
    }
    
    initColorPickers();

    updateButtonStates(client.connected)
    updateStatus("Disconnected")

    // Start Observer
    initObserver();

  } catch (error) {
    console.error(`${NAME}: Failed to initialize.`, error)
    const statusPanel = $("#intiface-status-panel")
    if (statusPanel.length) {
      updateStatus("Failed to load Buttplug.js. Check console.", true)
    }
  }
})
