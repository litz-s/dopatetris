/**
 * 部屋の状態を React 側で扱うためのフック。
 * 通信の詳細は NetClient に閉じ込め、ここは「今どうなっているか」だけを持つ。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { netClient } from '@net/client';
import type { ConnectionState } from '@net/client';
import { DEFAULT_ROOM_RULES, PROTOCOL_VERSION } from '@net/protocol';
import type { BoardSnapshot, PlayerId, PlayerInfo, RoomRules, ServerMessage } from '@net/protocol';

export type ChatLine = { id: number; from: PlayerId; name: string; text: string };

/** 対戦開始時にゲーム側へ渡す情報 */
export type MatchStart = { seed: number; rules: RoomRules };

export type RoomState = {
  connection: ConnectionState;
  /** 入室していれば部屋コード */
  code: string | null;
  you: PlayerId | null;
  players: PlayerInfo[];
  rules: RoomRules;
  chat: ChatLine[];
  /** カウントダウン中の残り秒。null なら非表示 */
  countdown: number | null;
  /** 対戦開始の合図。受け取ったら VERSUS へ遷移する */
  match: MatchStart | null;
  /** 相手の盤面 */
  rivals: Map<PlayerId, BoardSnapshot>;
  /** 受信したおじゃま。ゲーム側が取り込んだら消す */
  incoming: { lines: number; holeColumn: number }[];
  standings: PlayerInfo[] | null;
  error: string | null;
};

export function useRoom() {
  const [connection, setConnection] = useState<ConnectionState>(netClient.getState());
  const [code, setCode] = useState<string | null>(null);
  const [you, setYou] = useState<PlayerId | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [rules, setRules] = useState<RoomRules>({ ...DEFAULT_ROOM_RULES });
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [match, setMatch] = useState<MatchStart | null>(null);
  const [standings, setStandings] = useState<PlayerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 盤面と受信おじゃまは毎フレーム変わるため、再描画を誘発しない ref で持つ
  const rivalsRef = useRef<Map<PlayerId, BoardSnapshot>>(new Map());
  const incomingRef = useRef<{ lines: number; holeColumn: number }[]>([]);
  const chatId = useRef(0);

  useEffect(() => {
    const offState = netClient.onStateChange(setConnection);

    const offMessage = netClient.onMessage((message: ServerMessage) => {
      switch (message.kind) {
        case 'joined':
          setYou(message.you);
          setCode(message.code);
          setPlayers(message.players);
          setRules(message.rules);
          setStandings(null);
          setError(null);
          break;

        case 'roomUpdate':
          setPlayers(message.players);
          setRules(message.rules);
          break;

        case 'chat':
          setChat((current) => {
            const line = {
              id: chatId.current++,
              from: message.from,
              name: message.name,
              text: message.text,
            };
            // 直近の一定件数だけ保持する
            return [...current, line].slice(-40);
          });
          break;

        case 'countdown':
          setCountdown(message.seconds);
          break;

        case 'start':
          setCountdown(null);
          setStandings(null);
          rivalsRef.current.clear();
          incomingRef.current.length = 0;
          setMatch({ seed: message.seed, rules: message.rules });
          break;

        case 'rivalBoard':
          rivalsRef.current.set(message.from, message.snapshot);
          break;

        case 'garbage':
          incomingRef.current.push({
            lines: message.lines,
            holeColumn: message.holeColumn,
          });
          break;

        case 'playerOut':
          setPlayers((current) =>
            current.map((p) =>
              p.id === message.player ? { ...p, out: true, place: message.place } : p,
            ),
          );
          break;

        case 'gameEnd':
          // match は残したまま順位だけ入れる。
          // ここで match を消すと対戦画面がアンマウントされ、順位表を出す前に
          // ロビーへ戻ってしまう。画面を閉じるのはプレイヤーの操作に任せる。
          setStandings(message.standings);
          break;

        case 'error':
          setError(message.message);
          break;

        default:
          break;
      }
    });

    return () => {
      offState();
      offMessage();
    };
  }, []);

  useEffect(() => {
    if (code === null) return;
    if (connection !== 'waking' && connection !== 'closed' && connection !== 'error') return;

    // 部屋はサーバーメモリ上にあり、切断した接続はその場で退室扱いになる。
    // 復帰トークンを持たない現段階では、古い部屋表示を残さず入口へ戻す。
    setCode(null);
    setYou(null);
    setPlayers([]);
    setChat([]);
    setCountdown(null);
    setMatch(null);
    setStandings(null);
    rivalsRef.current.clear();
    incomingRef.current.length = 0;
    setError('接続が切れたため部屋を退出しました。サーバー再接続後に入り直してください');
  }, [code, connection]);

  const connect = useCallback(() => netClient.connect(), []);

  const createRoom = useCallback((name: string) => {
    netClient.connect();
    netClient.send({ kind: 'createRoom', name, version: PROTOCOL_VERSION });
  }, []);

  const joinRoom = useCallback((roomCode: string, name: string) => {
    netClient.connect();
    netClient.send({ kind: 'joinRoom', code: roomCode, name, version: PROTOCOL_VERSION });
  }, []);

  const leaveRoom = useCallback(() => {
    netClient.send({ kind: 'leaveRoom' });
    netClient.disconnect();
    setCode(null);
    setYou(null);
    setPlayers([]);
    setChat([]);
    setCountdown(null);
    setMatch(null);
    setStandings(null);
  }, []);

  const setReady = useCallback((ready: boolean) => {
    netClient.send({ kind: 'setReady', ready });
  }, []);

  /** 対戦終了後、同じ顔ぶれでロビーへ戻る */
  const returnToLobby = useCallback(() => {
    netClient.send({ kind: 'returnToLobby' });
    setMatch(null);
    setStandings(null);
  }, []);

  const updateRules = useCallback((next: RoomRules) => {
    netClient.send({ kind: 'setRules', rules: next });
  }, []);

  const sendChat = useCallback((text: string) => {
    netClient.send({ kind: 'chat', text });
  }, []);

  const sendBoard = useCallback((snapshot: BoardSnapshot) => {
    netClient.send({ kind: 'board', snapshot });
  }, []);

  const sendAttack = useCallback((lines: number, holeColumn: number) => {
    netClient.send({ kind: 'attack', lines, holeColumn });
  }, []);

  const sendTopOut = useCallback(() => {
    netClient.send({ kind: 'topOut' });
  }, []);

  /** 受信済みのおじゃまを取り出す。取り出したぶんは消える */
  const drainIncoming = useCallback(() => {
    if (incomingRef.current.length === 0) return [];
    return incomingRef.current.splice(0, incomingRef.current.length);
  }, []);

  const me = useMemo(() => players.find((p) => p.id === you) ?? null, [players, you]);
  const isHost = me?.host === true;

  return {
    connection,
    code,
    you,
    me,
    isHost,
    players,
    rules,
    chat,
    countdown,
    match,
    standings,
    error,
    rivalsRef,
    connect,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    returnToLobby,
    updateRules,
    sendChat,
    sendBoard,
    sendAttack,
    sendTopOut,
    drainIncoming,
    clearError: () => setError(null),
    clearMatch: () => setMatch(null),
  };
}
