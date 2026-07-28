# ドパガキテトリス（dopatetris）

ライン消去のたびに視覚・聴覚的な快感が返ってくる、1人用のブラウザテトリス。通常のテトリスに独自の「イベントスタック」システムを載せ、レトロ×ファミコン×EDMの演出で成立させる。

確定仕様は [docs/SPEC.md](docs/SPEC.md) を参照。仕様に無い機能を勝手に追加しない。

デザインの実装値（色・タイポ・グリッド・モーション）は [docs/design/design-spec.html](docs/design/design-spec.html)、
画面構成は [docs/design/design-screens.html](docs/design/design-screens.html) が出典。
コード側では `src/render/theme.ts` と `src/render/motion.ts` に写してあるので、まずそちらを見る。

**デザインの中心原則: 光るのはブラウン管の中だけ。**
クリーム樹脂の筐体面（`--plate` / `--panel` など）に glow・box-shadow の発光を足さない。
立体は厚み影 `0 5px 0 var(--border)` だけで出す。走査線は盤面背景のみ、ミノには乗せない。

## 技術スタック

| 領域 | 採用 |
|---|---|
| ビルド | Vite + TypeScript (strict) |
| UI | React 19（メニュー・HUD・設定・画面遷移） |
| 盤面描画 | Canvas 2D（ブラウン管の中身のみ。筐体は DOM/CSS） |
| ポストエフェクト | 不要。走査線と3段階glowで足りるため実装しない |
| ゲームループ | React外の固定タイムステップ（60Hz論理）＋ rAF補間描画 |
| 状態管理 | Zustand（UI層のみ。core は非依存） |
| 音 | Web Audio API による完全プロシージャル生成（BPM 174 のBGM＋効果音） |
| 保存 | localStorage |
| テスト | Vitest（core の純関数が対象） |

## ディレクトリ構成

```
src/
  core/     純粋なゲームロジック。DOM/Canvas/Audio 非依存、決定論的、シード付きRNG
            入力は Command 列として受け取る（将来のマルチ対応・サーバー権威型同期の前提）
  render/   Canvas2D描画 + WebGLポストエフェクト + パーティクル + QualityManager
  audio/    AudioSource 抽象 + シンセ実装 + サウンドマニフェスト
  ui/       React コンポーネント
  input/    キーボード/マウス → Command 変換、キーバインド管理
```

**`core` は他レイヤーを import してはならない。** 詳細な規約は `.claude/skills/project-conventions/SKILL.md` を参照。

## 絶対に守るルール

1. **core の純粋性**：`src/core/` 内で DOM / Web Audio / `Math.random()` / `Date.now()` / `performance.now()` を使わない。乱数は `core/rng.ts`、時間は引数の `deltaMs` 経由。
2. **60fps予算**：1フレーム16.67ms。新しいエフェクトは必ずパーティクルプールを使い、品質段階 `ULTRA/HIGH/MID/LOW` を `render/quality/qualityProfiles.ts` に登録し、`LOW` で完全無効化できるようにする。
3. **バランス数値の外出し**：効果量・スコア係数・落下速度・出現率は全て `src/core/config/balance.ts` に置く。ロジック中にマジックナンバーを書かない。
4. **演出強度は変数**：エフェクトの強さをハードコードしない。手動3段階（MAX/標準/控えめ）が上限キャップ、自動品質調整がその範囲内で動く。
5. **音は差し替え可能に**：`AudioSource` インターフェース経由で鳴らす。合成実装と音源ファイル実装をサウンドマニフェストで切り替えられる状態を保つ。ゲームロジックから直接 `AudioContext` を触らない。

## 実装しない機能（恒久的に対象外）

- **モバイル／タッチ対応**（PC専用。スマホでは案内画面のみ）
- **リプレイ再生**

これらのための抽象化やコードを先回りして書かない。

## 将来版（MVP対象外だが設計は壊さない）

オンラインマルチプレイ・部屋機能、オンラインランキング、追加ゲームモード、実績。
`core` の純粋性と Command 列による入力を維持していれば後から載せられる。

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # プロダクションビルド
npm run preview    # ビルド結果のプレビュー（パフォーマンス計測はこちらで行う）
npm run test       # Vitest
npm run typecheck  # tsc --noEmit
```

## 開発時の補助

- `/perf-check` — フレームレートを実測し品質段階ごとに60fps予算を検証する
- `/new-effect` — 新エフェクトをプールと品質段階に正しく対応させて追加する
