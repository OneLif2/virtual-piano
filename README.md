# Nocturne · Virtual Piano

[開啟 GitHub Pages](https://onelif2.github.io/virtual-piano/)

## 2026-11-23 首頁更新

- 預設 34 鍵 G2–E5；I＝中央 C、CL＝Caps Lock／A2；鍵位不隨提示方向改變。
- 預設音色 001 Concert Grand；Sounds 可選 96 款即時合成音色。
- Demo、Play Along、Practice 共用 Canon 的 192 個音及原譜時序。開頭 4.8 秒是休止。
- 「提示」可選直向落鍵、橫向讀譜或自動；同時和弦上下行對齊。
- Practice 長音只需點按；有效時段前後各 0.5 秒內接受。PERFECT／GREAT／GOOD／POOR／MISS、Combo、血量及最高 1,000,000 分採用本頁自訂練習規則，不是 Konami 官方數值。
- 錯鍵或 MISS 返回目標並等待按對；補彈不抹走已有 MISS。正確和弦可以分別點按。
- 時間條可返回重練；拖動時凍結計時，跳轉重置本次成績。原本暫停則保持暫停。
- Demo：背景音樂＋自動琴鍵／琴聲。
- Play Along：背景音樂＋手動琴鍵／琴聲；不會自動彈奏譜音。
- Practice：Play Along＋彈錯／漏音返回目標並停等，按對才繼續；背景音樂同步停止及恢復。

此版接入專案既有的 [Canon 背景音軌](scores/media/canon-practice.m4a)，沿用已在此儲存庫的相同錄音檔，未新增第三方程式碼或取樣音源。背景音樂與譜面共用瀏覽器音訊時鐘；暫停、跳轉及練習停等會一起處理。網站所需檔案全部以相對路徑載入，既有 [player/](player/) 與 [scores/](scores/) 檔案未被覆寫。

## 使用

開頁後按「開始／開始練習」啟用聲音；背景音軌首次載入完成後才會開始計時，開頭 4.8 秒休止屬正常。Practice 的譜會隨節奏前進，除非按錯／漏音而停等。工具內可分別調總音量、背景音量（預設 45%）；Play Along／Practice 另有預設 +9 dB 手彈音量加強。沒有咪高峰或登入要求。

## 編碼器

MP3 編碼器及對應來源、授權隨網站保留，見 [vendor/NOTICE.md](vendor/NOTICE.md)。
