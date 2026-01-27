import {onSchedule} from "firebase-functions/v2/scheduler";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * Ensures the caller is authenticated and has superadmin role.
 * @param {string} callerUid Caller Firebase Auth UID.
 * @return {Promise<void>} Resolves if allowed, otherwise throws HttpsError.
 */
async function assertSuperadmin(callerUid: string) {
  const snap = await db.collection("Users").doc(callerUid).get();
  const raw = snap.data() as Record<string, unknown> | undefined;
  const role = snap.exists ? String(raw?.role ?? "") : "";
  if (role !== "superadmin") {
    throw new HttpsError(
      "permission-denied",
      "Only superadmin can create users"
    );
  }
}

/**
 * Formats a Date as YYYY-MM-DD.
 * @param {Date} d Input date.
 * @return {string} Date string in YYYY-MM-DD.
 */
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns ISO day-of-week number (1=Mon ... 7=Sun).
 * @param {Date} d Input date.
 * @return {number} ISO weekday (1..7).
 */
function isoDow(d: Date) {
  const js = d.getDay(); // 0 Sun..6 Sat
  return js === 0 ? 7 : js;
}

export const fanoutDailyTasks = onSchedule(
  {
    schedule: "1 0 * * *", // 00:01 каждый день
    timeZone: "Asia/Almaty",
  },
  async () => {
    const now = new Date();
    const today = ymd(now);
    const dow = isoDow(now);

    // если у тебя multi-tenant: пробегаем по кофейням
    const shops = await db.collection("coffeeshops").get();

    for (const shop of shops.docs) {
      const shopId = shop.id;

      const tasksSnap = await db
        .collection(`coffeeshops/${shopId}/tasks`)
        .where("active", "==", true)
        .get();

      const batch = db.batch();

      for (const t of tasksSnap.docs) {
        const data = t.data() as Record<string, unknown>;

        const repeat = data.repeat_type ?? "weekly";
        const days: number[] = Array.isArray(data.days) ? data.days : [];

        const shouldRunToday = repeat === "weekly" ?
          days.includes(dow) :
          false; // one_time отдельно ниже

        if (repeat === "weekly" && !shouldRunToday) continue;

        // Для one_time вариант:
        // если у задачи есть scheduled_date: 'YYYY-MM-DD'
        if (repeat === "one_time") {
          const scheduled = String(data.scheduled_date ?? "");
          if (scheduled !== today) continue;
        }

        const taskId = t.id;
        const resultId = `${taskId}_${today}`; // защита от дублей
        const ref = db.doc(`coffeeshops/${shopId}/task_results/${resultId}`);

        batch.set(
          ref,
          {
            task_id: taskId,
            title: String(data.title ?? ""),
            type: data.type ?? "checkbox",
            status: "Not_Done",
            date: today,
            expected_finish_time: data.expected_finish_time ?? null,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true} // если уже есть — не перезатираем
        );
      }

      await batch.commit();
    }
  }
);

/**
 * Creates a Firebase Auth user + writes a profile into Firestore `Users/{uid}`.
 * Only callable by a user with role `superadmin` in Firestore.
 */
export const createUserAccount = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    await assertSuperadmin(request.auth.uid);

    const data = request.data as Record<string, unknown>;
    const email = String(data.email ?? "").trim().toLowerCase();
    const password = String(data.password ?? "").trim();
    const name = String(data.name ?? "").trim();
    const role = String(data.role ?? "staff").trim();
    const coffeeshopIdRaw = data.coffeeshop_id;
    const coffeeshopId =
      coffeeshopIdRaw == null ? null : String(coffeeshopIdRaw);

    if (!email) throw new HttpsError("invalid-argument", "email is required");
    if (!password || password.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "password must be at least 6 chars"
      );
    }
    if (!name) throw new HttpsError("invalid-argument", "name is required");

    if (role !== "superadmin" && !coffeeshopId) {
      throw new HttpsError(
        "invalid-argument",
        "coffeeshop_id required for admin/staff"
      );
    }

    // 1) Create Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    const uid = userRecord.uid;

    // 2) Create profile in Firestore (do NOT store password)
    await db
      .collection("Users")
      .doc(uid)
      .set(
        {
          name,
          login: email,
          email,
          role,
          coffeeshop_id: role === "superadmin" ? null : coffeeshopId,
          created_at: Date.now(),
        },
        {merge: true}
      );

    return {uid};
  }
);
