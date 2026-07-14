const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(); // Firebase Admin SDK 초기화

const db = admin.firestore();

// 매월 마지막 날 오후 11시 30분에 실행되는 함수
exports.archiveMonthlyRankings = functions.pubsub.schedule('0 13 L * *')
    .timeZone('Asia/Seoul') // 한국 시간대 (KST)로 설정
    .onRun(async (context) => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const yearMonth = `${year}${month}`; // 예: "202507"

        console.log(`[${yearMonth}] 월간 랭킹 아카이빙 작업을 시작합니다.`);

        try {
            // 1. Firestore에서 해당 월의 랭킹 데이터 조회
            const snapshot = await db.collectionGroup("monthlyStats")
                .where("month", "==", yearMonth)
                .orderBy("typingCount", "desc")
                .limit(50) // 최대 50위까지
                .get();

            const rankingsData = snapshot.docs.map((doc, i) => {
                const data = doc.data();
                return {
                    rank: i + 1,
                    uid: doc.id, // monthlyStats 문서 ID는 보통 UID이므로 uid로 저장 (또는 doc.ref.parent.parent.id)
                    nickname: data.nickname || "익명",
                    typingCount: data.typingCount || 0,
                    // 필요한 경우 더 많은 필드를 추가할 수 있습니다.
                    // maxCPM: data.maxCPM || 0,
                    // email: data.email || null,
                };
            });

            // 2. 아카이브할 문서 데이터 준비
            const archiveDocData = {
                archiveDate: admin.firestore.Timestamp.fromDate(now), // 아카이빙 된 정확한 날짜와 시간
                yearMonth: yearMonth,
                rankings: rankingsData, // 랭킹 배열
                totalParticipants: snapshot.size // 해당 월에 기록된 총 사용자 수 (선택 사항)
            };

            // 3. 'pastRankings'라는 새로운 컬렉션에 문서 저장
            // 문서 ID를 'YYYYMM' 형식으로 저장하여 고유성 확보 및 쉽게 찾도록 합니다.
            await db.collection('pastRankings').doc(yearMonth).set(archiveDocData);

            console.log(`[${yearMonth}] 월간 랭킹이 'pastRankings/${yearMonth}' 문서에 성공적으로 아카이빙되었습니다.`);
            return null;

        } catch (error) {
            console.error(`[${yearMonth}] 월간 랭킹 아카이빙 중 오류 발생:`, error);
            return null;
        }
    });