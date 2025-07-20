// host.js (匿名認証形式に改修後)
import { db, auth } from './firebase-config.js';
import {
  collection, doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// HTML要素の取得
const roomIdInput = document.getElementById('roomId');
const maxPlayersInput = document.getElementById('maxPlayers');
const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomLoading = document.getElementById('createRoomLoading');

// ★追加: ホスト再参加関連の要素
const reenterRoomIdInput = document.getElementById('reenterRoomId');
const reenterRoomBtn = document.getElementById('reenterRoomBtn');
const reenterRoomLoading = document.getElementById('reenterRoomLoading');

const roleSettingsDiv = document.getElementById('roleSettings');
const currentPlayersCountSpan = document.getElementById('currentPlayersCount');
const maxPlayersDisplaySpan = document.getElementById('maxPlayersDisplay');
const totalRolesCountSpan = document.getElementById('totalRolesCount');
const assignRolesBtn = document.getElementById('assignRolesBtn');
const assignRolesLoading = document.getElementById('assignRolesLoading');

const startDayBtn = document.getElementById('startDayBtn');
const startDayLoading = document.getElementById('startDayLoading');
const countVotesBtn = document.getElementById('countVotesBtn');
const countVotesLoading = document.getElementById('countVotesLoading');
const checkGameOverBtn = document.getElementById('checkGameOverBtn');
const checkGameOverLoading = document.getElementById('checkGameOverLoading');
const resetGameBtn = document.getElementById('resetGameBtn');
const resetGameLoading = document.getElementById('resetGameLoading');

// ★追加: ルーム削除ボタン
const deleteRoomBtn = document.getElementById('deleteRoomBtn');
const deleteRoomLoading = document.getElementById('deleteRoomLoading');

const messageArea = document.getElementById('messageArea');

const hostLoginStatusSpan = document.getElementById('hostLoginStatus');

let currentRoomId = null;
let currentMaxPlayers = 0;
let currentRolesConfig = {};
let currentPlayersInRoom = 0;
let currentHostUid = null;
let roomCloseTimer = null; // ★追加: ルーム自動クローズ用のタイマーID

// ルームの自動クローズ時間 (ミリ秒) - 例: 60分
const AUTO_CLOSE_DURATION_MS = 60 * 60 * 1000; // 60分

// 全ての役職名
const ALL_ROLE_NAMES = ["人狼", "裏切り者", "村人", "占い師", "霊媒師", "パン屋", "騎士"];
// 役職と陣営のマッピング
const FACTIONS = {
  "人狼": "人狼",
  "裏切り者": "人狼", // 裏切り者は人狼陣営
  "村人": "村人",
  "占い師": "村人",
  "霊媒師": "村人",
  "パン屋": "村人",
  "騎士": "村人"
};

// メッセージ表示関数
function showMessage(msg) {
  messageArea.textContent = msg;
}

// ローディング表示関数
function setLoading(button, spinner, isLoading) {
  button.disabled = isLoading;
  spinner.style.display = isLoading ? 'inline-block' : 'none';
}

// 役職設定の合計数を更新する
function updateRolesCount() {
  let total = 0;
  ALL_ROLE_NAMES.forEach(role => {
    const input = document.getElementById(`role_${role}`);
    if (input) {
        const count = parseInt(input.value) || 0;
        total += count;
        currentRolesConfig[role] = count;
    }
  });
  totalRolesCountSpan.textContent = total;

  assignRolesBtn.disabled =
    total !== currentPlayersInRoom || currentPlayersInRoom === 0 || total > currentMaxPlayers;

  if (total > currentMaxPlayers) {
    showMessage(`警告: 合計役職数 (${total}) が最大人数 (${currentMaxPlayers}) を超えています。`);
  } else if (total !== currentPlayersInRoom) {
    showMessage(`警告: 合計役職数 (${total}) が現在のプレイヤー数 (${currentPlayersInRoom}) と一致していません。`);
  } else if (currentPlayersInRoom < 3) {
    showMessage("警告: 最低3人のプレイヤーが必要です。");
  } else {
    showMessage(""); // 警告をクリア
  }
}

// ボタンの有効/無効を更新する関数
function updateButtonStates(roomData) {
  if (!currentHostUid) {
    createRoomBtn.disabled = true;
    reenterRoomBtn.disabled = true; // ★追加
    assignRolesBtn.disabled = true;
    startDayBtn.disabled = true;
    countVotesBtn.disabled = true;
    checkGameOverBtn.disabled = true;
    resetGameBtn.disabled = true;
    deleteRoomBtn.disabled = true; // ★追加
    roleSettingsDiv.style.display = 'none';
    maxPlayersInput.disabled = true;
    roomIdInput.disabled = true; // ★追加
    reenterRoomIdInput.disabled = true; // ★追加
    return;
  }

  if (!currentRoomId) {
    createRoomBtn.disabled = false;
    reenterRoomBtn.disabled = false; // ★追加
    assignRolesBtn.disabled = true;
    startDayBtn.disabled = true;
    countVotesBtn.disabled = true;
    checkGameOverBtn.disabled = true;
    resetGameBtn.disabled = true;
    deleteRoomBtn.disabled = true; // ★追加
    roleSettingsDiv.style.display = 'none';
    maxPlayersInput.disabled = false;
    roomIdInput.disabled = false; // ★追加
    reenterRoomIdInput.disabled = false; // ★追加
    return;
  }

  // ルームにログイン中の場合
  createRoomBtn.disabled = true;
  reenterRoomBtn.disabled = true; // ★追加
  roomIdInput.disabled = true; // ★追加
  maxPlayersInput.disabled = true; // ★追加
  reenterRoomIdInput.disabled = true; // ★追加

  roleSettingsDiv.style.display = 'block';
  deleteRoomBtn.disabled = false; // ★追加: ルームにログイン中は削除ボタンを有効化

  const phase = roomData ? roomData.phase : null;
  const gameOver = roomData ? roomData.gameOver : false;
  const winner = roomData ? roomData.winner : null;

  maxPlayersDisplaySpan.textContent = currentMaxPlayers;

  if (gameOver) {
    assignRolesBtn.disabled = true;
    startDayBtn.disabled = true;
    countVotesBtn.disabled = true;
    checkGameOverBtn.disabled = true;
    resetGameBtn.disabled = false;
    showMessage(`ゲーム終了！勝者: ${winner}陣営の勝利です！`);
  } else {
    resetGameBtn.disabled = true;

    switch (phase) {
      case null:
        assignRolesBtn.disabled =
          Object.values(currentRolesConfig).reduce((a, b) => a + b, 0) !== currentPlayersInRoom || currentPlayersInRoom === 0;
        startDayBtn.disabled = true;
        countVotesBtn.disabled = true;
        checkGameOverBtn.disabled = true;
        break;
      case "day":
        assignRolesBtn.disabled = true;
        startDayBtn.disabled = true;
        countVotesBtn.disabled = false;
        checkGameOverBtn.disabled = false;
        break;
      case "night":
        assignRolesBtn.disabled = true;
        startDayBtn.disabled = false;
        countVotesBtn.disabled = true;
        checkGameOverBtn.disabled = false;
        break;
      default:
        assignRolesBtn.disabled = true;
        startDayBtn.disabled = true;
        countVotesBtn.disabled = true;
        checkGameOverBtn.disabled = true;
        break;
    }
  }
}

// ルームのリアルタイム監視（フェーズとゲーム終了状態の更新のため）
function watchRoomState(roomId) {
  if (!currentHostUid) {
    console.warn("ホストがログインしていません。ルーム状態の監視を開始できません。");
    return;
  }

  const roomRef = doc(db, "rooms", roomId);
  onSnapshot(roomRef, (docSnap) => {
    const data = docSnap.data();
    if (data) {
      currentMaxPlayers = data.maxPlayers || 0;
      currentRolesConfig = data.rolesConfig || {};
      updateButtonStates(data);

      // ★追加: ルームの作成時刻があればタイマーを設定
      if (data.createdAt) {
          setupAutoCloseTimer(roomId, data.createdAt);
      }

    } else {
      currentRoomId = null;
      currentMaxPlayers = 0;
      currentRolesConfig = {};
      currentPlayersInRoom = 0;
      updateButtonStates(null);
      showMessage("ルームが存在しません。");
      clearAutoCloseTimer(); // ★追加: ルームがない場合はタイマーをクリア
    }
  }, (error) => {
    console.error("ルーム状態のリアルタイム更新エラー:", error);
    showMessage("ルーム状態の取得中にエラーが発生しました。");
    updateButtonStates(null);
    clearAutoCloseTimer(); // ★追加: エラー時もタイマーをクリア
  });

  onSnapshot(collection(db, "rooms", roomId, "players"), (snapshot) => {
    currentPlayersInRoom = snapshot.size;
    currentPlayersCountSpan.textContent = currentPlayersInRoom;
    updateRolesCount();
    updateButtonStates(null); // プレイヤー数変更でボタン状態も更新
  }, (error) => {
    console.error("プレイヤー数のリアルタイム更新エラー:", error);
  });
}

// ★追加: ルームの自動クローズタイマー設定
function setupAutoCloseTimer(roomId, createdAtTimestamp) {
    clearAutoCloseTimer(); // 既存のタイマーがあればクリア

    const createdTime = createdAtTimestamp.toMillis(); // Firestore Timestampをミリ秒に変換
    const elapsedTime = Date.now() - createdTime;
    const remainingTime = AUTO_CLOSE_DURATION_MS - elapsedTime;

    if (remainingTime <= 0) {
        // すでに時間が経過している場合、すぐにクローズ処理を実行
        handleAutoCloseRoom(roomId);
        return;
    }

    // 残り時間でタイマーを設定
    roomCloseTimer = setTimeout(() => {
        handleAutoCloseRoom(roomId);
    }, remainingTime);

    console.log(`ルーム「${roomId}」は残り約 ${Math.ceil(remainingTime / (60 * 1000))} 分で自動クローズします。`);
    // showMessage(`ルーム「${roomId}」は残り約 ${Math.ceil(remainingTime / (60 * 1000))} 分で自動クローズします。`); // このメッセージは邪魔になる可能性があるのでコメントアウト
}

// ★追加: 自動クローズタイマーをクリア
function clearAutoCloseTimer() {
    if (roomCloseTimer) {
        clearTimeout(roomCloseTimer);
        roomCloseTimer = null;
        console.log("ルーム自動クローズタイマーをクリアしました。");
    }
}

// ★追加: 自動クローズ時のルーム削除処理
async function handleAutoCloseRoom(roomId) {
    showMessage(`ルーム「${roomId}」の自動クローズ処理を開始します...`);
    try {
        const roomRef = doc(db, "rooms", roomId);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists() && roomSnap.data().hostUid === currentHostUid) {
            // ホストのUIDが一致する場合のみ削除を試みる
            await resetGameAndDeleteRoom(roomId); // ゲームリセットとルーム削除を統合
            showMessage(`ルーム「${roomId}」が自動的にクローズ（削除）されました。`);
        } else {
            showMessage(`ルーム「${roomId}」は既に存在しないか、あなたがホストではないため自動クローズできませんでした。`);
        }
    } catch (error) {
        console.error("ルーム自動クローズエラー:", error);
        showMessage("ルームの自動クローズ中にエラーが発生しました。");
    } finally {
        clearAutoCloseTimer();
    }
}


// 役職入力欄のイベントリスナー設定
ALL_ROLE_NAMES.forEach(role => {
  const input = document.getElementById(`role_${role}`);
  if (input) {
    input.addEventListener('change', updateRolesCount);
    input.addEventListener('input', updateRolesCount);
  }
});


// ルーム作成
createRoomBtn.onclick = async () => {
  if (!currentHostUid) {
    showMessage("ルームを作成するにはホストとしてログインしてください。");
    return;
  }

  const roomId = roomIdInput.value.trim();
  const maxPlayers = parseInt(maxPlayersInput.value);
  if (!roomId) {
    showMessage("ルームIDを入力してください。");
    return;
  }
  if (isNaN(maxPlayers) || maxPlayers < 1) {
    showMessage("最大人数は3以上の数字を入力してください。");
    return;
  }

  setLoading(createRoomBtn, createRoomLoading, true);
  showMessage("ルームを作成中...");

  try {
    const roomRef = doc(db, "rooms", roomId);
    // ★追加: ルームIDの重複チェック
    const existingRoomSnap = await getDoc(roomRef);
    if (existingRoomSnap.exists()) {
        showMessage(`エラー: ルーム「${roomId}」は既に存在します。別のルームIDを使用してください。`);
        setLoading(createRoomBtn, createRoomLoading, false);
        return;
    }

    await setDoc(roomRef, {
      phase: null,
      gameOver: false,
      winner: null,
      maxPlayers: maxPlayers,
      rolesConfig: currentRolesConfig,
      executedPlayerRole: null,
      bakerStatus: currentRolesConfig['パン屋'] > 0 ? 'alive' : 'none',
      hostUid: currentHostUid,
      createdAt: new Date() // ★追加: ルーム作成時刻を保存
    });
    currentRoomId = roomId;
    currentMaxPlayers = maxPlayers;
    showMessage(`ルーム「${roomId}」を作成しました。最大人数: ${maxPlayers}`);
    watchRoomState(roomId);

    const hostPlayerRef = doc(db, 'rooms', roomId, 'players', currentHostUid);
    await setDoc(hostPlayerRef, {
        name: 'ホスト',
        role: 'GM',
        faction: null,
        status: 'alive',
        isHost: true
    });

  } catch (error) {
    console.error("ルーム作成エラー:", error);
    showMessage("ルームの作成に失敗しました。");
  } finally {
    setLoading(createRoomBtn, createRoomLoading, false);
  }
};

// ★追加: ホストとしてルームに再参加
reenterRoomBtn.onclick = async () => {
    if (!currentHostUid) {
        showMessage("ホストとしてログインしてください。");
        return;
    }
    const roomIdToReenter = reenterRoomIdInput.value.trim();
    if (!roomIdToReenter) {
        showMessage("再参加するルームIDを入力してください。");
        return;
    }

    setLoading(reenterRoomBtn, reenterRoomLoading, true);
    showMessage("ルームに再参加中...");

    try {
        const roomRef = doc(db, "rooms", roomIdToReenter);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            showMessage("指定されたルームは存在しません。");
            return;
        }

        const roomData = roomSnap.data();
        if (roomData.hostUid !== currentHostUid) {
            showMessage("このルームのホストではありません。");
            return;
        }

        currentRoomId = roomIdToReenter;
        currentMaxPlayers = roomData.maxPlayers;
        currentRolesConfig = roomData.rolesConfig || {};
        showMessage(`ルーム「${currentRoomId}」にホストとして再参加しました。`);
        watchRoomState(currentRoomId);
    } catch (error) {
        console.error("ルーム再参加エラー:", error);
        showMessage("ルームへの再参加に失敗しました。");
    } finally {
        setLoading(reenterRoomBtn, reenterRoomLoading, false);
    }
};


// 役職割り当て
assignRolesBtn.onclick = async () => {
  if (!currentHostUid) {
    showMessage("この操作を行うにはホストとしてログインしてください。");
    return;
  }
  if (!currentRoomId) {
    showMessage("ルームを先に作成してください。");
    return;
  }
  if (Object.values(currentRolesConfig).reduce((a, b) => a + b, 0) !== currentPlayersInRoom) {
    showMessage("エラー: 合計役職数と現在のプレイヤー数が一致していません。");
    return;
  }
  if (currentPlayersInRoom === 0) {
    showMessage("エラー: プレイヤーが一人もいません。");
    return;
  }

  setLoading(assignRolesBtn, assignRolesLoading, true);
  showMessage("役職を割り当て中...");

  try {
    const playersRef = collection(db, "rooms", currentRoomId, "players");
    const snapshot = await getDocs(playersRef);
    const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (players.length !== currentPlayersInRoom) {
      showMessage("エラー: プレイヤー数が変動しました。再試行してください。");
      return;
    }

    const rolesToAssign = [];
    for (const roleName of ALL_ROLE_NAMES) {
      for (let i = 0; i < (currentRolesConfig[roleName] || 0); i++) {
        rolesToAssign.push(roleName);
      }
    }
    rolesToAssign.sort(() => Math.random() - 0.5);

    for (let i = 0; i < players.length; i++) {
      const playerId = players[i].id;
      const role = rolesToAssign[i];
      // FACTIONS[role] が undefined にならないことを確認済みなので、直接使用
      await updateDoc(doc(db, "rooms", currentRoomId, "players", playerId), {
        role: role,
        faction: FACTIONS[role],
        status: "alive"
      });
    }

    await updateDoc(doc(db, "rooms", currentRoomId), {
      phase: "night"
    });

    showMessage("役職を割り当てました。ゲーム開始です（夜フェーズ）。");
  } catch (error) {
    console.error("役職割り当てエラー:", error);
    showMessage("役職の割り当てに失敗しました。");
  } finally {
    setLoading(assignRolesBtn, assignRolesLoading, false);
  }
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

startDayBtn.onclick = async () => {
  if (!currentHostUid) {
    showMessage("この操作を行うにはホストとしてログインしてください。");
    return;
  }
  if (!currentRoomId) {
    showMessage("ルームIDを入力してください。");
    return;
  }

  setLoading(startDayBtn, startDayLoading, true);
  showMessage("昼フェーズを開始中...");

  try {
    // --- デバッグコード: ルームのhostUidと現在のホストUIDの一致を再確認 ---
    console.log("--- 昼フェーズ開始デバッグ ---");
    console.log("現在のルームID:", currentRoomId);
    console.log("現在のホストUID:", currentHostUid);

    const roomRef = doc(db, "rooms", currentRoomId);
    const roomSnap = await getDoc(roomRef);

    if (roomSnap.exists()) {
      const roomData = roomSnap.data();
      console.log("Firestore上のルームデータ (昼フェーズ開始時):", roomData);
      if (roomData.hostUid) {
        console.log("Firestore上のhostUid (昼フェーズ開始時):", roomData.hostUid);
        if (roomData.hostUid === currentHostUid) {
          console.log("Firestore上のhostUidと現在のホストUIDが一致しています (昼フェーズ開始時)。");
        } else {
          console.error("Firestore上のhostUidと現在のホストUIDが一致しません (昼フェーズ開始時)！");
          showMessage("エラー: ルームのホストUIDが現在のログインユーザーと一致しません。");
          setLoading(startDayBtn, startDayLoading, false);
          return; // 処理を中断
        }
      } else {
        console.error("Firestore上のルームデータにhostUidフィールドが見つかりません (昼フェーズ開始時)！");
        showMessage("エラー: ルームデータにhostUidが設定されていません。");
        setLoading(startDayBtn, startDayLoading, false);
        return; // 処理を中断
      }
    } else {
      console.error("Firestoreにルームドキュメントが見つかりません (昼フェーズ開始時):", currentRoomId);
      showMessage("エラー: 指定されたルームが見つかりません。");
      setLoading(startDayBtn, startDayLoading, false);
      return; // 処理を中断
    }
    console.log("--- デバッグ: hostUid確認完了 (昼フェーズ開始時) ---");
    // --- デバッグコードここまで ---

    // handleNightResults() の中でのエラーも可能性あり
    console.log("デバッグ: handleNightResults 関数を呼び出し中...");
    try {
      await handleNightResults();
      console.log("デバッグ: handleNightResults 関数が完了しました。");
    } catch (handleResultError) {
      console.error("デバッグエラー: handleNightResults 実行中にエラーが発生しました。", handleResultError);
      showMessage("夜のアクション結果処理中にエラーが発生しました。詳細をコンソールで確認してください。");
      setLoading(startDayBtn, startDayLoading, false);
      return;
    }

    console.log("デバッグ: nightActions コレクションのドキュメントを削除中...");
    const nightActionsRef = collection(db, "rooms", currentRoomId, "nightActions");
    const nightActionsSnap = await getDocs(nightActionsRef);
    if (nightActionsSnap.empty) {
        console.log("デバッグ: 削除する夜のアクションはありません。");
    }
    for (const actionDoc of nightActionsSnap.docs) {
      console.log("デバッグ: nightActions ドキュメントを削除中:", actionDoc.id);
      try {
        await deleteDoc(actionDoc.ref);
        console.log(`デバッグ: nightActions ドキュメント ${actionDoc.id} を削除しました。`);
      } catch (deleteError) {
        console.error(`デバッグエラー: nightActions ドキュメント ${actionDoc.id} の削除中にパーミッションエラーが発生しました。`, deleteError);
        showMessage(`エラー: 夜のアクションデータの削除に失敗しました。詳細をコンソールで確認してください。`);
        setLoading(startDayBtn, startDayLoading, false);
        return;
      }
    }
    console.log("デバッグ: nightActions コレクションのドキュメント削除完了。");


    console.log("デバッグ: ルームフェーズを 'day' に更新中...");
    try {
      await updateDoc(doc(db, "rooms", currentRoomId), {
        phase: "day"
      });
      console.log("デバッグ: ルームフェーズを 'day' に更新しました。");
    } catch (phaseUpdateError) {
      console.error("デバッグエラー: ルームフェーズを 'day' に更新中にパーミッションエラーが発生しました。", phaseUpdateError);
      showMessage("エラー: 昼フェーズへの移行に失敗しました。詳細をコンソールで確認してください。");
      setLoading(startDayBtn, startDayLoading, false);
      return;
    }


    showMessage("昼フェーズを開始しました。");
  } catch (error) {
    // ここは主に getDocs(playersRef) など、個別の try/catch で捕捉しきれないエラー
    console.error("昼フェーズ開始処理全体のエラー:", error);
    showMessage("昼フェーズの開始に失敗しました。");
  } finally {
    setLoading(startDayBtn, startDayLoading, false);
    console.log("--- 昼フェーズ開始デバッグ終了 ---");
  }
};

// host.js の handleNightResults 関数全体をこれに置き換えてください

async function handleNightResults() {
  console.log("デバッグ: handleNightResults: 夜のアクションを処理中...");
  const nightActionsRef = collection(db, "rooms", currentRoomId, "nightActions");
  const nightActionsSnap = await getDocs(nightActionsRef);
  const actions = nightActionsSnap.docs.map(doc => doc.data());

  let killedPlayer = null;
  let protectedPlayer = null;

  const guardActions = actions.filter(a => a.action === "guard");
  if (guardActions.length > 0) {
      protectedPlayer = guardActions[0].target;
      console.log(`デバッグ: ${protectedPlayer} が騎士に護衛されました。`);
      showMessage(`${protectedPlayer} が騎士に護衛されました。`);
  }

  const killActions = actions.filter(a => a.action === "kill");
  if (killActions.length > 0) {
      const targetToKill = killActions[0].target;
      // ★修正箇所: divinedPlayer が未定義の可能性があるため、このログ行から削除
      // ログの目的によって修正方法が変わりますが、ここでは最も安全な方法として削除します。
      // もしdivinedPlayerの情報を表示したいなら、divineActionsの処理後にログを移動してください。
      console.log(`デバッグ: 人狼の襲撃ターゲット: ${targetToKill}, 護衛ターゲット: ${protectedPlayer}`);
      if (targetToKill !== protectedPlayer) {
          killedPlayer = targetToKill;
          console.log(`デバッグ: プレイヤー ${killedPlayer} を死亡状態に更新中...`);
          try {
            await updateDoc(doc(db, "rooms", currentRoomId, "players", killedPlayer), {
                status: "dead"
            });
            console.log(`デバッグ: プレイヤー ${killedPlayer} のステータスを 'dead' に更新しました。`);
            showMessage(`${killedPlayer} が人狼に襲撃されました。`);

            const killedPlayerSnap = await getDoc(doc(db, "rooms", currentRoomId, "players", killedPlayer));
            if (killedPlayerSnap.exists() && killedPlayerSnap.data().role === "パン屋") {
                console.log("デバッグ: 襲撃されたのはパン屋です。ルームのbakerStatusを更新中...");
                await updateDoc(doc(db, "rooms", currentRoomId), {
                    bakerStatus: "dead"
                });
                console.log("デバッグ: bakerStatus を 'dead' に更新しました。");
                showMessage("パン屋が人狼に襲撃されました！");
            }
          } catch (killedPlayerUpdateError) {
              console.error(`デバッグエラー: プレイヤー ${killedPlayer} のステータス更新中にパーミッションエラーが発生しました。`, killedPlayerUpdateError);
              throw killedPlayerUpdateError; // 上位のtry/catchで捕捉
          }
      } else {
          console.log(`デバッグ: ${protectedPlayer} は騎士に護衛され、襲撃を免れました。`);
          showMessage(`${protectedPlayer} は騎士に護衛され、襲撃を免れました。`);
      }
  }

  const divineActions = actions.filter(a => a.action === "divine");
  if (divineActions.length > 0) {
      const divinedPlayer = divineActions[0].target; // divinedPlayer はここで定義される
      const divineVoterId = divineActions[0].voter;

      // ★追加デバッグログ (divinedPlayer が定義されているifブロック内なので安全)
      console.log(`デバッグ: 占い師の結果処理 - 占われたプレイヤーUID: ${divinedPlayer}`);
      console.log(`デバッグ: 占い師 (Voter) UID: ${divineVoterId}`);
      console.log(`デバッグ: 現在ログインしているホストUID (request.auth.uidに相当): ${currentHostUid}`);


      const targetPlayerSnap = await getDoc(doc(db, "rooms", currentRoomId, "players", divinedPlayer));
      const divineVoterSnap = await getDoc(doc(db, "rooms", currentRoomId, "players", divineVoterId));

      if (targetPlayerSnap.exists() && divineVoterSnap.exists()) {
          const targetData = targetPlayerSnap.data();
          const divineResultRole = (targetData.role === "人狼" || targetData.role === "裏切り者") ? "人狼" : "村人";

          const updatePayload = {
              divineResult: { target: divinedPlayer, role: divineResultRole }
          };
          console.log(`デバッグ: 占い師 ${divineVoterId} に書き込むデータ:`, updatePayload);
          console.log(`デバッグ: 書き込み先パス: rooms/${currentRoomId}/players/${divineVoterId}`);

          try {
            await updateDoc(doc(db, "rooms", currentRoomId, "players", divineVoterId), updatePayload);
            console.log(`デバッグ: 占い師の結果をプレイヤー ${divineVoterId} に書き込みました。`);
            showMessage(`${divinedPlayer} が占い師に占われました。（結果は占い師に通知）`);
          } catch (divineUpdateError) {
              console.error(`デバッグエラー: 占い師の結果書き込み中にパーミッションエラーが発生しました。`, divineUpdateError);
              throw divineUpdateError;
          }
      } else {
        console.warn(`デバッグ警告: 占い師 (${divineVoterId}) または占われたプレイヤー (${divinedPlayer}) のデータが見つかりません。`);
      }
  }
  console.log("デバッグ: handleNightResults: 夜のアクション処理完了。");
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 投票集計
countVotesBtn.onclick = async () => {
  if (!currentHostUid) {
    showMessage("この操作を行うにはホストとしてログインしてください。");
    return;
  }
  if (!currentRoomId) {
    showMessage("ルームIDを入力してください。");
    return;
  }

  setLoading(countVotesBtn, countVotesLoading, true);
  showMessage("投票結果を集計中...");

  try {
    const votesSnap = await getDocs(collection(db, "rooms", currentRoomId, "votes"));
    const voteCounts = {};
    let alivePlayers = [];

    const playersSnap = await getDocs(collection(db, "rooms", currentRoomId, "players"));
    playersSnap.forEach(pDoc => {
      const playerData = pDoc.data();
      if (playerData.status === "alive") {
        alivePlayers.push({ id: pDoc.id, role: playerData.role });
      }
    });

    votesSnap.forEach(doc => {
      const { target, voter } = doc.data();
      if (alivePlayers.some(p => p.id === voter) && alivePlayers.some(p => p.id === target)) {
        voteCounts[target] = (voteCounts[target] || 0) + 1;
      }
    });

    const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      showMessage("誰にも投票されませんでした。");
      await updateDoc(doc(db, "rooms", currentRoomId), { phase: "night" });
      return;
    }

    const [executedPlayerId, count] = sorted[0];
    const topVotes = sorted.filter(item => item[1] === count);

    if (topVotes.length > 1) {
        showMessage(`同票が発生しました (${topVotes.map(t => t[0]).join(', ')}が${count}票)。再投票が必要な場合は、プレイヤーに指示し、再度「投票集計」を押してください。`);
        return;
    }

    const executedPlayerSnap = await getDoc(doc(db, "rooms", currentRoomId, "players", executedPlayerId));
    let executedRole = null;
    if (executedPlayerSnap.exists()) {
        executedRole = executedPlayerSnap.data().role;
    }

    await updateDoc(doc(db, "rooms", currentRoomId, "players", executedPlayerId), {
      status: "dead"
    });
    await updateDoc(doc(db, "rooms", currentRoomId), {
        executedPlayerRole: executedRole
    });

    showMessage(`${executedPlayerId} が処刑されました (${count}票)。役職: ${executedRole || '不明'}`);

    if (executedRole === "パン屋") {
        await updateDoc(doc(db, "rooms", currentRoomId), {
            bakerStatus: "dead"
        });
        showMessage("パン屋が処刑されました！");
    }

    const votesRef = collection(db, "rooms", currentRoomId, "votes");
    const existingVotes = await getDocs(votesRef);
    for (const voteDoc of existingVotes.docs) {
      await deleteDoc(voteDoc.ref);
    }

    const gameOver = await checkGameOverLogic(true);
    if (!gameOver) {
        await updateDoc(doc(db, "rooms", currentRoomId), {
            phase: "night"
        });
    }

  } catch (error) {
    console.error("投票集計エラー:", error);
    showMessage("投票結果の集計に失敗しました。");
  } finally {
    setLoading(countVotesBtn, countVotesLoading, false);
  }
};

// 勝利条件チェック (内部ロジック)
async function checkGameOverLogic(shouldUpdateRoom = false) {
  const playersSnap = await getDocs(collection(db, "rooms", currentRoomId, "players"));

  let wolfAlive = 0;
  let villagerAlive = 0;

  playersSnap.forEach(doc => {
    const data = doc.data();
    if (data.status === "alive") {
      if (FACTIONS[data.role] === "人狼") {
        wolfAlive++;
      } else if (FACTIONS[data.role] === "村人") {
        villagerAlive++;
      }
    }
  });

  let winner = null;
  if (wolfAlive >= villagerAlive && wolfAlive > 0) {
    winner = "人狼";
  }
  else if (wolfAlive === 0) {
    winner = "村人";
  }

  if (winner) {
    if (shouldUpdateRoom) {
      await updateDoc(doc(db, "rooms", currentRoomId), {
        gameOver: true,
        winner
      });
    }
    return true;
  }
  return false;
}

// 勝利条件チェック (ボタンクリック)
checkGameOverBtn.onclick = async () => {
  if (!currentHostUid) {
    showMessage("この操作を行うにはホストとしてログインしてください。");
    return;
  }
  if (!currentRoomId) {
    showMessage("ルームIDを入力してください。");
    return;
  }

  setLoading(checkGameOverBtn, checkGameOverLoading, true);
  showMessage("ゲーム終了を判定中...");

  try {
    const gameOver = await checkGameOverLogic(true);
    if (!gameOver) {
      showMessage("ゲームはまだ続きます。");
    }
  } catch (error) {
    console.error("ゲーム終了判定エラー:", error);
    showMessage("ゲーム終了の判定に失敗しました。");
  } finally {
    setLoading(checkGameOverBtn, checkGameOverLoading, false);
  }
};

// ゲームリセットとルーム削除を統合
async function resetGameAndDeleteRoom(roomId) {
    showMessage("ゲームをリセットし、ルームを削除しています...");
    try {
        clearAutoCloseTimer(); // ★追加: 削除前にタイマーをクリア

        // プレイヤーデータを全て削除
        const playersRef = collection(db, "rooms", roomId, "players");
        const playersSnap = await getDocs(playersRef);
        for (const playerDoc of playersSnap.docs) {
            await deleteDoc(playerDoc.ref);
        }

        // 投票データを全て削除
        const votesRef = collection(db, "rooms", roomId, "votes");
        const votesSnap = await getDocs(votesRef);
        for (const vote of votesSnap.docs) {
            await deleteDoc(vote.ref);
        }

        // 夜のアクションデータを全て削除
        const nightActionsRef = collection(db, "rooms", roomId, "nightActions");
        const nightActionsSnap = await getDocs(nightActionsRef);
        for (const actionDoc of nightActionsSnap.docs) {
            await deleteDoc(actionDoc.ref);
        }

        // ルーム自体を削除
        await deleteDoc(doc(db, "rooms", roomId));

        showMessage("ゲームがリセットされ、ルームが完全に削除されました！");
        currentRoomId = null;
        updateButtonStates(null); // UIを初期状態に戻す
        // ★UI初期化の追加
        roomIdInput.disabled = false;
        maxPlayersInput.disabled = false;
        reenterRoomIdInput.disabled = false; // ★追加
        currentRolesConfig = {};
        ALL_ROLE_NAMES.forEach(role => {
            const input = document.getElementById(`role_${role}`);
            if (input) input.value = 0;
        });
        document.getElementById('role_人狼').value = 1;
        document.getElementById('role_村人').value = 2;
        document.getElementById('role_占い師').value = 1;
        document.getElementById('role_パン屋').value = 1;
        updateRolesCount();
    } catch (error) {
        console.error("ゲームリセット/ルーム削除エラー:", error);
        showMessage("ゲームのリセットまたはルームの削除に失敗しました。");
    }
}

// ゲームリセットボタンクリック
resetGameBtn.onclick = async () => {
    if (!currentHostUid) {
        showMessage("この操作を行うにはホストとしてログインしてください。");
        return;
    }
    if (!currentRoomId) {
        showMessage("リセットするルームが指定されていません。");
        return;
    }
    if (confirm("本当にゲームをリセットしてルームを初期状態に戻しますか？（プレイヤーデータは削除されません）")) {
        setLoading(resetGameBtn, resetGameLoading, true);
        // ルームデータは残し、プレイヤーのrole/faction/statusを初期化
        try {
            const playersRef = collection(db, "rooms", currentRoomId, "players");
            const playersSnap = await getDocs(playersRef);
            for (const playerDoc of playersSnap.docs) {
                // ホスト以外のプレイヤーは role を null に、status を alive に戻す
                if (playerDoc.id !== currentHostUid) {
                    await updateDoc(playerDoc.ref, {
                        role: null,
                        faction: null,
                        status: 'alive'
                    });
                }
            }

            // 投票データを全て削除
            const votesRef = collection(db, "rooms", currentRoomId, "votes");
            const votesSnap = await getDocs(votesRef);
            for (const vote of votesSnap.docs) {
                await deleteDoc(vote.ref);
            }

            // 夜のアクションデータを全て削除
            const nightActionsRef = collection(db, "rooms", currentRoomId, "nightActions");
            const nightActionsSnap = await getDocs(nightActionsRef);
            for (const actionDoc of nightActionsSnap.docs) {
                await deleteDoc(actionDoc.ref);
            }

            // ルームのフェーズ、ゲーム終了状態、パン屋の状態をリセット
            await updateDoc(doc(db, "rooms", currentRoomId), {
                phase: null,
                gameOver: false,
                winner: null,
                executedPlayerRole: null,
                bakerStatus: currentRolesConfig['パン屋'] > 0 ? 'alive' : 'none'
            });

            showMessage("ゲームをリセットしました。プレイヤーは再参加して役職を待機してください。");
            updateButtonStates(null); // UIを初期状態に戻す
        } catch (error) {
            console.error("ゲームリセットエラー:", error);
            showMessage("ゲームのリセットに失敗しました。");
        } finally {
            setLoading(resetGameBtn, resetGameLoading, false);
        }
    }
};

// ★追加: ルーム削除ボタンクリック
deleteRoomBtn.onclick = async () => {
    if (!currentHostUid) {
        showMessage("この操作を行うにはホストとしてログインしてください。");
        return;
    }
    if (!currentRoomId) {
        showMessage("削除するルームが指定されていません。");
        return;
    }
    if (confirm(`本当にルーム「${currentRoomId}」とその全てのデータを完全に削除しますか？この操作は元に戻せません！`)) {
        setLoading(deleteRoomBtn, deleteRoomLoading, true);
        await resetGameAndDeleteRoom(currentRoomId);
        setLoading(deleteRoomBtn, deleteRoomLoading, false);
    }
};


// 初期ロード時の認証とUI初期化
document.addEventListener('DOMContentLoaded', () => {
  const hostLoginStatusSpan = document.getElementById('hostLoginStatus');
  if (hostLoginStatusSpan) {
      hostLoginStatusSpan.textContent = "自動ログイン中...";
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentHostUid = user.uid;
      if (hostLoginStatusSpan) {
          hostLoginStatusSpan.textContent = `ログイン中: 匿名ユーザー (UID: ${user.uid.substring(0, 8)}...)`;
      }
      showMessage("ホストとして自動ログインしました。");
      // ユーザーが手動でルームIDを入力して再参加できるよう、初期状態ではroomIdInputを空にする
      // const storedRoomId = roomIdInput.value.trim();
      // if (storedRoomId) {
      //   currentRoomId = storedRoomId;
      //   watchRoomState(storedRoomId);
      // } else {
      updateButtonStates(null);
      // }
    } else {
      try {
        const userCredential = await signInAnonymously(auth);
        currentHostUid = userCredential.user.uid;
        if (hostLoginStatusSpan) {
            hostLoginStatusSpan.textContent = `ログイン成功: 匿名ユーザー (UID: ${userCredential.user.uid.substring(0, 8)}...)`;
        }
        showMessage("ホストとして匿名ログインしました。");
        updateButtonStates(null);
      } catch (error) {
        console.error("ホスト匿名ログインエラー:", error);
        showMessage("ホストとしてログインできませんでした。");
        if (hostLoginStatusSpan) {
            hostLoginStatusSpan.textContent = "ログイン失敗";
        }
        // 全てのボタンを無効化
        createRoomBtn.disabled = true;
        reenterRoomBtn.disabled = true; // ★追加
        assignRolesBtn.disabled = true;
        startDayBtn.disabled = true;
        countVotesBtn.disabled = true;
        checkGameOverBtn.disabled = true;
        resetGameBtn.disabled = true;
        deleteRoomBtn.disabled = true; // ★追加
        maxPlayersInput.disabled = true;
        roomIdInput.disabled = true; // ★追加
        reenterRoomIdInput.disabled = true; // ★追加
      }
    }
    updateRolesCount(); // 初期ロード時に役職合計を更新
  });
});
