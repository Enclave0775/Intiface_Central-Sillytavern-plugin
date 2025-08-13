
# Intiface Central for SillyTavern

This is an extension for SillyTavern that allows you to connect and control Lovense devices using [Intiface Desktop](https://intiface.com/).

## Features

*   **Connect to Intiface Central:** Easily connect to your toys via the Buttplug protocol, powered by Intiface.
*   **Manual Control:** Simple sliders and input fields in the UI allow you to manually control the vibration intensity, linear position, and movement duration of your connected device.
*   **Chat-Driven Control:** Automate the experience by sending commands directly through the SillyTavern chat. The extension listens for specific commands in the last message to adjust the device's functions.
*   **Automatic Start:** The device will automatically start vibrating at 50% intensity upon successful connection.

## Installation

1.  Open SillyTavern.
2.  Click the "Extensions" button in the top toolbar.
3.  Click "Install Extension".
4.  Copy this URL into the input field: https://github.com/Enclave0775/Lovense-Sillytavern-plugin
5.  Click "Install just for me" or "Install for all users".

## How to Use

1.  **Start Intiface Desktop:** Launch Intiface and start the server. This will open a WebSocket server at `ws://127.0.0.1:12345`, which the extension needs to connect to.
2.  **Open SillyTavern:** Navigate to your SillyTavern instance.
3.  **Connect the Extension:**
    *   You will see a new Lovense icon in the top-right menu. Click it to open the control panel.
    *   Click the **Connect** button. The status should change to "Connected".
4.  **Scan for Devices:**
    *   Click the **Scan** button. Intiface will start scanning for Bluetooth devices.
    *   Once a device is found, it will appear in the panel with "Vibrate" and "Linear" controls.
5.  **Control Your Device:**
    *   **Manual Control:** Drag the sliders to set the vibration and linear position. You can also specify the duration in milliseconds for the linear movement in the provided input field.
    *   **Chat Control:** Send a message in the chat containing specific commands. The extension will parse the last message and adjust the device accordingly.

## Chat Command Formats

The extension supports two primary commands: `VIBRATE` and `LINEAR`.

### Vibrate Command

To control the vibration, your message must contain a `"VIBRATE"` key. The value should be a number between 0 and 100.

**Example:**

To set the vibration intensity to 80%, include the following in your message:
`"VIBRATE": 80`

### Linear Command

To control linear movement, your message must contain a `"LINEAR"` key with an object containing `position` and `duration`.
*   `position`: A number between 0 and 100 representing the target position.
*   `duration`: A number representing the time in milliseconds to take to reach the position.

**Example:**

To move the device to the 60% position over 1.5 seconds (1500ms), include the following in your message:
`"LINEAR": {"start_position":  10, "end_position": 90, "duration": 2000};`

The extension will automatically detect these commands and control the device accordingly.

**Note:** After a `LINEAR` command is executed, the device will automatically return to position 0 after the specified duration, creating a "thrust" or "pump" effect.
