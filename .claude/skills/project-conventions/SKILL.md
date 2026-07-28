---
name: project-conventions
description: ドパガキテトリスの実装規約。レイヤー依存方向、core の純粋性、決定論的RNG、QualityManager対応義務、バランス数値の外出しルール。このプロジェクトのコードを書く・読む・レビューする際に必ず参照する。
user-invocable: false
---

# ドパガキテトリス 実装規約

## レイヤー依存方向（最重要・違反は即修正）

```
ui  ──┐
input ─┼──> core
render ┤
audio ─┘

core は他のどのレイヤーも import してはならない。
```

`src/core/` の中では以下を**一切参照しない**。

- `window` / `document` / `HTMLElement` / `Canvas` / `WebGL` などのDOM API
- `AudioContext` などのWeb Audio API
- `Math.random()`、`Date.now()`、`performance.now()`
- React、Zustand、その他UIライブラリ

理由：コアを純粋・決定論的に保つことが、テスト容易性と将来のオンラインマルチ対応（サーバー権威型の状態同期）の前提になる。ここが汚れると後で作り直しになる。

## 決定論的であること

- 乱数は必ず `core/rng.ts` のシード付きPRNG（xorshift128+）を経由する
- 時間は外部から `deltaMs` として引数で注入する。コア内部で現在時刻を取得しない
- 同じシード＋同じ入力コマンド列 → 必ず同じ結果、が保証されなければならない
- 入力は `Command` 型（`MoveTo` / `Rotate` / `SoftDrop` / `HardDrop` / `Hold` / `TriggerStack` / `DiscardStack`）に正規化してから core に渡す。キーコードやマウス座標を core に持ち込まない

## 状態更新

- `core` の関数は原則 `(state, input) => newState` の純関数
- 破壊的変更は `core/reducer.ts` 内のローカルなドラフトに限定する
- 副作用（音を鳴らす、パーティクルを出す）は state を変更せず、`GameEvent[]` として返す。render/audio 層がそれを購読する

## パフォーマンス規約（60fps予算）

1フレーム16.67ms。論理更新は固定タイムステップ、描画はrAFで補間する。

**新しいエフェクトを追加するときは、必ず以下を満たすこと。**

- パーティクルは `render/particles/pool.ts` の固定長プールから確保する。`new` でオブジェクトを毎フレーム生成しない
- 品質段階（`ULTRA` / `HIGH` / `MID` / `LOW`）ごとの挙動を `render/quality/qualityProfiles.ts` に登録する
- `LOW` で完全に無効化できること。無効化してもゲームプレイに影響しないこと
- ホットパス（`update` / `draw`）で配列の `map` / `filter` / スプレッドによる新規確保をしない

## バランス数値の外出し

イベントスタックの効果量、スコア係数、落下速度カーブ、出現率などのゲームバランス数値は**すべて** `src/core/config/balance.ts` に定数として置く。ロジック中にマジックナンバーを書かない。調整を即座に行えるようにするため。

## 実装しない機能（恒久的に対象外）

- モバイル／タッチ対応
- リプレイ再生

これらを見越した抽象化やコードを追加しない。

## 命名

- 型・コンポーネント: PascalCase
- 関数・変数: camelCase
- 定数: SCREAMING_SNAKE_CASE
- ファイル: camelCase.ts（Reactコンポーネントのみ PascalCase.tsx）
