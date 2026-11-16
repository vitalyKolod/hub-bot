import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import type { Api } from "grammy";

/** Isolated fixtures: never connects to a configured MONGO_URI or sends to Telegram. */
export async function createDemo(port = 3001, richFixtures = false) {
  process.env.NODE_ENV = "development";
  process.env.HUB_API_DEMO = "true";
  process.env.ADMIN_IDS = "9001";
  process.env.BOT_TOKEN = "123456:demo-token";
  for (const [index, name] of [
    "ADMIN_GROUP_ID",
    "CONTENT_GROUP_ID",
    "SUPPORT_GROUP_ID",
    "SUNDAY_SCREENS_GROUP_ID",
    "PROP_WAITLIST_THREAD_ID",
    "PROP_STREAM_VERIFY_THREAD_ID",
  ].entries())
    process.env[name] = String(100001 + index);
  const mongo = await MongoMemoryServer.create({
    instance: { dbName: "hub_api_demo" },
  });
  try {
    await mongoose.connect(mongo.getUri());
    const [
      { UserModel },
      { TeamModel },
      { PaymentModel },
      { AdminAccessModel },
      { createApiServer },
      { ApiError },
      { startNotificationWorker },
      { startBroadcastWorker },
    ] = await Promise.all([
      import("../src/models/User.js"),
      import("../src/models/Team.js"),
      import("../src/models/Payment.js"),
      import("../src/models/AdminAccess.js"),
      import("../src/api/server.js"),
      import("../src/api/http.js"),
      import("../src/api/notifications.js"),
      import("../src/services/broadcast.service.js"),
    ]);
    await UserModel.create([
      {
        telegramId: 1001,
        fio: "Владелец демо",
        city: "Тбилиси",
        church: "Демо",
        reg: "done",
      },
      { telegramId: 1002, fio: "Участник демо", reg: "done" },
      { telegramId: 1003, fio: "Другой пользователь", reg: "done" },
      { telegramId: 9001, fio: "Суперадмин демо", reg: "done" },
      { telegramId: 9002, fio: "Консультант демо", reg: "done" },
      { telegramId: 9003, fio: "Поддержка демо", reg: "done" },
    ]);
    await AdminAccessModel.create([
      { telegramId: 9002, role: "consultant", permissions: [], active: true },
      {
        telegramId: 9003,
        role: "admin",
        permissions: ["support.view", "support.reply"],
        active: true,
      },
    ]);
    const team = await TeamModel.create({
      name: "Демо-команда",
      ownerId: 1001,
      members: [
        { telegramId: 1001, role: "owner", status: "active" },
        { telegramId: 1002, role: "member", status: "active" },
      ],
      subscriptions: {
        procontent: {
          status: "active",
          expiresAt: new Date(Date.now() + 86400000 * 30),
        },
      },
    });
    const payment = await PaymentModel.create({
      userId: 1001,
      teamId: team.id,
      productId: "cmg",
      amount: 500,
      currency: "rub",
      paymentMethod: "demo",
      operation: "purchase",
      receipt: { type: "document", telegramFileId: "demo-receipt" },
    });
    if (richFixtures) {
      const [
        { ProPresenterStreamModel },
        { ProPresenterDeviceModel },
        { TutorialTopicModel, TutorialLessonModel },
        { SupportTicketModel },
        { SupportMessageModel },
        { TeamInviteModel },
      ] = await Promise.all([
        import("../src/models/ProPresenterStream.js"),
        import("../src/models/ProPresenterDevice.js"),
        import("../src/models/Tutorial.js"),
        import("../src/models/SupportTicket.js"),
        import("../src/models/SupportMessage.js"),
        import("../src/models/TeamInvite.js"),
      ]);
      await UserModel.updateOne(
        { telegramId: 1001 },
        { $set: { fio: "Иван Петров", church: "Надежда", city: "Тбилиси" } },
      );
      await UserModel.updateOne(
        { telegramId: 1002 },
        { $set: { fio: "Мария Орлова" } },
      );
      await UserModel.create([
        { telegramId: 2001, fio: "Алексей Смирнов", reg: "done" },
        { telegramId: 2002, fio: "Дарья Новикова", reg: "done" },
        { telegramId: 2003, fio: "Сергей Белов", reg: "done" },
      ]);
      const expiresAt = new Date(Date.now() + 86400000 * 129);
      await ProPresenterStreamModel.create({
        flowNumber: 10,
        email: "demo@hub.local",
        password: "DEMO-ONLY",
        chatLink: "https://t.me/+DEMO",
        expiresAt,
        capacity: 30,
      });
      team.name = "Церковь «Надежда»";
      team.members.push(
        ...[2001, 2002, 2003].map(
          (telegramId) =>
            ({ telegramId, role: "member", status: "active" }) as any,
        ),
      );
      for (const [index, productId] of [
        "propresenter",
        "cmg",
        "storyloops",
        "procontent",
        "sunday_screens",
        "cgs",
      ].entries())
        team.subscriptions.set(productId, {
          status: "active",
          expiresAt: new Date(Date.now() + 86400000 * (129 + index * 40)),
          meta:
            productId === "propresenter"
              ? {
                  flowNumber: 10,
                  email: "demo@hub.local",
                  password: "DEMO-ONLY",
                  chatLink: "https://t.me/+DEMO",
                }
              : {},
        } as any);
      await team.save();
      await ProPresenterDeviceModel.create({
        teamId: team.id,
        name: "MacBook · основной",
        flowNumber: 10,
        status: "active",
        createdBy: 9001,
        paidThrough: expiresAt,
      });
      const topic = await TutorialTopicModel.create({
        title: "Начало работы",
        order: 0,
      });
      await TutorialLessonModel.create({
        topicId: topic.id,
        title: "Как подготовиться к служению",
        description:
          "Проверьте подписку, откройте материалы и добавьте устройства вашей команды. Если нужна помощь, напишите в поддержку HUB.",
        published: true,
        order: 0,
      });
      const ticket = await SupportTicketModel.create({
        userId: 1001,
        threadId: 111,
        status: "open",
      });
      await SupportMessageModel.create([
        {
          ticketId: ticket.id,
          senderType: "admin",
          senderId: 9001,
          source: "web",
          text: "Здравствуйте, Иван! Оплату по CMG видим, она на проверке.",
          createdAt: new Date(Date.now() - 120000),
        },
        {
          ticketId: ticket.id,
          senderType: "user",
          senderId: 1001,
          source: "web",
          text: "Хорошо, спасибо, ждём!",
          createdAt: new Date(Date.now() - 60000),
        },
      ]);
      await TeamInviteModel.create({
        teamId: team.id,
        code: "de000001",
        createdBy: 1001,
        status: "active",
      });
    }
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init()),
    );
    let messageId = 1;
    let threadId = 100;
    const deliveries: Array<{ method: string; args: unknown[] }> = [];
    let failDelivery = false;
    const send = async (method: string, args: unknown[]) => {
      if (failDelivery)
        throw new ApiError(
          502,
          "TELEGRAM_UNAVAILABLE",
          "Simulated Telegram outage",
        );
      deliveries.push({ method, args });
      return {
        message_id: messageId++,
        ...(method === "sendDocument"
          ? {
              document: {
                file_id: `demo-file-${messageId}`,
                mime_type: "application/pdf",
              },
            }
          : {}),
        ...(method === "sendPhoto"
          ? { photo: [{ file_id: `demo-photo-${messageId}` }] }
          : {}),
        ...(method === "sendVideo"
          ? { video: { file_id: `demo-video-${messageId}` } }
          : {}),
      };
    };
    const telegram = {
      token: process.env.BOT_TOKEN,
      sendMessage: (...args: unknown[]) => send("sendMessage", args),
      sendDocument: (...args: unknown[]) => send("sendDocument", args),
      sendPhoto: (...args: unknown[]) => send("sendPhoto", args),
      sendVideo: (...args: unknown[]) => send("sendVideo", args),
      copyMessage: (...args: unknown[]) => send("copyMessage", args),
      copyMessages: (...args: unknown[]) => send("copyMessages", args),
      editMessageText: (...args: unknown[]) => send("editMessageText", args),
      editMessageReplyMarkup: (...args: unknown[]) =>
        send("editMessageReplyMarkup", args),
      createForumTopic: async () => ({ message_thread_id: threadId++ }),
      closeForumTopic: async () => true,
      reopenForumTopic: async () => true,
      createChatInviteLink: async () => ({
        invite_link: "https://t.me/+DEMO",
        expire_date: Math.floor(Date.now() / 1000) + 3600,
      }),
      getMe: async () => ({ id: 123456, username: "hub_demo_bot" }),
      getFile: async () => {
        throw new ApiError(
          404,
          "DEMO_MEDIA_UNAVAILABLE",
          "Demo fixtures contain no Telegram files",
        );
      },
    } as unknown as Api;
    const server = createApiServer({
      botToken: process.env.BOT_TOKEN,
      port,
      host: "127.0.0.1",
      allowDevAuth: true,
      telegram,
      rateLimitPerMinute: 1000,
      allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    const stopWorker = startNotificationWorker(telegram);
    const stopBroadcasts = startBroadcastWorker(telegram);
    return {
      server,
      mongo,
      teamId: team.id,
      paymentId: payment.id,
      deliveries,
      telegram,
      setDeliveryFailure(value: boolean) {
        failDelivery = value;
      },
      async close() {
        stopWorker();
        stopBroadcasts();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await mongoose.disconnect();
        await mongo.stop();
      },
    };
  } catch (error) {
    await mongoose.disconnect();
    await mongo.stop();
    throw error;
  }
}
