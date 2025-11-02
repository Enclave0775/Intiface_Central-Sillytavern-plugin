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
let intervalId
let disconnectTimerId = null
let countdownIntervalId = null
let isTimerPaused = false
let remainingTimeOnPause = 0
let disconnectTime = 0

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

async function connect() {
  try {
    const serverIp = $("#intiface-ip-input").val()
    const serverUrl = `ws://${serverIp}`
    localStorage.setItem("intiface-server-ip", serverIp) // Save on connect
    connector = new buttplug.ButtplugBrowserWebsocketClientConnector(serverUrl)
    updateStatus("Connecting...")
    await client.connect(connector)
    updateStatus("Connected")
    $("#intiface-status-panel").removeClass("disconnected").addClass("connected")
    updateButtonStates(true)
    intervalId = setInterval(processMessage, 1000) // Start processing messages
  } catch (e) {
    updateStatus(`Error connecting: ${e.message}`, true)
  }
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
    if (intervalId) {
      clearInterval(intervalId) // Stop processing messages
      intervalId = null
    }
    if (strokerIntervalId) {
      clearInterval(strokerIntervalId)
      strokerIntervalId = null
    }
    isStroking = false
    if (vibrateIntervalId) {
      clearTimeout(vibrateIntervalId)
      vibrateIntervalId = null
    }
    if (oscillateIntervalId) {
      clearTimeout(oscillateIntervalId)
      oscillateIntervalId = null
    }
  } catch (e) {
    updateStatus(`Error disconnecting: ${e.message}`, true)
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

  // Vibrate sliders
  const vibrateAttributes = device.vibrateAttributes
  if (vibrateAttributes && vibrateAttributes.length > 0) {
    const vibrateContainer = $('<div id="vibrate-controls"></div>')
    vibrateAttributes.forEach((attr, index) => {
      const sliderId = `vibrate-slider-${index}`
      const label = $(`<span>Vibrate ${index + 1}: </span>`)
      const slider = $(
        `<input type="range" min="0" max="100" value="50" id="${sliderId}" class="vibrate-slider" data-index="${index}">`,
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
      // Vibrate all motors at 30% intensity when connected (sequentially)
      const initialSpeeds = new Array(vibrateAttributes.length).fill(0.3)
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

  // Linear Controls
  deviceDiv.append("<h4>Linear Controls</h4>")
  const startPosSlider = $('<input type="range" min="0" max="100" value="10" id="start-pos-slider">')
  const endPosSlider = $('<input type="range" min="0" max="100" value="90" id="end-pos-slider">')
  const durationInput = $('<input type="number" id="duration-input" value="1000" style="width: 60px;">')
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

  devicesEl.append(deviceDiv)
}

function handleDeviceRemoved() {
  updateStatus("Device removed")
  device = null
  $("#intiface-devices").empty()
  if (strokerIntervalId) {
    clearInterval(strokerIntervalId)
    strokerIntervalId = null
  }
  isStroking = false
  if (vibrateIntervalId) {
    clearTimeout(vibrateIntervalId)
    vibrateIntervalId = null
  }
  if (oscillateIntervalId) {
    clearTimeout(oscillateIntervalId)
    oscillateIntervalId = null
  }
}

let strokerIntervalId = null
let vibrateIntervalId = null
let oscillateIntervalId = null
let lastProcessedMessage = null
let isStroking = false // To control the async stroking loop

async function rescanLastMessage() {
  updateStatus("Rescanning last message...")
  lastProcessedMessage = null
  await processMessage()
}

async function processMessage() {
  if (!device) return

  const context = getContext()
  const lastMessage = context.chat[context.chat.length - 1]

  if (!lastMessage || !lastMessage.mes || lastMessage.mes === lastProcessedMessage) {
    return // No new message or message already processed
  }

  const stopActions = () => {
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
    if (strokerIntervalId) {
      clearInterval(strokerIntervalId)
      strokerIntervalId = null
    }
    isStroking = false
  }

  const messageText = lastMessage.mes

  // Special handler for complex, nested LINEAR_PATTERN command
  const linearPatternRegex = /"LINEAR_PATTERN"\s*:\s*({)/i
  const linearPatternMatch = messageText.match(linearPatternRegex)

  if (linearPatternMatch) {
    const objectStartIndex = linearPatternMatch.index + linearPatternMatch[0].length - 1
    let balance = 1
    let objectEndIndex = -1

    for (let i = objectStartIndex + 1; i < messageText.length; i++) {
      if (messageText[i] === "{") {
        balance++
      } else if (messageText[i] === "}") {
        balance--
      }
      if (balance === 0) {
        objectEndIndex = i
        break
      }
    }

    if (objectEndIndex !== -1) {
      const jsonString = messageText.substring(objectStartIndex, objectEndIndex + 1)
      try {
        const command = JSON.parse(jsonString)
        // If parsing is successful, we have a valid command. Execute and return.
        lastProcessedMessage = messageText
        stopActions()

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
        return // Exit after handling LINEAR_PATTERN
      } catch (e) {
        console.error("Could not parse LINEAR_PATTERN command. String was:", jsonString, "Error:", e)
        // Not a valid JSON object, fall through to legacy regex methods
      }
    }
  }

  // Regex definitions from the old, working version
  const arrayVibrateRegex = /"VIBRATE"\s*:\s*(\[.*?\])/i
  const multiVibrateRegex = /"VIBRATE"\s*:\s*({[^}]+})/i
  const singleVibrateRegex = /"VIBRATE"\s*:\s*(\d+)/i
  const multiOscillateRegex = /"OSCILLATE"\s*:\s*({[^}]+})/i
  const singleOscillateRegex = /"OSCILLATE"\s*:\s*(\d+)/i
  const linearRegex =
    /"LINEAR"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?duration(?:")?\s*:\s*(\d+)\s*}/i
  const linearSpeedRegex =
    /"LINEAR_SPEED"\s*:\s*{\s*(?:")?start_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_position(?:")?\s*:\s*(\d+)\s*,\s*(?:")?start_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?end_duration(?:")?\s*:\s*(\d+)\s*,\s*(?:")?steps(?:")?\s*:\s*(\d+)\s*}/i

  const arrayVibrateMatch = messageText.match(arrayVibrateRegex)
  const multiVibrateMatch = messageText.match(multiVibrateRegex)
  const singleVibrateMatch = messageText.match(singleVibrateRegex)
  const multiOscillateMatch = messageText.match(multiOscillateRegex)
  const singleOscillateMatch = messageText.match(singleOscillateRegex)
  const linearMatch = messageText.match(linearRegex)
  const linearSpeedMatch = messageText.match(linearSpeedRegex)

  // This is the old, working check
  if (
    arrayVibrateMatch ||
    multiVibrateMatch ||
    singleVibrateMatch ||
    linearMatch ||
    linearSpeedMatch ||
    multiOscillateMatch ||
    singleOscillateMatch
  ) {
    lastProcessedMessage = messageText
  } else {
    return // Not a command message, do nothing.
  }

  stopActions()

  // OLD, WORKING if/else if structure
  if (arrayVibrateMatch && arrayVibrateMatch[1]) {
    try {
      const speeds = JSON.parse(arrayVibrateMatch[1])
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
    } catch (e) {
      console.error("Could not parse array VIBRATE command.", e)
    }
  } else if (multiVibrateMatch && multiVibrateMatch[1]) {
    try {
      const command = JSON.parse(multiVibrateMatch[1])
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
    } catch (e) {
      console.error("Could not parse multi-level VIBRATE command.", e)
    }
  } else if (singleVibrateMatch && singleVibrateMatch[1]) {
    const intensity = Number.parseInt(singleVibrateMatch[1], 10)
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
  } else if (linearMatch && linearMatch.length === 4) {
    const startPos = Number.parseInt(linearMatch[1], 10)
    const endPos = Number.parseInt(linearMatch[2], 10)
    const duration = Number.parseInt(linearMatch[3], 10)

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
  } else if (linearSpeedMatch && linearSpeedMatch.length === 6) {
    const startPos = Number.parseInt(linearSpeedMatch[1], 10)
    const endPos = Number.parseInt(linearSpeedMatch[2], 10)
    const startDur = Number.parseInt(linearSpeedMatch[3], 10)
    const endDur = Number.parseInt(linearSpeedMatch[4], 10)
    const steps = Number.parseInt(linearSpeedMatch[5], 10)

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
  } else if (multiOscillateMatch && multiOscillateMatch[1]) {
    try {
      const command = JSON.parse(multiOscillateMatch[1])
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
    } catch (e) {
      console.error("Could not parse multi-level OSCILLATE command.", e)
    }
  } else if (singleOscillateMatch && singleOscillateMatch[1]) {
    const intensity = Number.parseInt(singleOscillateMatch[1], 10)
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
}

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
    client = new buttplug.ButtplugClient("SillyTavern Intiface Client")

    // Connector is now created dynamically in connect()
    // connector = new buttplug.ButtplugBrowserWebsocketClientConnector("ws://127.0.0.1:12345");

    client.on("deviceadded", handleDeviceAdded)
    client.on("deviceremoved", handleDeviceRemoved)

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

    updateButtonStates(client.connected)
    updateStatus("Disconnected")
  } catch (error) {
    console.error(`${NAME}: Failed to initialize.`, error)
    const statusPanel = $("#intiface-status-panel")
    if (statusPanel.length) {
      updateStatus("Failed to load Buttplug.js. Check console.", true)
    }
  }
})
