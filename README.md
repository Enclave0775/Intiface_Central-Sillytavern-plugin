# Intiface Central for SillyTavern

[中文版](README_zh.md)

This is an extension for SillyTavern that allows you to connect and control Intiface_Central devices using [Intiface Desktop](https://intiface.com/).

## Features

*   **Connect to Intiface Central:** Easily connect to your toys via the Buttplug protocol, powered by Intiface.
*   **Manual Control:** Simple sliders and input fields in the UI allow you to manually control the vibration intensity, oscillation, linear position, and movement duration of your connected device.
*   **Chat-Driven Control:** Automate the experience by sending commands directly through the SillyTavern chat. The extension scans the latest message (both AI and User) for specific commands to adjust the device's functions.
*   **Sequential Execution & Reading Pace:** When multiple commands are present in a message, they are executed in sequence. The extension simulates a "reading speed" to delay the execution of subsequent commands based on the distance between them in the text, creating a natural flow synced with the text.
*   **Visual Highlights:**
    *   **Reading Highlight (Yellow):** A "karaoke-style" highlight scans through the text to visualize the simulated reading progress.
    *   **Command Highlight (Pink):** When a command is triggered, it lights up in pink to indicate activation.
    *   *Colors are customizable in settings.*
*   **Loop Mode:** Optionally loop the commands in the last message indefinitely with a customizable delay interval.
*   **Smart UI:** The control panel automatically hides unsupported features (like Linear controls on a Vibrator) unless "Developer Mode" is enabled.

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
    *   The extension will automatically scan for and list connected devices.
4.  **Settings:**
    *   **Loop Message Patterns:** Check this to repeat the commands in the current message after they finish.
    *   **Loop Interval:** Set the delay (in ms) between loops.
    *   **Reading Speed:** Set the speed (chars/second) for the reading highlight simulation. Default is 20.
    *   **Developer Mode:** Check this to show all control sliders regardless of device capabilities.
    *   **Colors:** Customize the highlight colors for reading and commands.
5.  **Control Your Device:**
    *   **Manual Control:** Drag the sliders to set the vibration, oscillation, and linear position.
    *   **Chat Control:** Send a message in the chat containing specific commands.

## Chat Command Formats

The extension supports multiple commands, including `VIBRATE`, `OSCILLATE`, `LINEAR`, `LINEAR_SPEED`, and `LINEAR_PATTERN`.

### Vibrate Command

To control the vibration, your message must contain a `"VIBRATE"` key. The value can be a number between 0 and 100, or an object for pattern-based vibration.

**Example (Single Value):**

`"VIBRATE": 80`

**Example (Pattern):**

To create a vibration pattern, provide an object with a `pattern` array and an `interval` (or array of intervals).
`"VIBRATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [1000, 3000]}`

### Oscillate Command

To control the oscillation, your message must contain an `"OSCILLATE"` key.

**Example (Single Value):**

`"OSCILLATE": 80`

**Example (Pattern):**

`"OSCILLATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [2000, 3000]}`

### Linear Command

To control linear movement.

**Example:**

To move the device from 10% to 90% position over 2 seconds (2000ms):
`"LINEAR": {"start_position": 10, "end_position": 90, "duration": 2000}`

### Linear Speed Gradient Command

To create a smooth, gradual change in speed (a speed ramp).

**Example:**

To move the device between 10% and 90%, and have the speed gradually increase from a 2-second stroke to a 0.5-second stroke over 10 steps:
`"LINEAR_SPEED": {"start_position": 10, "end_position": 90, "start_duration": 2000, "end_duration": 500, "steps": 10}`

### Advanced Linear Pattern Command

To create complex linear movement patterns with variable positions, speeds, and loops.

```json
"LINEAR_PATTERN": {
  "repeat": true,
  "segments": [
    { "start": 10, "end": 90, "durations": [1000, 500], "loop": 3 },
    { "start": 20, "end": 80, "durations": [1200], "loop": 5 }
  ]
}
```
