const admin = require("firebase-admin");

// JSON 파일과 backfillNicknames.js가 같은 폴더에 있다고 가정
const serviceAccount = require("./typenews-dbe9c-firebase-adminsdk-fbsvc-68fc058201.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount), // 서비스 계정 키로 인증
});

const db = admin.firestore();


async function backfillNicknames() {
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    const nickname = userData.displayName;

    if (!nickname) {
      console.log(`❌ 닉네임 없는 사용자: ${uid}`);
      continue;
    }

    const statsRef = db.collection("users").doc(uid).collection("monthlyStats");
    const statsSnapshot = await statsRef.get();

    for (const statDoc of statsSnapshot.docs) {
      const statData = statDoc.data();

      if (!statData.nickname) {
        await statDoc.ref.set({ nickname }, { merge: true });
        console.log(`✅ ${uid}/${statDoc.id} 문서에 nickname 추가: ${nickname}`);
      } else {
        console.log(`➡️  ${uid}/${statDoc.id} 이미 nickname 있음`);
      }
    }
  }

  console.log("🎉 모든 nickname 백필 완료");
}

backfillNicknames().catch(console.error);
