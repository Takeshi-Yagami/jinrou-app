// player.js
import { db, auth } from './firebase-config.js';
import {
  collection, doc, getDoc, setDoc, onSnapshot, getDocs, updateDoc, deleteDoc // ★変更: deleteDoc を追加
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  signInAnonymously // ★これをインポート
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// --- HTML要素の取得 ---
// ※IDはhost.htmlと合わせて'roomIdInput', 'playerNameInput'に修正していることを前提とします。
//   もしHTML側がまだ'roomId', 'playerName'のままであれば、HTML側のIDを修正するか、
//   player.js側のgetElementByIdの引数を'roomId', 'playerName'に戻してください。
const roomIdInput = document.getElementById('roomId'); // IDをroomIdInputに統一する場合はHTMLも変更
const playerNameInput = document.getElementById('playerName'); // IDをplayerNameInputに統一する場合はHTMLも変更
const joinBtn = document.getElementById('joinBtn');
const joinLoading = document.getElementById('joinLoading');
const messageArea = document.getElementById('messageArea');

const roleArea = document.getElementById('roleArea');
const currentRoleDisplay = document.getElementById('currentRoleDisplay'); // HTMLのIDと一致
const statusArea = document.getElementById('statusArea');
const currentPlayerStatus = document.getElementById('currentPlayerStatus');

// ★追加: 役職カード表示関連の要素
const roleCardArea = document.getElementById('roleCardArea'); // HTMLで追加したIDと一致
const roleCardImage = document.getElementById('roleCardImage'); // HTMLで追加したIDと一致

const nightActionDiv = document.getElementById('nightAction');
const nightActionMessage = document.getElementById('nightActionMessage');
const nightTargetSelect = document.getElementById('nightTarget');
const nightActionBtn = document.getElementById('nightActionBtn');
const nightActionLoading = document.getElementById('nightActionLoading');

const dayActionDiv = document.getElementById('dayAction');
const voteTargetSelect = document.getElementById('voteTarget');
const voteBtn = document.getElementById('voteBtn');
const voteLoading = document.getElementById('voteLoading');

const resultContainer = document.getElementById('resultContainer');
const resultTitle = document.getElementById('resultTitle');
const playerListResult = document.getElementById('playerListResult');

// ★追加: プレイヤー退出ボタン
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const leaveRoomLoading = document.getElementById('leaveRoomLoading');

// ※以下はHTMLに存在しない要素のため、もしhost.jsにあるUIをplayer.jsに表示する意図があるならHTMLに追加し、IDを合わせる必要があります。
// const phaseDisplay = document.getElementById('phaseDisplay');
// const gameResultDisplay = document.getElementById('gameResultDisplay');
// const executedPlayerDisplay = document.getElementById('executedPlayerDisplay');
// const bakerStatusDisplay = document.getElementById('bakerStatusDisplay');


// --- グローバル変数 ---
let currentRole = null;
let currentAuthUid = null; // ★Firebase Auth のUIDを格納
let currentDisplayName = null; // ★ユーザーが入力した表示名
let currentRoomId = null;
let currentPlayerStatusValue = 'alive';
let roomPhaseUnsubscribe = null; // ★追加: onSnapshotの購読解除用変数
let playerDocUnsubscribe = null; // ★追加: onSnapshotの購読解除用変数
let gameOverUnsubscribe = null; // ★追加: onSnapshotの購読解除用変数


// ★追加: 役職名と画像パスのマッピング
// 画像ファイルは 'roles/' フォルダに配置されていることを想定
const ROLE_IMAGE_MAP = {
    "人狼": "roles/werewolf.png",
    "裏切り者": "roles/traitor.png",
    "村人": "roles/villager.png",
    "占い師": "roles/seer.png",
    "霊媒師": "roles/medium.png",
    "パン屋": "roles/baker.png",
    "騎士": "roles/knight.png",
    "GM": "roles/gm.png", // ホストの役職（表示するなら）
    "unknown": "roles/unknown.png" // 役職未定・不明の場合
};

// --- ヘルパー関数 ---
function showMessage(msg) {
  messageArea.textContent = msg;
}

function setLoading(button, loadingElement, isLoading) {
  button.disabled = isLoading;
  loadingElement.style.display = isLoading ? 'inline-block' : 'none';
}

// ★追加: 役職の表示とカード画像を更新する関数
function updateRoleDisplay(role) {
    roleArea.style.display = 'block';
    if (role) {
        currentRoleDisplay.textContent = role;
        roleCardArea.style.display = 'block'; // カード表示エリアを表示
        roleCardImage.src = ROLE_IMAGE_MAP[role] || ROLE_IMAGE_MAP["unknown"]; // マップにない場合はunknown画像
        roleCardImage.alt = `${role}カード`;
    } else {
        currentRoleDisplay.textContent = "役職はまだ割り当てられていません。ホストが役職を配るまでお待ちください。";
        roleCardArea.style.display = 'block'; // 役職未定カードを表示
        roleCardImage.src = ROLE_IMAGE_MAP["unknown"];
        roleCardImage.alt = "役職未定カード";
    }
}


// --- UI要素の表示/非表示をリセットする関数 ---
function resetUI() {
  nightActionDiv.style.display = 'none';
  dayActionDiv.style.display = 'none';
  resultContainer.style.display = 'none';
  roleArea.style.display = 'none'; // ★変更: 役職表示エリアも非表示に
  roleCardArea.style.display = 'none'; // ★変更: カードエリアも非表示に
  roleCardImage.src = ''; // ★変更: 画像をクリア
  roleCardImage.alt = ''; // ★変更: altテキストもクリア
  statusArea.style.display = 'none'; // ★変更: ステータスエリアも非表示に

  // ★追加: 参加/退出ボタンの状態をリセット
  roomIdInput.disabled = false;
  playerNameInput.disabled = false;
  joinBtn.disabled = false;
  leaveRoomBtn.style.display = 'none'; // 退出ボタンを非表示に

  // ※以下はHTMLに存在しない要素なので、もし必要ならHTMLに追加してください
  // phaseDisplay.textContent = '';
  // gameResultDisplay.textContent = '';
  // executedPlayerDisplay.textContent = '';
  // bakerStatusDisplay.textContent = '';
}


// --- 参加ボタンクリック (joinBtn.onclick) ---
joinBtn.onclick = async () => {
  const roomId = roomIdInput.value.trim();
  const playerName = playerNameInput.value.trim();
  if (!roomId || !playerName) {
    showMessage("ルームIDと名前を入力してください。");
    return;
  }

  setLoading(joinBtn, joinLoading, true);
  showMessage("認証中...");

  try {
    const userCredential = await signInAnonymously(auth);
    currentAuthUid = userCredential.user.uid;
    currentDisplayName = playerName;

    showMessage("認証成功。ルームに参加中...");

    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      showMessage("指定されたルームは存在しません。");
      setLoading(joinBtn, joinLoading, false);
      return;
    }
    const roomData = roomSnap.data();

    const playerRef = doc(db, 'rooms', roomId, 'players', currentAuthUid);

    const playersInRoomSnap = await getDocs(collection(db, 'rooms', roomId, 'players'));
    const playerExists = playersInRoomSnap.docs.some(doc => doc.id === currentAuthUid);

    if (playersInRoomSnap.size >= roomData.maxPlayers && !playerExists) {
      showMessage("このルームは満員です。");
      setLoading(joinBtn, joinLoading, false);
      return;
    }

    if (playerExists) {
      const latestPlayerData = (await getDoc(playerRef)).data();
      currentRole = latestPlayerData.role;
      currentPlayerStatusValue = latestPlayerData.status;
      showMessage(`ルーム「${roomId}」に再参加しました。`);
      updateRoleDisplay(currentRole); // ★変更: 役職表示を更新
      statusArea.style.display = 'block';
      currentPlayerStatus.textContent = currentPlayerStatusValue === 'alive' ? '生存' : '死亡';
    } else {
      await setDoc(playerRef, {
        name: currentDisplayName,
        role: null,
        faction: null,
        status: 'alive',
        uid: currentAuthUid
      });
      showMessage(`ルーム「${roomId}」に参加しました。`);
      statusArea.style.display = 'block';
      currentPlayerStatus.textContent = '生存';
      updateRoleDisplay(null); // ★変更: 役職はまだないことを表示
    }

    // 既存の購読を解除
    if (playerDocUnsubscribe) playerDocUnsubscribe();
    if (roomPhaseUnsubscribe) roomPhaseUnsubscribe();
    if (gameOverUnsubscribe) gameOverUnsubscribe();

    // プレイヤー自身のドキュメントをリアルタイム監視
    playerDocUnsubscribe = onSnapshot(playerRef, (docSnap) => { // ★変更: 購読解除用変数に代入
      if (docSnap.exists()) {
        const playerData = docSnap.data();
        currentRole = playerData.role;
        currentPlayerStatusValue = playerData.status;

        updateRoleDisplay(currentRole); // ★変更: 役職表示を更新

        statusArea.style.display = 'block';
        currentPlayerStatus.textContent = currentPlayerStatusValue === 'alive' ? '生存' : '死亡';

        if (currentRole === "占い師" && playerData.divineResult && playerData.divineResult.target) {
          showMessage(`${playerData.divineResult.target} は ${playerData.divineResult.role} です。`);
          updateDoc(playerRef, { divineResult: null });
        }
      } else {
        // プレイヤーデータが削除された場合（例：ゲームリセット時、または自分で退出時）
        showMessage("ルームから退出しました。");
        resetGlobalStateAndUI(); // ★変更: 共通の初期化関数を呼び出す
      }
    }, (error) => {
      console.error("プレイヤーデータのリアルタイム更新エラー:", error);
      showMessage("プレイヤーデータの取得中にエラーが発生しました。");
    });

    watchRoomPhase(roomId, currentAuthUid);
    watchGameOver(roomId);

    currentRoomId = roomId;

    roomIdInput.disabled = true;
    playerNameInput.disabled = true;
    joinBtn.disabled = true;
    leaveRoomBtn.style.display = 'block'; // ★追加: 退出ボタンを表示

  } catch (error) {
    console.error("ルーム参加エラー:", error);
    showMessage("ルーム参加中にエラーが発生しました。ネットワーク接続を確認してください。");
  } finally {
    setLoading(joinBtn, joinLoading, false);
  }
};

// ★追加: プレイヤー退出ボタンクリック
leaveRoomBtn.onclick = async () => {
    if (!currentRoomId || !currentAuthUid) {
        showMessage("参加中のルームがありません。");
        return;
    }

    if (confirm("本当にルームから退出しますか？ゲームは途中でもあなたのデータは削除されます。")) {
        setLoading(leaveRoomBtn, leaveRoomLoading, true);
        showMessage("ルームを退出中...");
        try {
            await deleteDoc(doc(db, 'rooms', currentRoomId, 'players', currentAuthUid));
            // onSnapshotのコールバックで resetGlobalStateAndUI が呼ばれるはず
        } catch (error) {
            console.error("ルーム退出エラー:", error);
            showMessage("ルームの退出に失敗しました。");
        } finally {
            setLoading(leaveRoomBtn, leaveRoomLoading, false);
        }
    }
};

// ★追加: グローバル変数とUIをリセットする共通関数
function resetGlobalStateAndUI() {
    // 既存の購読を全て解除
    if (playerDocUnsubscribe) {playerDocUnsubscribe(); playerDocUnsubscribe = null;}
    if (roomPhaseUnsubscribe) {roomPhaseUnsubscribe(); roomPhaseUnsubscribe = null;}
    if (gameOverUnsubscribe) {gameOverUnsubscribe(); gameOverUnsubscribe = null;}

    currentRole = null;
    currentAuthUid = null;
    currentDisplayName = null;
    currentRoomId = null;
    currentPlayerStatusValue = 'alive';
    sessionStorage.removeItem('bakerNotified_' + currentRoomId); // セッションストレージもクリア
    resetUI(); // UIを初期状態に戻す
    showMessage("ゲームは終了しました、またはルームから退出しました。");
}


// --- watchRoomPhase ---
function watchRoomPhase(roomId, playerUid) {
  const roomRef = doc(db, 'rooms', roomId);
  // 既存の購読があれば解除
  if (roomPhaseUnsubscribe) roomPhaseUnsubscribe();

  roomPhaseUnsubscribe = onSnapshot(roomRef, async (docSnap) => { // ★変更: 購読解除用変数に代入
    const roomData = docSnap.data();
    if (!roomData) {
        showMessage("ルームが存在しないか、ゲームがリセットされました。");
        resetGlobalStateAndUI(); // ★変更: 共通の初期化関数を呼び出す
        return;
    }

    // フェーズが変わるたびにアクションUIをリセット (カード表示はリセットしない)
    nightActionDiv.style.display = 'none';
    dayActionDiv.style.display = 'none';
    resultContainer.style.display = 'none';


    if (roomData.bakerStatus === "dead" && !sessionStorage.getItem('bakerNotified_' + roomId)) {
        showMessage("悲報！パン屋が亡くなりました...これ以上パンは焼かれません...");
        sessionStorage.setItem('bakerNotified_' + roomId, 'true');
    } else if (roomData.bakerStatus === "alive" && sessionStorage.getItem('bakerNotified_' + roomId)) {
        sessionStorage.removeItem('bakerNotified_' + roomId);
    }

    if (currentPlayerStatusValue === 'dead') {
      showMessage("あなたは死亡しました。次のフェーズでは行動できません。");
      if (currentRole === "霊媒師" && roomData.executedPlayerRole) {
          showMessage(`昼に処刑されたプレイヤーは ${roomData.executedPlayerRole} でした。`);
      }
      return;
    }

    if (roomData.phase === "night") {
      showMessage("夜フェーズです。役職に応じた行動をしてください。");
      await handleNightPhase(roomId, playerUid);
    } else if (roomData.phase === "day") {
      showMessage("昼フェーズです。話し合い、投票してください。");
      await handleDayPhase(roomId, playerUid);
    } else if (roomData.phase === null) {
      showMessage("ホストがゲームを開始するのを待っています...");
    }
    // 霊媒師の場合、処刑された役職を表示
    if (currentRole === "霊媒師" && roomData.executedPlayerRole) {
        showMessage(`昼に処刑されたプレイヤーは ${roomData.executedPlayerRole} でした。`);
    }

  }, (error) => {
    console.error("ルームフェーズのリアルタイム更新エラー:", error);
    showMessage("ルームフェーズの取得中にエラーが発生しました。");
  });
}

// --- handleNightPhase ---
async function handleNightPhase(roomId, playerUid) {
  if (!currentRole) {
    showMessage("役職がまだ割り当てられていません。");
    nightActionDiv.style.display = 'none';
    return;
  }

  if (currentRole === "村人" || currentRole === "裏切り者" || currentRole === "パン屋") {
    showMessage("あなたは特殊能力がないので夜のアクションはありません。");
    nightActionDiv.style.display = 'none';
    return;
  }

  const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
  const targets = playersSnap.docs
    .map(doc => ({ id: doc.id, name: doc.data().name, status: doc.data().status }))
    .filter(p => p.id !== playerUid && p.status === "alive");

  nightTargetSelect.innerHTML = '';
  if (targets.length === 0) {
    nightTargetSelect.innerHTML = '<option value="">対象がいません</option>';
    nightActionBtn.disabled = true;
    nightActionDiv.style.display = 'block';
    return;
  }
  targets.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name;
    nightTargetSelect.appendChild(option);
  });

  nightActionDiv.style.display = 'block';
  nightActionBtn.disabled = false;

  if (currentRole === "人狼") {
    nightActionMessage.textContent = "誰を襲撃しますか？";
    nightActionBtn.textContent = "襲撃する";
  } else if (currentRole === "占い師") {
    nightActionMessage.textContent = "誰を占いますか？";
    nightActionBtn.textContent = "占う";
  } else if (currentRole === "騎士") {
    nightActionMessage.textContent = "誰を護衛しますか？";
    nightActionBtn.textContent = "護衛する";
  } else {
    nightActionDiv.style.display = 'none';
    return;
  }

  nightActionBtn.onclick = async () => {
    const target = nightTargetSelect.value;
    if (!target) {
      showMessage("ターゲットを選択してください。");
      return;
    }

    setLoading(nightActionBtn, nightActionLoading, true); // nightActionLoadingを使用
    showMessage("アクション実行中...");

    try {
      let actionType;
      if (currentRole === "人狼") actionType = "kill"; // 'attack'から'kill'に統一
      else if (currentRole === "占い師") actionType = "divine";
      else if (currentRole === "騎士") actionType = "guard";
      else {
        showMessage("あなたの役職では夜のアクションはできません。");
        setLoading(nightActionBtn, nightActionLoading, false);
        return;
      }

      // 投票者名ではなくUIDをvoterフィールドに保存する方が正確性高いが、今回は既存のままDisplayNameを使用
      await setDoc(doc(db, "rooms", roomId, "nightActions", playerUid), {
        voter: playerUid,
        action: actionType,
        target: target
      });
      const targetName = targets.find(t => t.id === target)?.name || target;
      showMessage(`${currentRole}として${targetName}に${nightActionBtn.textContent.replace('する', '')}ました。ホストが昼にするまでお待ちください。`);
      nightActionBtn.disabled = true;
    } catch (error) {
      console.error("夜のアクションエラー:", error);
      showMessage("夜のアクションに失敗しました。");
    } finally {
      setLoading(nightActionBtn, nightActionLoading, false);
    }
  };
}

// --- handleDayPhase ---
async function handleDayPhase(roomId, playerUid) {
  const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
  const targets = playersSnap.docs
    .map(doc => ({ id: doc.id, name: doc.data().name, status: doc.data().status }))
    .filter(p => p.id !== playerUid && p.status === "alive");

  voteTargetSelect.innerHTML = '';
  if (targets.length === 0) {
    voteTargetSelect.innerHTML = '<option value="">対象がいません</option>';
    voteBtn.disabled = true;
    return;
  }
  targets.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    voteTargetSelect.appendChild(option);
  });
  voteBtn.disabled = false;
  dayActionDiv.style.display = 'block'; // ★変更: 昼アクション表示

  voteBtn.onclick = async () => {
    const target = voteTargetSelect.value;
    if (!target) {
      showMessage("投票対象を選択してください。");
      return;
    }

    setLoading(voteBtn, voteLoading, true); // voteLoadingを使用
    showMessage("投票中...");

    try {
      await setDoc(doc(db, "rooms", roomId, "votes", playerUid), {
        voter: currentDisplayName, // playerUid を使うべきだが、現状維持
        target: target
      });
      const targetName = targets.find(t => t.id === target)?.name || target;
      showMessage(`${currentDisplayName}が${targetName}に投票しました。ホストが結果を集計するまでお待ちください。`);
      voteBtn.disabled = true;
    } catch (error) {
      console.error("投票エラー:", error);
      showMessage("投票に失敗しました。");
    } finally {
      setLoading(voteBtn, voteLoading, false);
    }
  };
}

// --- watchGameOver ---
async function watchGameOver(roomId) {
  const roomRef = doc(db, 'rooms', roomId);
  // 既存の購読があれば解除
  if (gameOverUnsubscribe) gameOverUnsubscribe();

  gameOverUnsubscribe = onSnapshot(roomRef, (docSnap) => { // ★変更: 購読解除用変数に代入
    if (docSnap.exists()) {
      const roomData = docSnap.data();
      if (roomData.gameOver) {
        // HTML要素のIDを統一していないため、gameResultAreaなどがない可能性を考慮
        const gameResultAreaElement = document.getElementById('resultContainer');
        const gameResultTitleElement = document.getElementById('resultTitle');
        const playerListResultElement = document.getElementById('playerListResult');

        if (gameResultAreaElement && gameResultTitleElement && playerListResultElement) {
          gameResultAreaElement.style.display = 'block';
          gameResultTitleElement.textContent = `🎉 ${roomData.winner}陣営の勝利 🎉`;
          // プレイヤーリストもここで更新するなら追加
          // プレイヤーリストの表示 (簡易版)
          getDocs(collection(db, 'rooms', roomId, 'players')).then(playersSnap => {
            playerListResultElement.innerHTML = ''; // クリア
            playersSnap.forEach(playerDoc => {
              const playerData = playerDoc.data();
              const listItem = document.createElement('li');
              listItem.textContent = `${playerData.name} (${playerData.role || '未定'}) - ${playerData.status === 'alive' ? '生存' : '死亡'}`;
              playerListResultElement.appendChild(listItem);
            });
          });

        }
        // ゲーム終了時はUIをリセットして初期状態に戻る（退出ボタンなども非表示に）
        // ただし、このwatchGameOverはルームが存在しなくなった場合にも発火し、
        // その場合はwatchRoomPhaseが resetGlobalStateAndUI を呼ぶため重複注意。
        // ここではUIのみリセットし、グローバル変数のリセットは行わない。
        // resetUI(); // これを呼ぶと退出ボタンも非表示になるので注意
        // 代わりに、ゲーム終了時のUI表示は残し、操作ボタンを無効化する
        nightActionDiv.style.display = 'none';
        dayActionDiv.style.display = 'none';
        leaveRoomBtn.style.display = 'block'; // ゲーム結果画面でも退出は可能に

        roomIdInput.disabled = false;
        playerNameInput.disabled = false;
        joinBtn.disabled = false;
        // sessionStorage.removeItem('bakerNotified_' + roomId); // ゲーム終了時はクリア
      }
    }
  }, (error) => {
    console.error("ゲーム終了状態のリアルタイム更新エラー:", error);
    showMessage("ゲーム終了状態の取得中にエラーが発生しました。");
  });
}

// --- showGameResult 関数はHTMLに直接依存するため、player.jsからは削除またはHTMLに移動 ---
// これはplayer.htmlの#resultContainer内の要素に直接書き込むため、
// watchGameOver内で直接更新するか、この関数がHTML要素を取得して更新する必要があります。
// 現在のplayer.htmlにはgameResultDisplayなどのIDがないため、コメントアウトします。
// function showGameResult(winner, players) {
//   if (gameResultArea.style.display === 'block') return;

//   gameResultArea.style.display = 'block';
//   gameResultDisplay.textContent = `ゲーム終了！勝者: ${winner}`;
//   // playersリストの表示ロジックも必要なら追加
// }

// 初期ロード時の処理
document.addEventListener('DOMContentLoaded', () => {
  resetUI(); // ページ読み込み時にUIを初期状態にリセット
});
