# Canon：讀譜、琴鍵對應及兩種時間軸

**本機 7961** 的編曲（F 大調、♩=50）與 **Mutopia 2047**（原調 D 大調、♩=55）不是同一份譜、不是同一段演奏，不可共用背景錄音或用均勻拉伸方式對齊。

## 本機練習版及錄音候選

* 隨獨立工作室附有 `private-input/reference.json`（從原播放器兩軌匯出的 192 個實際按鍵）及 `private-input/canon-practice-f.musicxml`（書寫音名、時值及聲部）。旋律 151、低音 41。首鍵第 4 拍（4.800 秒），最後一鍵後保留音軌尾段；全長 163.264 秒。不是「192 個音擷取頭一小段」，而是沿現有編曲從頭到尾。
* 譜面以 `scores/canon-practice-f.musicxml` 找出拼音及書寫時值。該檔省略第 1 空白小節，故加入 4 拍後以「聲部、原始 tick、MIDI 音高」逐音核對。圖上時值和發聲 gate 分開：例如開頭 A4 [c] 寫作二分音符（2 拍），實際按鍵響 2.280 秒。
* `scores/canon-in-d.musicxml` 只是上述 192 音往下移小三度，不是額外錄音聲部。額外估算的錄音音符見獨立 `recording.json`；MusicXML 裏以藍色標示估算音。這些不是官方音符或音色分軌。
* OnlinePianist 練習編曲、配對音軌及衍生譜面限本機試用。作曲公版不代表特定編曲／錄音可隨意公開。

## Mutopia 完整譜（獨立對照）

Johann Pachelbel：*Canon per 3 Violini e Basso*。[The Mutopia Project #2047](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2047)，樂譜排版 © 2015 Michael Fischer v. Mollard，[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)。無任何背書。本機包包含 `reference-source/canon.musicxml`、`reference-source/events.json`、原版 MIDI 壓縮包 `reference-source/source/mids.zip`，以及原樣保留的上游製作紀錄 `reference-source/source/NOTICE.md`（該紀錄提到的原版製作工具與 LilyPond 壓縮包不需要隨獨立工作室安裝）。

本 PoC 將四聲部總譜轉成四個嚴格遞增嘅同調練習層（改編／重新排譜，CC BY 4.0）。Extreme 係唯一嘅完整演奏時間表：先合併 26 個同時、同音高嘅重疊音，保留最長時值及來源聲部，將 1,956 個原始音轉成 1,930 次鋼琴按鍵。

Easy 保留之前 D 調 Normal 嘅 471 個 Verse 起音及 PC 鍵。D 調舊版 Normal 用完整第一小提琴同低音，舊 Hard 再加第二小提琴；呢兩個舊層係密度研究嘅起點，唔係而家要原封照彈嘅聲部。平滑後保留 Normal 嘅全部 Easy 鍵同低音、Hard 嘅全部 Normal 鍵。兩級各換入及換出 108／155 個總譜起音，冇改任何音嘅時值；移出嘅音由伴奏播放。Extreme 保留四聲部完整總譜。各級沿用 57 小節、228 拍，共 248.727 秒。冇改第 1–6 小節及最後一小節嘅長音；雙譜表不構成指法建議。

每級 `notes` 只列要彈嘅音；`backingNoteIds` 指向同一份 `charts.extreme.notes` 內未選入嘅起音（索引由 0 開始）。兩者唔重疊，合併後啱啱好係全譜，冇移調、加速或用錄音估算。Extreme 呢個清單係空。MusicXML 只匯出該級需要練習嘅部分。

## 鍵位與核驗

沿用本機 Virtual Piano 的 `referenceCodes` 和 43–84 音高映射，不作八度折回。7961 原有映射不變。D 調獨立版另將原本只可點畫面嘅 71 個音映射到四個空置實體鍵（D2：a、F♯2：g、C♯6：[、D6：]），並區分左、右 Shift；全部 1,930 次起音都可按，冇八度折回。橫跨小節用連結線；第二段及之後不重複發聲或當成新按鍵。MusicXML 使用「按鍵事件譜」，不是照相複製原版印刷。

離線標準庫 Python 3.10+ 即可重建四譜；**不需要安裝或搜尋舊版 Virtual Piano**。程式從目前檔案位置載入素材，逐檔核對 `private-input/symbolic-provenance.json` 內的 SHA-256 指紋，並使用隨附的原始 42 鍵對應及曲長。只須在本資料夾執行：

~~~console
python -B build_score.py
python -B test_score.py -v
python -B export_notation.py
python -B test_notation.py -v
~~~

第二組匯出須先有 `recording.json`；如要只匯出其中一組：`python -B export_notation.py --input data.json --out notation/reference`。核驗涵蓋實際 7961 按鍵、MIDI 原版四聲部、按鍵映射、逐級密度及伴奏互補、8 份 MusicXML 重建、所有小節時值、連結線及實體按鍵數。

可選的來源稽核（不是執行或重建時的依賴）：如仍有原專案，可執行 `python -B build_score.py --verify-project "原專案路徑"`，程式會另外透過原播放器 `SongLibrary` 重讀、核對全份資料才輸出。將 `CANON_VERIFY_PROJECT` 環境變數設為原路徑，再跑 `test_score.py` 則會包含歷史難度規則核驗；獨立版預設跳過這個外部稽核。先前未加入 D 調延伸鍵時，已在隔離資料夾只用這些隨附素材重建 `data.json`，與改成獨立版前的 SHA-256 完全相同：`35be730b3f3e17362770453333ec0d98d2182b94554e3443e2cdee3f0c96785e`。
# Für Elise（新歌，不是 Canon 另一個版本）

`elise.json` 由 [Mutopia 931](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931) 官方完整 MIDI 匯入：Ludwig van Beethoven，WoO 59；Stelios Samelis 排版，來源 Breitkopf & Härtel 1888，Mutopia 頁面明列 **Public Domain**。`reference-source/elise/SOURCE.json` 記錄實際 `.mid`／`.ly` URL 及 SHA-256。本機 `Songs/7639_fur-elise` 只有較稀疏專有鍵譜及混音，並無用作完整全譜或公開來源。

此版保留官方 MIDI 905 個起音（上手 517、下手 388），A 小調，3/8，四分音符 = 72。原 MIDI 0.5 拍弱起前補 1 拍休止以對齊完整小節：顯示 105 小節，播放 **2:11.250**。依原 MIDI 次序播放一次，唔額外重播原紙譜嘅反覆段；有完整中段及後段，唔係只有開頭主題。唔改成 Canon 嘅拍號、速度或時長。

Easy 保留開頭 E／D♯ 問答、八分音格首個旋律音、每小節首個低音及最後收結；Normal／Hard 係其嚴格累加，優先填較稀疏小節，增加原有旋律及低音起音。可彈鍵數 **387／634／787／905**，伴奏補集 **518／271／118／0**。所有聲部從同一份 master 抽出，唔疊播完整錄音，冇更改音高、起音或長音放鍵；仍須使用者聽感及手位覆核，KPS 平滑唔等於保證每個手勢都容易。

音域 A1–E7 保留真實八度。原有中央 PC 鍵位不變，額外實際使用音高依序用未佔用嘅 4、8、k、-、=、反斜線、方向鍵、Home／End、PageUp／PageDown、Insert／Delete 綁定；譜上有逐音標示。唔摺返八度，亦唔靠 Shift＋另一鍵作隱藏換音。

三連音及裝飾音保留 MIDI PPQ384 嘅原始起音和放鍵，三音組有 `3` 標示、短裝飾音用細符頭。MusicXML 係同一份 MIDI 演奏轉譜：正確 3/8、A 小調、整數 tick、跨小節 tie、左右手與 PC lyric；部分裝飾音 gate 用精確 time-modification 比率表達。原紙譜嘅裝飾音分組、變音拼寫、反覆符號請對照隨附 `.ly`，唔聲稱以 MIDI 還原原出版排版。見 [來源及重建說明](reference-source/elise/README.md)。

