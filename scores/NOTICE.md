# 樂譜來源與轉檔紀錄・Canon in D practice score

**Pachelbel's Canon (Canon in D)** — Johann Pachelbel (1653–1706). 曲目本身已屬公有領域。
本目錄的音符資料來自 **OnlinePianist 虛擬鋼琴**的線上歌曲包，屬於該站的練習編曲；本站只重繪為 MusicXML 並標明出處，未取得任何原始程式或音訊資產。

## 來源

| 項目 | 內容 |
| --- | --- |
| 頁面 | <https://www.onlinepianist.com/virtual-piano>（Practice 模式） |
| 目錄 | `https://www.onlinepianist.com/static_assets/vp/catalog.json` → `id: 7961`, `title: "Pachelbel's Canon (Canon in D)"`, `composer: "Johann Pachelbel"` |
| 歌曲包 | `https://www.onlinepianist.com/static_assets/data/pivot/7961/7961_full.song` |
| 本地副本 | [`source/7961_full.song`](source/7961_full.song) — 4,844 bytes，SHA-256 `562fc5ee8bb9e7c25403c3071aea16c7357fb90986aef2004b7b0185c2fee872` |
| 擷取日期 | 2026-11-22 |

`.song` 是 ZIP（單一成員 `7961.song`，deflate），解壓後再以播放器的 32 位元組金鑰 `1mN1Iri8116261127824664135251` 循環 XOR，得到一份 `MIDIFile` 格式（MusicXML 0.9 MIDI DTD）的文字：`<TicksPerBeat>480`、3 個 track、絕對時間戳、含 `Note On/Off`、`SetTempo`、`Marker`。

## 轉檔做了什麼

1. **配對音高事件**：以 (track, pitch) 配對 Note On/Off，得到 192 個音符（旋律 151、低音 41）。站上 Practice 模式顯示的「192 ♪」與此一致。
2. **對齊格線**：原始資料每個音都在下一個音前 48 ticks（0.1 拍）放開，因此把音長往上對齊到十六分音符格線後，每個音剛好接到下一個音或小節線；沒有任意留白。
3. **分行**：track 1（音域 C4–D5）為右手高音譜表，track 2（A2–F3）為左手低音譜表；音長跨小節時切成連結線（tie），空隙以休止符補滿，並依拍點加符槓。
4. **刪去空白前奏**：播放器第 0–4 拍沒有聲音（第一個音在 tick 1920），樂譜改由第一個音開始，全曲 33 小節。
5. **調號修正**：原始 MIDI 寫 `KeySignature Fifths="0"`（C 大調），但實際音高含 B♭（MIDI 70/58/46）、無 B♮、無 F♯，低音線為 F–C–D–A–B♭–F–B♭–C，即卡農在 **F 大調** 的固定低音；旋律 A–G–F–E–D–C–D–E 正是 D 大調主題（F♯–E–D–C♯–B–A–B–C♯）上移小三度的結果。故本譜記為 **1 個降號**，並另出一個下移小三度的 **D 大調** 版本。
6. **段落記號**：把 track 0 的 `Marker`（Part 1–5）轉成排練記號，位置在第 9、17、25、30 小節。
7. **速度**：`SetTempo 1200000` µs/拍 = ♩=50；33 小節 = 158.4 秒。

## 產出

| 檔案 | 內容 | SHA-256 |
| --- | --- | --- |
| [`canon-practice-f.musicxml`](canon-practice-f.musicxml) | 站上實際播放的調（F 大調，1 降號），MusicXML 4.0 | `e47fd9b07497275003f5be23631b7a6addf49b70a98e6c8a0db71c92064c6322` |
| [`canon-in-d.musicxml`](canon-in-d.musicxml) | 原調 D 大調（2 升號），音符下移小三度 | `4eb261da50a5c62f28369a31a755db5912be97a442a99b651eaff2a4a34a7401` |
| `practice-f-01.svg` … `canon-d-02.svg` | 以 Verovio 6.4.1 排版的向量頁面（每版 2 頁，18 + 15 小節） | — |

## 重現與驗證

```powershell
python build_score.py      # 由 source/7961_full.song 產生兩份 MusicXML
python verify_score.py     # 重讀 MusicXML，逐音比對來源（起點／音長／音高）
python verify_score.py --xsd musicxml.xsd   # 另加 W3C MusicXML 4.0 schema 驗證
python render_pages.py     # Verovio 排版成 SVG
```

`verify_score.py` 會把小節內所有 `note` 的 duration 加總，確認每一行每個小節都是 1920 ticks，並把連結線合併回單音後與來源資料完整比對；目前兩份譜、兩個聲部共 384 筆事件全部吻合。

## 授權與致謝

- 作曲：Johann Pachelbel，公有領域。
- 練習編曲與音符資料：OnlinePianist（<https://www.onlinepianist.com/virtual-piano>）。本目錄的 MusicXML 是獨立的重新記譜，僅供個人練習與存檔；如要再散布，請自行確認對方的使用條款。
- 排版：Verovio（LGPL）；`index.html` 與 SVG 皆為本地檔案，不載入任何外部資源。
