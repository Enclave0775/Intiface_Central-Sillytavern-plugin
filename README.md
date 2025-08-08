# Lovense Connect for SillyTavern

This is an extension for SillyTavern that allows you to connect and control Lovense devices using [Intiface Desktop](https://intiface.com/).

## Features

*   **Connect to Lovense Devices:** Easily connect to your Lovense toys via the Buttplug protocol, powered by Intiface.
*   **Manual Control:** A simple slider in the UI allows you to manually control the vibration intensity of your connected device.
*   **Chat-Driven Control:** Automate the experience by sending commands directly through the SillyTavern chat. The extension listens for specific commands in the last message to adjust the device's intensity.
*   **Automatic Start:** The device will automatically start vibrating at 50% intensity upon successful connection.

## Installation

1.  Download and install [Intiface Desktop](https://intiface.com/).
2.  Place the `lovense-sillytavern-plugin` folder into your SillyTavern's `public/scripts/extensions/third-party` directory.
3.  Restart SillyTavern.

## How to Use

1.  **Start Intiface Desktop:** Launch Intiface and start the server. This will open a WebSocket server at `ws://127.0.0.1:12345`, which the extension needs to connect to.
2.  **Open SillyTavern:** Navigate to your SillyTavern instance.
3.  **Connect the Extension:**
    *   You will see a new Lovense icon in the top-right menu. Click it to open the control panel.
    *   Click the **Connect** button. The status should change to "Connected".
4.  **Scan for Devices:**
    *   Click the **Scan** button. Intiface will start scanning for Bluetooth devices.
    *   Once a device is found, it will appear in the panel with a "Vibrate" slider.
5.  **Control Your Device:**
    *   **Manual Control:** Drag the slider to set the vibration intensity manually.
    *   **Chat Control:** Send a message in the chat containing a specific JSON command. The extension will parse the last message and adjust the device accordingly.

## Chat Command Format

To control the device via chat, your message must contain a JSON object with a `"VIBRATE"` key. The value should be a number between 0 and 100.

**Example:**

To set the vibration intensity to 80%, include the following in your message:

```json
{
  "VIBRATE": 80
}
```

The extension will automatically detect this command and set the device's vibration to 80%.
