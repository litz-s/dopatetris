/**
 * 初回起動時の光過敏性の注意画面。1度だけ表示する。
 * 強い明滅を含むゲームなので、遊び始める前に必ず出す。
 */
import { Cabinet, useCabinetScale } from '../components/Cabinet';

type Props = { onAccept: () => void };

export function WarningScreen({ onAccept }: Props) {
  const scale = useCabinetScale();

  return (
    <Cabinet scale={scale}>
      <div className="simple-screen warning-screen">
        <span className="mono-9">CAUTION</span>
        <h1 className="config-title">光の点滅について</h1>

        <section className="panel panel-cream warning-panel">
          <p>
            このゲームには <strong>強い光の点滅・閃光・画面の揺れ</strong> が含まれます。
            ごく一部の方は、強い光の刺激により発作を起こすことがあります。
          </p>
          <p>
            明るい部屋で、画面から離れて遊んでください。
            体調に異変を感じたときは、すぐに中止してください。
          </p>
          <p className="warning-settings">
            演出の強さは <strong>CONFIG → GRAPHICS</strong> でいつでも下げられます。
            画面揺れ・パーティクル量・フラッシュ / 点滅・走査線を個別に調整できます。
          </p>
        </section>

        <button className="btn" onClick={onAccept} autoFocus>
          確認しました
        </button>
      </div>
    </Cabinet>
  );
}
