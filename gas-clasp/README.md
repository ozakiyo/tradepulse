# clasp — GAS 一括デプロイ

ローカルの `bitbank-gas*` フォルダを Google Apps Script に `clasp push` します。

## 初回セットアップ（1回だけ）

### 1. 依存インストール

```bash
cd tradePulseNode
npm install
```

### 2. Google ログイン

```bash
npm run gas:login
```

ブラウザが開くので、GAS を運用している Google アカウントで許可します。

### 3. スクリプト ID を登録

```bash
cp gas-clasp/projects.example.json gas-clasp/projects.json
```

各 GAS プロジェクトで:

1. スプレッドシート → **拡張機能** → **Apps Script**
2. **プロジェクトの設定**（歯車）→ **スクリプト ID** をコピー
3. `gas-clasp/projects.json` の該当 `scriptId` に貼り付け

例:

```json
{ "dir": "bitbank-gas-meta", "label": "META", "scriptId": "1AbC…your-id…" }
```

### 4. `.clasp.json` を各フォルダに生成

```bash
npm run gas:setup
```

### 5. 動作確認（META だけ先に push）

```bash
npm run gas:push -- meta
```

Apps Script エディタでファイルが更新されていれば成功です。

## 日常の使い方

| コマンド | 内容 |
|----------|------|
| `npm run gas:push:all` | 全16プロジェクトを一括 push |
| `npm run gas:push -- G-CBO` | 暗号ブレイクアウト（`g-cbo` / `gcbo`） |
| `npm run gas:push -- G-FFX` | 1つだけ（`dir` / `label` / `g-ffx` / `gffx`） |
| `npm run gas:pull -- bitbank-gas` | クラウド → ローカルに pull |
| `npm run gas:status` | scriptId / .clasp.json の設定状況 |

## 注意

- `clasp push` は **ローカル → クラウド** で上書きします。クラウドだけ直した変更は `pull` しないと消えます。
- `README.md` は `.claspignore` で push 対象外です。
- `gas-clasp/projects.json` は個人の scriptId を含むため **git にコミットしない** でください（`.gitignore` 済み）。

## プロジェクト一覧（16）

| label | フォルダ |
|-------|----------|
| META | `bitbank-gas-meta` |
| A | `bitbank-gas` |
| B | `bitbank-gas-team-b` |
| C〜E | `bitbank-gas-team-c` 〜 `e` |
| G / G-FX / G-CFX / G-CBO / G-FFX | `bitbank-gas-team-g` / `g-fx` / `g-cfx` / `g-cbo` / `g-ffx` |
| C-FX〜E-FX, F系 | `bitbank-gas-team-*-fx`, `team-f*` |
