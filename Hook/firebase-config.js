import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = { /* 사용자님의 API KEY 설정 */ };
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export function saveScore(mode, name, score) {
    // 보안: 데이터 수정 방지를 위해 push()만 사용
    const scorePath = mode === 'infinite' ? 'scores/infinite' : 'scores/speedrun';
    const newRef = push(ref(db, scorePath));
    return set(newRef, {
        name: name,
        score: parseFloat(score),
        timestamp: Date.now()
    });
}

export function loadRanking(mode, callback) {
    const scorePath = mode === 'infinite' ? 'scores/infinite' : 'scores/speedrun';
    const scoresRef = query(ref(db, scorePath), orderByChild('score'), limitToLast(10));
    onValue(scoresRef, (snapshot) => {
        const data = snapshot.val();
        callback(data);
    });
}
// firebase-config.js 내 스피드런 로드 함수
export function loadSpeedrunRanking(mapId, callback) {
    const scoresRef = query(
        ref(db, `scores/speedrun/${mapId}`), 
        orderByChild('score'), // 시간 순으로 정렬
        limitToFirst(10)       // '낮은' 점수 상위 10개만 가져옴
    );
    onValue(scoresRef, (snapshot) => {
        const data = snapshot.val();
        // 데이터가 객체 형태이므로 배열로 변환 후 오름차순 정렬
        const sorted = data ? Object.values(data).sort((a, b) => a.score - b.score) : [];
        callback(sorted);
    });
}