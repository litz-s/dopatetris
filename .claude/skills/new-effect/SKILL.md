---
name: new-effect
description: 新しい視覚エフェクトを、パーティクルプールと品質段階に正しく対応させた形で追加する。
disable-model-invocation: true
argument-hint: "<エフェクト名と発生タイミング 例: ハードドロップ着地の衝撃波>"
---

# 新規エフェクト追加

エフェクトを場当たりに足すとフレーム落ちと品質段階の抜け漏れが発生する。以下の順序を必ず守る。

## 1. トリガーを決める

`core` が返す `GameEvent` のどれに反応するかを特定する。該当するイベントが無い場合は、まず `core/events.ts` にイベント型を追加する。**エフェクトのために core の状態を変更してはならない。**

## 2. 品質プロファイルに登録する

`render/quality/qualityProfiles.ts` に、このエフェクトの段階別パラメータを追加する。

```ts
myEffect: {
  ULTRA: { count: 240, trail: true,  bloom: 1.0 },
  HIGH:  { count: 120, trail: true,  bloom: 0.6 },
  MID:   { count: 48,  trail: false, bloom: 0.0 },
  LOW:   { count: 0,   trail: false, bloom: 0.0 },  // 完全無効化できること
}
```

`LOW` で `count: 0` にしてもゲームが成立することを必ず確認する。

## 3. 実装する

- パーティクルは `render/particles/pool.ts` の `acquire()` から取得し、寿命切れで `release()` する。`new` で毎フレーム確保しない
- 更新は `update(dt)` 内で単純な数値演算のみ。配列の再確保や `filter` を使わない
- イージングはバネ系（`render/anim/spring.ts`）を優先する。線形補間は「弾ける」感じにならない
- 画面揺れは `render/effects/shake.ts` に集約し、個別に `ctx.translate` しない

## 4. 音と同期させる

`audio/soundManifest.ts` にサウンドIDを追加する。合成実装をまず書き、後から音源ファイルへ差し替え可能な形（`AudioSource` インターフェース準拠）にする。ビート同期が必要な演出は `audio/clock.ts` の拍タイミングを購読する。

## 5. 検証する

`/perf-check` を実行し、追加前後で p95 フレームタイムが悪化していないことを数値で確認する。悪化している場合はパーティクル数を段階ごとに下げてから完了とする。
