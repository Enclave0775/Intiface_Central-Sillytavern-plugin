# Intiface Central for SillyTavern

這是一個 SillyTavern 的擴展插件，允許您使用 [Intiface Desktop](https://intiface.com/) 連接並控制 Intiface_Central 設備。

[English Version](README.md)

## 功能特色

*   **連接到 Intiface Central：** 透過 Intiface 提供的 Buttplug 協議輕鬆連接您的玩具。
*   **手動控制：** 介面中提供簡單的滑桿和輸入框，讓您手動控制連接設備的震動強度、擺動、線性位置和移動持續時間。
*   **聊天驅動控制：** 透過 SillyTavern 聊天直接發送指令來自動化體驗。插件會監聽最新訊息中的特定指令來調整設備功能。
*   **順序執行與閱讀節奏：** 當一則訊息中有多個指令時，它們會依序執行。插件會模擬「閱讀速度」，根據指令在文本中的距離來延遲執行後續指令，創造出與閱讀同步的自然流暢感。
*   **視覺高亮：**
    *   **閱讀高亮 (黃色)：** 「卡拉OK式」的高亮效果會掃過文本，顯示模擬的閱讀進度。
    *   **指令高亮 (粉色)：** 當指令被觸發時，會亮起粉紅色以示激活。
    *   *顏色可在設定中自定義。*
*   **循環模式：** 可選擇無限循環播放最新訊息中的指令，並可自訂循環間隔。
*   **智慧介面：** 控制面板會自動隱藏不支援的功能（例如在震動器上隱藏線性控制），除非啟用了「開發者模式」。

## 安裝方式

1.  開啟 SillyTavern。
2.  點擊頂部工具列的 "Extensions" (擴展) 按鈕。
3.  點擊 "Install Extension" (安裝擴展)。
4.  將此網址複製到輸入框中：https://github.com/Enclave0775/Intiface_Central-Sillytavern-plugin
5.  點擊 "Install just for me" 或 "Install for all users"。

## 使用方法

1.  **啟動 Intiface Desktop：** 啟動 Intiface 並開啟伺服器。這將在 `ws://127.0.0.1:12345` 開啟 WebSocket 伺服器，插件需要連接到此處。
2.  **開啟 SillyTavern：** 前往您的 SillyTavern 頁面。
3.  **連接插件：**
    *   您會在右上角選單看到一個新的心電圖圖示。點擊它打開控制面板。
    *   點擊 **Connect** 按鈕。狀態應變為 "Connected"。
    *   插件會自動掃描並列出已連接的設備。
4.  **設定：**
    *   **循環執行指令 (Loop Message Patterns)：** 勾選此項以在指令執行完畢後重複播放當前訊息的指令。
    *   **循環間隔 (Loop Interval)：** 設定循環之間的延遲時間（毫秒）。
    *   **閱讀速度 (Reading Speed)：** 設定閱讀高亮模擬的速度（字/秒）。預設為 20。
    *   **開發者模式 (Developer Mode)：** 勾選此項以顯示所有控制滑桿，無論設備是否支援。
    *   **顏色 (Colors)：** 自定義閱讀和指令的高亮顏色。
5.  **控制您的設備：**
    *   **手動控制：** 拖動滑桿來設定震動、擺動和線性位置。
    *   **聊天控制：** 在聊天中發送包含特定指令的訊息。

## 聊天指令格式

插件支援多種指令，包括 `VIBRATE`、`OSCILLATE`、`LINEAR`、`LINEAR_SPEED` 和 `LINEAR_PATTERN`。

### 震動指令 (Vibrate)

要控制震動，您的訊息必須包含 `"VIBRATE"` 鍵。值可以是 0 到 100 之間的數字，或是用於模式震動的物件。

**範例 (單一數值)：**

`"VIBRATE": 80`

**範例 (模式)：**

要建立震動模式，請提供一個包含 `pattern` 陣列和 `interval`（或間隔陣列）的物件。
`"VIBRATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [1000, 3000]}`

### 擺動指令 (Oscillate)

要控制擺動，您的訊息必須包含 `"OSCILLATE"` 鍵。

**範例 (單一數值)：**

`"OSCILLATE": 80`

**範例 (模式)：**

`"OSCILLATE": {"pattern": [20, 40, 20, 40, 30, 100], "interval": [2000, 3000]}`

### 線性指令 (Linear)

控制線性移動。

**範例：**

在 2 秒 (2000ms) 內將設備從 10% 移動到 90% 位置：
`"LINEAR": {"start_position": 10, "end_position": 90, "duration": 2000}`

### 線性速度漸變指令 (Linear Speed Gradient)

建立平滑的速度變化（速度爬升）。

**範例：**

在 10% 和 90% 之間移動，並在 10 個步驟內將速度從 2 秒一次行程逐漸增加到 0.5 秒一次行程：
`"LINEAR_SPEED": {"start_position": 10, "end_position": 90, "start_duration": 2000, "end_duration": 500, "steps": 10}`

### 進階線性模式指令 (Advanced Linear Pattern)

建立具有可變位置、速度和循環的複雜線性移動模式。

```json
"LINEAR_PATTERN": {
  "repeat": true,
  "segments": [
    { "start": 10, "end": 90, "durations": [1000, 500], "loop": 3 },
    { "start": 20, "end": 80, "durations": [1200], "loop": 5 }
  ]
}
```
