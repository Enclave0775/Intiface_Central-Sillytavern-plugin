# Intiface Central for SillyTavern

This is an extension for SillyTavern that allows you to connect and control Intiface_Central devices using [Intiface Desktop](https://intiface.com/).

## Features

*   **Connect to Intiface Central:** Easily connect to your toys via the Buttplug protocol, powered by Intiface.
*   **Manual Control:** Simple sliders and input fields in the UI allow you to manually control the vibration intensity, oscillation, linear position, and movement duration of your connected device.
*   **Chat-Driven Control:** Automate the experience by sending commands directly through the SillyTavern chat. The extension listens for specific commands in the last message to adjust the device's functions.
*   **Automatic Start:** The device will automatically start vibrating at 50% intensity upon successful connection.

## Installation

1.  Open SillyTavern.
2.  Click the "Extensions" button in the top toolbar.
3.  Click "Install Extension".
4.  Copy this URL into the input field: https://github.com/Enclave0775/Intiface_Central-Sillytavern-plugin
5.  Click "Install just for me" or "Install for all users".

## How to Use

1.  **Start Intiface Desktop:** Launch Intiface and start the server. This will open a WebSocket server at `ws://127.0.0.1:12345`, which the extension needs to connect to.
2.  **Open SillyTavern:** Navigate to your SillyTavern instance.
3.  **Connect the Extension:**
    *   You will see a new electrocardiogram icon in the top-right menu. Click it to open the control panel.
    *   Click the **Connect** button. The status should change to "Connected".
4.  **Scan for Devices:**
    *   Click the **Scan** button. Intiface will start scanning for Bluetooth devices.
    *   Once a device is found, it will appear in the panel with "Vibrate", "Oscillate", and "Linear" controls.
5.  **Control Your Device:**
    *   **Manual Control:** Drag the sliders to set the vibration, oscillation, and linear position. You can also specify the duration in milliseconds for the linear movement in the provided input field.
    *   **Chat Control:** Send a message in the chat containing specific commands. The extension will parse the last message and adjust the device accordingly.

## Chat Command Formats

The extension supports multiple commands, including `VIBRATE`, `OSCILLATE`, `LINEAR`, `LINEAR_SPEED`, and `LINEAR_PATTERN`.

### Vibrate Command

To control the vibration, your message must contain a `"VIBRATE"` key. The value can be a number between 0 and 100, or an object for pattern-based vibration.

**Example (Single Value):**

To set the vibration intensity to 80%, include the following in your message:
`"VIBRATE": 80`

**Example (Pattern):**

To create a vibration pattern, provide an object with a `pattern` array and an `interval` (or array of intervals).
`"VIBRATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [1000, 3000]}`

**Controlling the Loop:**

You can also add a `"loop"` property to the pattern object to specify how many times the pattern should repeat. If the `"loop"` property is omitted, the pattern will repeat indefinitely.

**Example (Pattern with Loop):**
`"VIBRATE": {"pattern": [20, 100, 20], "interval": 1000, "loop": 3}`
This will execute the vibration pattern three times and then stop.

### Oscillate Command

To control the oscillation, your message must contain an `"OSCILLATE"` key. The value can be a number between 0 and 100, or an object for pattern-based oscillation.

**Example (Single Value):**

To set the oscillation intensity to 80%, include the following in your message:
`"OSCILLATE": 80`

**Example (Pattern):**

To create an oscillation pattern, provide an object with a `pattern` array and an `interval` (or array of intervals).
`"OSCILLATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [2000, 3000]}`

**Controlling the Loop:**

You can also add a `"loop"` property to the pattern object to specify how many times the pattern should repeat. If the `"loop"` property is omitted, the pattern will repeat indefinitely.

**Example (Pattern with Loop):**
`"OSCILLATE": {"pattern": [20, 80, 20], "interval": 1000, "loop": 5}`
This will execute the oscillation pattern five times and then stop.

**Note:** The extension will attempt to send the `OSCILLATE` command even if the connected device does not explicitly support it.

### Linear Command

To control linear movement, your message must contain a `"LINEAR"` key with an object containing `start_position`, `end_position`, and `duration`.
*   `start_position`: A number between 0 and 100 representing the starting position.
*   `end_position`: A number between 0 and 100 representing the target position.
*   `duration`: A number representing the time in milliseconds to take to reach the position.

**Example:**

To move the device from 10% to 90% position over 2 seconds (2000ms), include the following in your message:
`"LINEAR": {"start_position": 10, "end_position": 90, "duration": 2000}`

### Linear Speed Gradient Command

To create a smooth, gradual change in speed (a speed ramp), use the `LINEAR_SPEED` command. This is ideal for creating build-up or cool-down effects.

*   `start_position`, `end_position`: The fixed range of motion.
*   `start_duration`: The duration of the first stroke (e.g., a high value for slow speed).
*   `end_duration`: The duration of the final stroke (e.g., a low value for high speed).
*   `steps`: The number of strokes it will take to transition from the start duration to the end duration.

**Example:**

To move the device between 10% and 90%, and have the speed gradually increase from a 2-second stroke to a 0.5-second stroke over 10 steps:
`"LINEAR_SPEED": {"start_position": 10, "end_position": 90, "start_duration": 2000, "end_duration": 500, "steps": 10}`

### Advanced Linear Pattern Command

To create complex linear movement patterns with variable positions, speeds, and loops, use the `LINEAR_PATTERN` command with a `segments` structure. This allows you to chain multiple, distinct movement patterns together.

The command must contain a `"LINEAR_PATTERN"` key with an object containing a `segments` array.

```json
"LINEAR_PATTERN": {
  "repeat": true,
  "segments": [
    { "start": 10, "end": 90, "durations": [1000, 500], "loop": 3 },
    { "start": 20, "end": 80, "durations": [1200], "loop": 5 }
  ]
}
```

*   **`segments`**: An array of segment objects. The extension will execute these segments sequentially.
*   **`repeat`** (optional): If set to `true`, the entire sequence of segments will repeat indefinitely.
*   **Each segment object contains:**
    *   `start`: The starting position (0-100) for this segment's back-and-forth motion.
    *   `end`: The ending position (0-100) for this segment's motion.
    *   `durations`: An array of durations (in milliseconds). The device will cycle through these durations for each stroke within the segment. If only one duration is provided, it will be used for all strokes in that segment.
    *   `loop` (optional): The number of times this specific segment (including its full `durations` cycle) should repeat. Defaults to `1` if omitted.

**Example Explained:**

In the example above, the device will:
1.  First, execute **Segment 1**:
    *   Move between `10%` and `90%`.
    *   The first stroke will take 1000ms, the second will take 500ms, the third will take 1000ms, and so on.
    *   This segment will repeat `3` times.
2.  After completing Segment 1, it will automatically begin **Segment 2**:
    *   Move between `20%` and `80%`.
    *   Every stroke in this segment will take 1200ms.
    *   This segment will repeat `5` times.
3.  Because `"repeat": true` is present, after Segment 2 is finished, the device will automatically go back to Segment 1 and start the entire pattern over again.
