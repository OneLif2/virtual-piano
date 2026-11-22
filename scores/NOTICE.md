# 樂譜來源與轉檔紀錄・Canon in D practice score

**Pachelbel's Canon (Canon in D)** — Johann Pachelbel (1653–1706)。曲目本身已屬公有領域。
本目錄的音符資料與原音檔是 **OnlinePianist 虛擬鋼琴**練習模式的編曲，本目錄只把它重新記譜成 MusicXML，並標明出處。

## 素材

| 項目 | 內容 |
| --- | --- |
| 作曲 | Johann Pachelbel（公有領域） |
| 練習編曲・音檔 | OnlinePianist 虛擬鋼琴（<https://www.onlinepianist.com/virtual-piano>，Practice 模式） |
| 音符資料 | [`source/canon.midixml`](source/canon.midixml) — 42,138 bytes，MIDI-XML（`<MIDIFile>`，480 ticks/beat，3 track） |
| 原音檔 | [`media/canon-practice.m4a`](media/canon-practice.m4a) — 5,286,060 bytes（M4A／AAC，2:40），SHA-256 `f4b02924321d7a246714a28b16036751e768e7454af7540ca5412396fd4e26bf` |

## 這份譜和素材的關係

1. **配對音高事件**：以 (track, pitch) 配對開關音，得到 192 個音符（旋律 151、低音 41）；站上 Practice 模式顯示的「192 ♪」與此一致。
2. **對齊格線**：每個音都比下一個音早一點放開，把音長往上對齊到十六分音符格線後，每個音剛好接到下一個音或小節線，沒有任意留白。
3. **分行**：track 1（音域 C4–D5）為右手高音譜表，track 2（A2–F3）為左手低音譜表；跨小節的音切成連結線（tie），空隙以休止符補滿，並依拍點加符槓。
4. **刪去空白前奏**：開頭 4 拍沒有聲音，樂譜改由第一個音開始，全曲 33 小節。
5. **調號修正**：素材標記 `Fifths="0"`（C 大調），但實際音高含 B♭（MIDI 70/58/46）、無 B♮、無 F♯，低音線為 F–C–D–A–B♭–F–B♭–C，即卡農在 **F 大調** 的固定低音；旋律 A–G–F–E–D–C–D–E 正是 D 大調主題（F♯–E–D–C♯–B–A–B–C♯）上移小三度的結果。故本譜記為 **1 個降號**，另出一個下移小三度的 **D 大調** 版本。
6. **段落記號**：把 meta track 的 `Marker`（Part 1–5）轉成排練記號，位置在第 9、17、25、30 小節。
7. **速度**：`SetTempo 1200000` µs/拍 = ♩=50；33 小節 = 158.4 秒。

## 產出

| 檔案 | 內容 | SHA-256 |
| --- | --- | --- |
| [`canon-practice-f.musicxml`](canon-practice-f.musicxml) | 實際播放的調（F 大調，1 降號），MusicXML 4.0 | `4c6ea5ee6ae96dbbd2d99ebd5ea0423988813b961a4b6210146ba0a3e1520c73` |
| [`canon-in-d.musicxml`](canon-in-d.musicxml) | 原調 D 大調（2 升號），音符下移小三度 | `4961aeece25c258d30c28b8199c62c3f191254632904cad6a9d780b3c5f18bf8` |
| [`media/canon-practice.m4a`](media/canon-practice.m4a) | 練習版原音檔（2:40），可邊聽邊對譜 | `f4b02924321d7a246714a28b16036751e768e7454af7540ca5412396fd4e26bf` |
| `practice-f-01.svg` … `canon-d-02.svg` | 以 Verovio 6.4.1 排版的向量頁面（每版 2 頁，18 + 15 小節） | — |

## 重現與驗證

```powershell
python build_score.py      # 由 source/canon.midixml 產生兩份 MusicXML
python verify_score.py     # 重讀 MusicXML，逐音比對素材（起點／音長／音高）
python verify_score.py --xsd musicxml.xsd   # 另加 W3C MusicXML 4.0 schema 驗證
python render_pages.py     # Verovio 排版成 SVG
```

`verify_score.py` 會把小節內所有 `note` 的 duration 加總，確認每一行每個小節都是 1920 ticks，並把連結線合併回單音後與素材完整比對；目前兩份譜、兩個聲部共 384 筆事件全部吻合。

## 授權與致謝

- 作曲：Johann Pachelbel，公有領域。
- 練習編曲與音符資料：OnlinePianist（<https://www.onlinepianist.com/virtual-piano>）。本目錄的 MusicXML 是獨立的重新記譜，僅供個人練習與存檔；如要再散布，請自行確認對方的使用條款。
- 排版：Verovio（LGPL）；`index.html` 與 SVG 皆為本地檔案，不載入任何外部資源。
