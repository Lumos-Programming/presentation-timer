# Presentation Timer

LAN内のPC・スマホから同時操作できる、Node.jsベースのプレゼンタイマーです。
発表者向けの `TIMER` 画面と、進行スタッフ向けの `MASTER` 画面を分けて利用できます。

## 主な機能

- MASTER / TIMER のSocket.IOリアルタイム同期
- 複数のMASTER端末から同時操作
- START / PAUSE / RESUME / RESET / PREV / NEXT
- `00:01 → 00:00 → +00:01` の超過表示
- EST + BUFFER 到達時に `TIME UP`
- 発表の追加・編集・削除
- 発表順のドラッグ＆ドロップ（スマホ対応）
- CSV IMPORT / EXPORT
- 発表データの自動保存 (`data/presentations.json`)
- 発表済み / 現在 / 未発表の表示分け
- Jost / Kazesawa のローカルWebフォント読み込み

タイマー動作中は、事故防止のため発表データの編集・並べ替え・CSV読み込みをロックします。PAUSEすると編集可能です。

## 必要環境

- Node.js 18以上
- 同一LAN内の端末（スマホからMASTERを操作する場合）

## セットアップ

```bash
npm install
npm start
```

起動するとターミナルにTIMER / MASTERのURLと、同一LAN内からアクセスするためのURLが表示されます。

- TIMER: `http://localhost:3000/timer`
- MASTER: `http://localhost:3000/master`

スマホ等では、起動時に表示される `http://192.168.x.x:3000/master` のようなLAN用URLへアクセスしてください。

## CSV形式

UTF-8 CSVを推奨します。

```csv
speaker,title,est,buffer
Kazuwee,"お米の美味しい炊き方、そしてお米を食べることによるその効果。",15:00,03:00
Tanaka,"ゲームデザインにおけるプレイヤー体験の設計",10:00,02:00
```

ヘッダーは `speaker,title,est,buffer` のほか、`発表者,発表内容,EST,BUFFER` も使用できます。
時間は `MM:SS` または `HH:MM:SS` 形式です。整数だけを指定した場合は秒として解釈します。

## データ保存

MASTERから変更した発表一覧は `data/presentations.json` に自動保存されます。
このファイルはローカルの運用データとして `.gitignore` 対象にしています。

サーバーを再起動しても発表一覧は復元されますが、タイマーの実行状態そのものはリセットされます。

## フォント

フォントファイル本体はこのリポジトリには含めていません。
`public/fonts/` に適切にライセンスされたフォントファイルを配置すると、Node.jsからWebフォントとして配信されます。

想定ファイル名:

```text
public/fonts/
├─ Jost-VariableFont_wght.woff2   # または .ttf
├─ Kazesawa-Regular.woff2         # または .ttf
└─ Kazesawa-Bold.woff2            # または .ttf（任意）
```

- タイマー: Jost
- その他: Kazesawa

WOFF2とTTFの両方がある場合はWOFF2を優先します。

### フォントをGitHubにも含める場合

フォントをコミット・再配布する場合は、それぞれの配布元から取得したライセンス・著作権表示も一緒に保存してください。
詳細は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) と `licenses/fonts/` を参照してください。

特にKazesawaについては、公式配布物に含まれるKazesawa本体およびM+ / Source Sans Proの関連ライセンス・READMEを、取得した配布物のまま保持することを推奨します。

## ライセンス

このリポジトリ独自のソースコードは [MIT License](LICENSE) で公開します。

依存パッケージとオプションフォントにはそれぞれ別のライセンスが適用されます。詳細は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) を参照してください。
