# 從 OnlinePianist 虛擬鋼琴取出練習譜（MusicXML）

這份筆記記錄一次完整的實作：把 <https://www.onlinepianist.com/virtual-piano> 的「Practice」模式用的樂曲資料取出來，轉成 MusicXML。以 Pachelbel《Canon in D》為例（歌曲 id `7961`），三步就能重跑：

```powershell
python fetch_song.py --search canon                 # 先確認歌名與 id
python fetch_song.py --id 7961 --out songs          # 下載 .song 與 .m4a
python decode_song.py songs/7961_full.song --summary # 解出 .midixml 並印摘要
python to_musicxml.py songs/7961_full.midixml --out canon.musicxml
# -> 33 bars, 192 notes, 2 staff, fifths=-1, quarter=50
```

不想連網時，本目錄已附 `sample-7961.song` 與解好的 `sample-7961.midixml`，可直接跑後兩步。

---

## 1. 播放器是怎麼找歌的

站上的虛擬鋼琴是一份 Vite 打包的前端程式（`/virtual-piano/assets/index-*.js` 加上數個 chunk，其中 `SongsPanel-*.js` 負責歌曲庫）。裡面有幾個固定字串：

| 常數 | 值 | 用途 |
| --- | --- | --- |
| `Ba` / `be` | `/static_assets` | 資源根目錄 |
| catalog | `vp/catalog.json` | 385 首曲目的索引 |
| 歌曲包 | `data/pivot/{id}/{id}_full.song` | 練習/跟彈用的音符資料 |
| 音檔 | `data/pivot/{id}/{id}_full.m4a` | 播放時串流的音訊 |

`catalog.json` 的每一筆長這樣：

```json
{ "id": 7961, "title": "Pachelbel's Canon (Canon in D)", "composer": "Johann Pachelbel", "strikey": { "dur": 0 }, "thumb": 108 }
```

`fetch_song.py` 就是讀這份索引、比對標題／作曲者，再用上表的路徑抓檔案。站方改版時，這幾個字串是第一手線索：在 bundle 裡搜 `static_assets`、`catalog.json`、`_full.song` 就能重新定位。

## 2. `.song` 是什麼容器

下載回來的檔案只有幾 KB（本例 4,844 bytes），但它**不是** MIDI，也不是純 JSON，而是兩層包裝：

1. **ZIP**：開頭 `50 4B 03 04`，只有一個成員 `<id>.song`，deflate 壓縮。
2. **XOR**：解壓後的位元組再與播放器內建的 32 位元組金鑰循環 XOR，才會變成可讀文字。

金鑰寫在 `SongsPanel-*.js` 裡，長度 32：

```
1mN1Iri8116261127824664135251
```

`decode_song.py` 只做這兩件事，輸出（節錄）：

```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE MIDIFile PUBLIC "-//Recordare//DTD MusicXML 0.9 MIDI//EN" ...>
<MIDIFile>
<Format>1</Format>
<TrackCount>3</TrackCount>
<TicksPerBeat>480</TicksPerBeat>
<TimestampType>Absolute</TimestampType>
<Track Number="0"> ... <SetTempo Value="1200000"/> <Marker>Part 1</Marker> ... </Track>
<Track Number="1"> ... <NoteOn Channel="1" Note="69" Velocity="80"/> ... </Track>
```

也就是「**MIDI 的 XML 版**」（MusicXML 0.9 MIDI DTD）：每個事件都帶絕對 tick，音符是成對的 `<NoteOn>`／`<NoteOn Velocity="0">`。

## 3. 裡面有什麼

`decode_song.py --summary` 對 7961 的輸出：

```
  ticks per beat : 480
  format         : 1
  track 0: no notes; tempo 50 bpm; markers Part 1..Part 5
  track 1: 151 notes, pitch 60..74     # 旋律（C4–D5）
  track 2: 41 notes, pitch 45..58      # 低音（A2–F3）
```

151 + 41 = **192 個音符**，正好等於站上練習模式顯示的「192 ♪」，所以這份資料就是判定用的同一份。track 0 只有 meta（速度、拍號、段落標記），沒有音。

## 4. 轉 MusicXML 時會踩到的坑

1. **音長比拍點短 48 ticks**。播放器在每個音的下一個音前 0.1 拍就放開琴鍵，所以量到的音長會是 912、456、228…把音長**往上對齊到十六分音符格線**（120 ticks）就會剛好接到下一個音或小節線，譜面自然乾淨。
2. **前面有一整小節空白**。第一個音在 tick 1920（第 2 小節），第 1 小節是 4 拍休止；轉譜時整段平移，從第一個音開始記。
3. **`<KeySignature Fifths="0">` 不可信**。7961 標成 C 大調，但音高裡有 B♭、沒有 B♮ 也沒有 F♯，低音線是 F–C–D–A–B♭–F–B♭–C ── 這是卡農在 **F 大調** 的固定低音（原曲 D 大調的 D–A–B–F♯–G–D–G–A 往上移小三度）。`to_musicxml.py` 用「哪個調號能讓最多音落在音階內」來猜：

   ```python
   for fifths in range(-7, 8):
       tonic = (7 * fifths) % 12
       scale = {(tonic + s) % 12 for s in (0, 2, 4, 5, 7, 9, 11)}
       outside = sum(count for pc, count in pitch_counts.items() if pc not in scale)
   ```

   F 大調（-1）的 outside 是 0，C 大調是 26（26 個 B♭ 音），於是自動得到 1 個降號。
4. **站上的鍵盤固定 C3–C5**，所以不少曲子被移調以配合畫面；檔名、標題寫的調不一定是實際調。
5. **兩個 track ≠ 兩個聲部**。這裡 track 1／track 2 剛好是右手／左手，但別的曲子可能有和弦（同一個 tick 多個音）或單 track 多聲部，轉譜時要按重疊情況拆 voice。
6. **跨小節的音**要切成兩段並加 `tie`/`tied`；空隙一律補休止符；`<note>` 的子元素順序在 MusicXML 4.0 是固定的（`pitch` → `duration` → `tie` → `voice` → `type` → `dot` → `staff` → `beam` → `notations`），順序錯了會被 schema 判錯。

## 5. 產出

`to_musicxml.py` 是**示範版**：兩個譜表、四四拍、對齊格線、補休止、必要時加連結線，符槓交給排版軟體自動處理。跑出來的檔案已通過 W3C MusicXML 4.0 schema，可以直接拖進 MuseScore、Dorico、Sibelius、Flat。

正式版（加上逐拍符槓、排練記號、分頁與 Verovio 排版）在 [`../../scores/`](../../scores/)，那份的轉檔腳本只讀 `scores/source/canon.midixml`，不含任何下載流程。

## 6. 檔案

| 檔案 | 作用 |
| --- | --- |
| `fetch_song.py` | 讀 catalog、搜尋、下載 `_full.song` 與 `_full.m4a` |
| `decode_song.py` | ZIP + XOR → `.midixml`，可印摘要 |
| `to_musicxml.py` | `.midixml` → MusicXML 4.0（示範版） |
| `sample-7961.song` | 原始歌曲包（4,844 bytes，SHA-256 `562fc5ee…`） |
| `sample-7961.midixml` | 解出的 MIDI-XML 文字（42,138 bytes） |
| `demo-7961.musicxml` | 示範版輸出（33 小節、192 音符、F 大調） |

## 7. 使用提醒

- 曲子本身（Pachelbel，卒於 1706）是公有領域；**編曲與音檔屬於 OnlinePianist**。這套流程做出來的譜，請當作個人練習與存檔，要再散布請自行確認對方條款。
- 站方隨時可能改 bundle 檔名、資源路徑或混淆金鑰；金鑰一換，`decode_song.py` 的 `KEY` 就要跟著換，其餘步驟不變。
- 抓到別首時，把 `--id` 換掉即可；`.m4a` 只是方便對拍，不需要可以只留 `.song`。
