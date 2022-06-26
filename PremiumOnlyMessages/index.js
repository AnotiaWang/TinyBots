import { Telegraf } from "telegraf";
import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";

const keyboard = {
    try: [[{
        text: "在内联模式中使用",
        switch_inline_query: ''
    }]],

    premiumOnly: (index) => [[{
        text: "点击查看",
        callback_data: `${index}:true`
    }]],

    nonPremiumOnly: (index) => [[{
        text: "点击查看",
        callback_data: `${index}:false`
    }]],

    again: [[{
        text: "再次发送",
        switch_inline_query_current_chat: ''
    }]]
}
let BOT_TOKEN, ADMIN_ID;
let data = {
    analytics: {
        active: 0,
        views: 1000
    }
};
let needsSaveData = false;
let online = true;

// 封装命令行输入功能
async function input(prompt = '') {
    return new Promise((resolve) => {
        createInterface({
            input: process.stdin,
            output: process.stdout
        }).question(prompt, (answer) => resolve(answer));
    });
}

// console.log wrapper
function log(...args) {
    const timeStr = new Date().toLocaleString("zh-CN");
    console.log(`[${timeStr}] ${args.join(' ')}`);
}

// 随机字符串
function randomStr(e = 5) {
    const charString = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678",
        length = charString.length;
    let string = "";
    for (let i = 0; i < e; i++)
        string += charString.charAt(Math.floor(Math.random() * length));
    return string;
}

// 加载 BOT_TOKEN
if (existsSync("./config.json")) {
    const content = JSON.parse(readFileSync("./config.json", "utf-8"));
    if (content.BOT_TOKEN) BOT_TOKEN = content.BOT_TOKEN;
    if (content.ADMIN_ID) ADMIN_ID = content.ADMIN_ID;
}

// 加载数据
if (existsSync("./data_raw.json")) {
    data = JSON.parse(readFileSync("./data_raw.json", "utf-8"));
    data.analytics.active = Object.keys(data).length - 1;
}

while (!BOT_TOKEN) {
    BOT_TOKEN = await input("请输入机器人 Token: ");
}
while (!ADMIN_ID) {
    ADMIN_ID = await input("请输入管理员 ID: ");
}

writeFileSync("./config.json", JSON.stringify({ BOT_TOKEN, ADMIN_ID }));

const bot = new Telegraf(BOT_TOKEN);

bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery;
    const user = query.from, userId = user.id;
    const text = query.query;

    if (!online) {
        return ctx.answerInlineQuery([{
            type: "article",
            id: "offline",
            title: `🚫 维护中`,
            description: `请稍后再试`,
            input_message_content: {
                message_text: `机器人维护中，请稍后再试`,
            }
        }], { cache_time: 0 }).catch(() => null);
    }

    try {
        // 限制输入
        if (text.length > 0 && text.length < 200) {
            let index;
            // 生成一个标识
            for (let key in data) {
                if (data[key].value === text) {
                    index = key;
                    data[key].time = Date.now();
                }
            }
            if (!index) {
                index = randomStr();
                data[index] = {
                    value: text,
                    time: Date.now(),
                    user: userId
                };
                data.analytics.active++;
            }
            needsSaveData = true;

            // 回应请求
            await ctx.answerInlineQuery([{
                type: "article",
                id: "premium",
                title: "发送仅 Premium 用户可见的消息",
                description: "3 天后自毁",
                input_message_content: {
                    message_text: "我发送了一条仅 Telegram Premium 用户可见的消息，点击下方按钮看看吧！",
                    disable_web_page_preview: true
                },
                reply_markup: {
                    inline_keyboard: keyboard.premiumOnly(index)
                }
            }, {
                type: "article",
                id: "non_premium",
                title: "发送仅非 Premium 用户可见的消息",
                description: "3 天后自毁",
                input_message_content: {
                    message_text: "我发送了一条仅非 Telegram Premium 用户可见的消息，点击下方按钮看看吧！",
                    disable_web_page_preview: true
                },
                reply_markup: {
                    inline_keyboard: keyboard.nonPremiumOnly(index)
                }
            }], { cache_time: 0 });
            log(`${userId} 生成了一条消息 (${index})`);
        }
        // 输入不合法
        else {
            await ctx.answerInlineQuery([{
                type: "article",
                id: "welcome",
                title: `字数过${text.length < 1 ? "少" : "多"}`,
                description: `请输入 1 ~ 200 个字符`,
                input_message_content: {
                    message_text: `输入内容过${text.length < 1 ? "少" : "长"}！`,
                },
                reply_markup: {
                    inline_keyboard: keyboard.again
                }
            }, {
                type: "article",
                id: "analytics",
                title: "统计数据（可能有延迟）",
                description: `${data.analytics.active} 条有效消息 | 共被查看 ${data.analytics.views} 次`,
                input_message_content: {
                    message_text: `统计数据：\n${data.analytics.active} 条有效消息\n总查看 ${data.analytics.views} 次`
                },
                reply_markup: {
                    inline_keyboard: keyboard.again
                }
            }], { cache_time: 0 });
        }
    }
    catch (e) {
        ctx.answerInlineQuery([{
            type: "article",
            id: "err",
            title: "🤯 出错了",
            description: "出了点问题，稍后再试吧",
            input_message_content: {
                message_text: "出了点问题，稍后再试吧"
            },
            reply_markup: {
                inline_keyboard: keyboard.again
            }
        }], { cache_time: 0 }).catch(() => null);
        log(`处理 ${userId} 的请求时出错。\n请求：${text}\n${e.stack}`);
    }
});

bot.on("callback_query", async (ctx) => {
    const query = ctx.callbackQuery;
    const user = query.from;
    const userId = user.id, isPremium = user.is_premium || false;
    const [index, premiumOnly] = query.data.split(':');

    // 如果机器人离线
    if (!online) {
        return ctx.answerCbQuery("机器人维护中，请稍后再试。", { show_alert: true });
    }

    try {
        // 检查对应消息是否存在
        if (index && data[index]) {
            if ((premiumOnly === "true" && isPremium) || (premiumOnly === "false" && !isPremium)) {
                await ctx.answerCbQuery(data[index].value, { show_alert: true });
                log(`${userId} 查看了一条${isPremium ? '' : "非"} Premium 消息`);
                data.analytics.views++;
            }
            else {
                await ctx.answerCbQuery(isPremium ? "此消息仅非 Premium 用户可以查看。" : "此消息仅 Premium 用户可以查看。", { show_alert: true });
            }
        }
        else {
            await ctx.answerCbQuery("此消息发送已超过 3 天，已失效。", { show_alert: true });
        }
    }
    catch (e) {
        ctx.answerCbQuery("出错了，请稍后再试", { show_alert: true });
        console.error(`处理来自 ${userId} 的调取 ${index} 请求时出错：${e.message}`);
    }
});

bot.on("message", (ctx) => {
    if (ctx.chat.type === "private") {
        const userId = ctx.from.id.toString();
        const text = ctx.message.text || '';

        // 管理员命令
        if (userId === ADMIN_ID) {
            if (text.startsWith("/off")) {
                online = false;
                ctx.reply("已进入维护模式");
            }
            else if (text.startsWith("/on")) {
                online = true;
                ctx.reply("已退出维护模式");
            }
            else if (text.startsWith("/stats")) {
                ctx.reply(`有效消息：${data.analytics.active}\n总查看次数：${data.analytics.views}`);
            }
        }
        else {
            ctx.reply("请在内联模式中使用。", {
                reply_markup: {
                    inline_keyboard: keyboard.try
                }
            }).catch(() => null);
        }
    }
});

await bot.launch();
log("启动成功");

// 定期保存数据
setInterval(() => {
    if (needsSaveData) {
        writeFileSync("./data_raw.json", JSON.stringify(data));
        writeFileSync("./data.json", JSON.stringify(data, null, 2));
    }
}, 10 * 1000);

// 自动清除过期数据
setInterval(() => {
    const now = Date.now();
    let count = 0;
    for (let key in data) {
        if (now - data[key].time > 3 * 86400 * 1000) {
            delete data[key];
            count++;
        }
    }
    data.analytics.active -= count;
    log(`自动清理了 ${count} 条过期消息`);
}, 10 * 60 * 1000);

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason, 'Unhandled Rejection at', promise);
}).on('uncaughtException', error => {
    console.error(error, 'Uncaught Exception thrown');
});
