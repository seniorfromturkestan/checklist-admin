import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

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
