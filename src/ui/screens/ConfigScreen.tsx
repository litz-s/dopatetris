/**
 * 設定画面。出典は docs/design/design-screens.html（3e CONFIG / KEYBIND）。
 * 変更は即座に localStorage へ保存する。
 */
import { useCallback, useEffect, useState } from 'react';
import { audioEngine } from '@audio/audioEngine';
import { BPM } from '@audio/musicSequencer';
import {
  ACTION_LABELS,
  DEFAULT_KEYBINDS,
  DEFAULT_MOUSE_BINDS,
  MOUSE_LABELS,
  formatKey,
  loadKeybinds,
  loadMouseBinds,
  saveKeybinds,
} from '@input/keybinds';
import type { GameAction, Keybinds } from '@input/keybinds';
import type { ScanlineLevel } from '@render/quality/qualityProfiles';
import { Cabinet, useCabinetScale } from '../components/Cabinet';
import { DEFAULT_SETTINGS } from '../storage';
import type { Settings } from '../storage';

type Tab = 'keybind' | 'graphics' | 'sound';

const TAB_LABELS: Record<Tab, string> = {
  keybind: 'KEYBIND',
  graphics: 'GRAPHICS',
  sound: 'SOUND',
};

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
};

/** マウスにも割り当てがあるアクション。表の右列に出す */
const MOUSE_FOR_ACTION: Partial<Record<GameAction, string>> = {
  hardDrop: MOUSE_LABELS[DEFAULT_MOUSE_BINDS.leftClick] === 'DROP' ? 'CLICK' : '',
  hold: 'WHEEL',
  triggerStack: 'R-CLICK',
};

const ORDER: GameAction[] = [
  'moveLeft',
  'moveRight',
  'rotateCw',
  'rotateCcw',
  'softDrop',
  'hardDrop',
  'hold',
  'triggerStack',
  'discardStack',
  'pause',
];

export function ConfigScreen({ settings, onChange, onClose }: Props) {
  const scale = useCabinetScale();
  const [tab, setTab] = useState<Tab>('keybind');
  const [binds, setBinds] = useState<Keybinds>(() => loadKeybinds());
  /** 再割り当て待ちのアクション */
  const [listening, setListening] = useState<GameAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const mouse = loadMouseBinds();

  // キー入力待ち中は、押された物理キーをそのまま割り当てる
  useEffect(() => {
    if (listening === null) return;

    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setListening(null);
        return;
      }

      // 他のアクションが既に使っているキーは弾く
      const taken = (Object.entries(binds) as [GameAction, string[]][]).find(
        ([action, codes]) => action !== listening && codes.includes(event.code),
      );
      if (taken !== undefined) {
        setConflict(`${formatKey(event.code)} は「${ACTION_LABELS[taken[0]]}」で使用中です`);
        window.setTimeout(() => setConflict(null), 2200);
        return;
      }

      const next: Keybinds = { ...binds, [listening]: [event.code] };
      setBinds(next);
      saveKeybinds(next);
      setListening(null);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, binds]);

  // 通常時は Esc で閉じる
  useEffect(() => {
    if (listening !== null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, onClose]);

  const patch = useCallback(
    (partial: Partial<Settings>) => onChange({ ...settings, ...partial }),
    [onChange, settings],
  );

  const resetAll = (): void => {
    setBinds({ ...DEFAULT_KEYBINDS });
    saveKeybinds({ ...DEFAULT_KEYBINDS });
    onChange({ ...DEFAULT_SETTINGS });
  };

  return (
    <Cabinet scale={scale}>
      <div className="config">
        <div className="config-head">
          <h1 className="config-title">CONFIG</h1>
          <div className="config-tabs">
            {(['keybind', 'graphics', 'sound'] as Tab[]).map((t) => (
              <button
                key={t}
                className={`config-tab ${tab === t ? 'is-active' : ''}`}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {conflict !== null && <div className="config-conflict">{conflict}</div>}

        <div className="config-body">
          {tab === 'keybind' && (
            <>
              <section className="panel panel-cream config-keys">
                <h2 className="panel-label">KEY ASSIGN</h2>
                {ORDER.map((action) => (
                  <div key={action} className="config-key-row">
                    <span className="config-key-label">{ACTION_LABELS[action]}</span>
                    <button
                      className={`keycap config-keycap ${listening === action ? 'is-listening' : ''}`}
                      onClick={() => setListening(action)}
                    >
                      {listening === action
                        ? 'キー入力待ち…'
                        : (binds[action][0] ?? '未設定') === '未設定'
                          ? '未設定'
                          : formatKey(binds[action][0] ?? '')}
                    </button>
                    <span className="config-mouse">{MOUSE_FOR_ACTION[action] ?? ''}</span>
                  </div>
                ))}
              </section>

              <section className="panel panel-dark config-mouse-panel">
                <span className="mono-9 muted">MOUSE</span>

                <div className="config-toggle-row">
                  <span className="config-toggle-label">追従</span>
                  <button
                    className={`config-toggle ${settings.mouseFollow ? 'is-on' : ''}`}
                    onClick={() => patch({ mouseFollow: !settings.mouseFollow })}
                  >
                    {settings.mouseFollow ? 'ON' : 'OFF'}
                  </button>
                </div>

                <p className="config-note">
                  カーソルのX座標にミノが追従。
                  <br />
                  OFFにすると A/D・←→ のみ。
                </p>

                <Slider
                  label="追従の滑らかさ"
                  value={settings.mouseSmoothing}
                  min={0.05}
                  max={1}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) => patch({ mouseSmoothing: v })}
                />

                <div className="config-mouse-map">
                  <div>
                    <span className="hint-key">CLICK</span>
                    <span className="hint-label">{MOUSE_LABELS[mouse.leftClick]}</span>
                  </div>
                  <div>
                    <span className="hint-key">WHEEL</span>
                    <span className="hint-label">{MOUSE_LABELS[mouse.wheel]}</span>
                  </div>
                  <div>
                    <span className="hint-key">R-CLICK</span>
                    <span className="hint-label">{MOUSE_LABELS[mouse.rightClick]}</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === 'graphics' && (
            <>
              <section className="panel panel-cream config-graphics">
                <h2 className="panel-label">演出強度</h2>

                <Slider
                  label="画面揺れ"
                  value={settings.shakeScale}
                  min={0}
                  max={1.5}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ shakeScale: v })}
                />
                <Slider
                  label="パーティクル量"
                  value={settings.particleScale}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ particleScale: v })}
                />
                <Slider
                  label="フラッシュ / 点滅"
                  value={settings.flashScale}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ flashScale: v })}
                />

                <div className="config-segment">
                  <span className="config-toggle-label">走査線ノイズ</span>
                  <div className="config-segment-buttons">
                    {(['off', 'weak', 'strong'] as ScanlineLevel[]).map((level) => (
                      <button
                        key={level}
                        className={`config-seg ${settings.scanline === level ? 'is-on' : ''}`}
                        onClick={() => patch({ scanline: level })}
                      >
                        {level === 'off' ? 'OFF' : level === 'weak' ? '弱' : '強'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="config-toggle-row">
                  <span className="config-toggle-label">自動品質調整</span>
                  <button
                    className={`config-toggle ${settings.autoQuality ? 'is-on' : ''}`}
                    onClick={() => patch({ autoQuality: !settings.autoQuality })}
                  >
                    {settings.autoQuality ? 'ON' : 'OFF'}
                  </button>
                </div>
                <p className="config-note">
                  フレームレートが落ちたときに、演出を段階的に自動で軽くします。
                </p>
              </section>

              <section className="panel panel-dark config-preview">
                <span className="mono-9 muted">PREVIEW</span>
                <div className="config-preview-box">
                  <div
                    className="config-preview-tile"
                    style={{
                      boxShadow: `inset 0 4px 0 rgba(255,255,255,.45), inset 0 -4px 0 rgba(0,0,0,.4), 0 0 ${Math.round(44 * settings.flashScale)}px rgba(255,47,146,.9)`,
                    }}
                  >
                    ●
                  </div>
                </div>
                <p className="config-note is-light">フラッシュ設定が glow の強さに反映されます。</p>
              </section>
            </>
          )}

          {tab === 'sound' && (
            <>
              <section className="panel panel-cream">
                <h2 className="panel-label">VOLUME</h2>

                <Slider
                  label="マスター"
                  value={settings.masterVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ masterVolume: v })}
                />
                <Slider
                  label="効果音"
                  value={settings.sfxVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ sfxVolume: v })}
                />
                <Slider
                  label="BGM"
                  value={settings.musicVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ musicVolume: v })}
                />

                <div className="config-toggle-row">
                  <span className="config-toggle-label">ミュート</span>
                  <button
                    className={`config-toggle ${settings.muted ? 'is-on' : ''}`}
                    onClick={() => patch({ muted: !settings.muted })}
                  >
                    {settings.muted ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="config-toggle-row">
                  <span className="config-toggle-label">テスト再生</span>
                  <button
                    className="config-toggle"
                    onClick={() => audioEngine.play('stackTrigger')}
                  >
                    PLAY
                  </button>
                </div>
              </section>

              <section className="panel panel-dark">
                <span className="mono-9 muted">ABOUT SOUND</span>
                <p className="config-note is-light">
                  BGM と効果音はすべて Web Audio API で合成しています。
                  音源ファイルを持たないため、ロード待ちがありません。
                </p>
                <p className="config-note is-light">
                  テンポは BPM {BPM}。演出のタイミングもこの拍に揃えてあります。
                </p>
                <p className="config-note">
                  ※ 音は最初のクリックまたはキー入力で有効になります（ブラウザの制限）。
                </p>
              </section>
            </>
          )}
        </div>

        <div className="config-foot">
          <span className="mono-8 muted">変更は自動保存されます</span>
          <div className="config-foot-actions">
            <button className="btn btn-ghost" onClick={resetAll}>
              初期設定に戻す
            </button>
            <button className="btn" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </Cabinet>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="config-slider">
      <span className="config-toggle-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="config-slider-value mono-8">{format(value)}</span>
    </label>
  );
}
