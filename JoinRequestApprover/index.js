/*
此机器人由 GitHub@AnotiaWang 编写，Date: 2022.06.20
 */

import { Telegraf } from "telegraf";
import { createInterface } from "readline";
import { readFileSync, existsSync, writeFileSync } from "fs";

const readline = createInterface({
    input: process.stdin,
    output: process.stdout
});

async function ask(question) {
    return new Promise((resolve) => {
        readline.question(question, (answer) => {
            resolve(answer);
        });
    });
}

function log(...args) {
    console.log(`[${(new Date().toLocaleString("zh-CN"))}]`, args.join(' '));
}

async function getSecrets() {
    let BOT_TOKEN;
    if (existsSync("./config.json")) {
        const content = JSON.parse(readFileSync("./config.json", "utf8"));
        ({ BOT_TOKEN } = content);
    }
    if (!BOT_TOKEN) {
        BOT_TOKEN = await ask("请输入机器人 Token: ");
    }
    return { BOT_TOKEN };
}

const secrets = await getSecrets();
const { BOT_TOKEN } = secrets;

writeFileSync("./config.json", JSON.stringify(secrets, null, 2));

const Bot = new Telegraf(BOT_TOKEN);

Bot.on("chat_join_request", async (ctx) => {
    const request = ctx.chatJoinRequest;
    const userId = request.from.id;
    const userNick = request.from.first_name + (request.from.last_name ? ` ${request.from.last_name}` : '');
    const userInfo = `${userId} (${userNick})`;

    if (request.chat.type === "supergroup" || request.chat.type === "group") {
        log(`收到 ${userInfo} 的加群请求，正在查询...`);

        try {
            const groupInfo = await ctx.telegram.getChat(request.chat.id);

            if (!groupInfo.linked_chat_id) {
                log(`未发现绑定频道，跳过`);
                return;
            }

            const channelId = groupInfo.linked_chat_id;
            const { status, is_member } = await ctx.telegram.getChatMember(channelId, userId);

            if (status === 'member' || status === 'administrator' || status === 'creator' || (status === 'restricted' && is_member)) {
                await ctx.approveChatJoinRequest(userId);
                log(`已批准 ${userInfo} 的加群请求。`);
            }
            else {
                await ctx.declineChatJoinRequest(userId);
                log(`已拒绝 ${userInfo} 的加群请求。`);
            }
        }
        catch (e) {
            if (e.message.toLowerCase().includes("not found")) {
                await ctx.declineChatJoinRequest(userId);
                log(`已拒绝 ${userInfo} 的加群请求`);
            }
            else log(`获取 ${userId} (${userNick}) 信息时出错:`, e.message);
        }
    }
});

await Bot.launch();
log("启动成功");
