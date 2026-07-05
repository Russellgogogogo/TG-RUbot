/**
 * Open Wegram Bot - Core Logic
 * Shared code between Cloudflare Worker and Vercel deployments
 */
import {
  banTopic,
  checkInit,
  doCheckInit,
  fixPinMessage,
  init,
  motherBotCommands,
  parseMetaDataMessage,
  processERReceived,
  processERSent,
  processPMDeleteReceived,
  processPMDeleteSent,
  processPMEditReceived,
  processPMEditSent,
  processPMReceived,
  processPMSent,
  processTopicCommentNameEdit,
  reset,
  unbanTopic
} from './topicPmHandler.js'

export const allowed_updates = ['message', 'message_reaction', 'edited_message'];

export function validateSecretToken(token) {
  return token.length > 15 && /[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token);
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function postToTelegramApi(token, method, body) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function handleInstall(request, ownerUid, botToken, prefix, secretToken) {
  if (!validateSecretToken(secretToken)) {
    return jsonResponse({
      success: false,
      message: 'Secret token must be at least 16 characters and contain uppercase letters, lowercase letters, and numbers.'
    }, 400);
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  const webhookUrl = `${baseUrl}/${prefix}/webhook/${ownerUid}/${botToken}`;

  try {
    const response = await postToTelegramApi(botToken, 'setWebhook', {
      url: webhookUrl,
      allowed_updates: allowed_updates,
      secret_token: secretToken
    });

    const result = await response.json();
    if (result.ok) {
      return jsonResponse({ success: true, message: 'Webhook successfully installed.' });
    }

    return jsonResponse({ success: false, message: `Failed to install webhook: ${result.description}` }, 400);
  } catch (error) {
    return jsonResponse({ success: false, message: `Error installing webhook: ${error.message}` }, 500);
  }
}

export async function handleUninstall(botToken, secretToken) {
  if (!validateSecretToken(secretToken)) {
    return jsonResponse({
      success: false,
      message: 'Secret token must be at least 16 characters and contain uppercase letters, lowercase letters, and numbers.'
    }, 400);
  }

  try {
    const response = await postToTelegramApi(botToken, 'deleteWebhook', {})

    const result = await response.json();
    if (result.ok) {
      return jsonResponse({ success: true, message: 'Webhook successfully uninstalled.' });
    }

    return jsonResponse({ success: false, message: `Failed to uninstall webhook: ${result.description}` }, 400);
  } catch (error) {
    return jsonResponse({ success: false, message: `Error uninstalling webhook: ${error.message}` }, 500);
  }
}

export async function handleWebhook(request, ownerUid, botToken, secretToken, childBotUrl, childBotSecretToken) {
  if (secretToken !== request.headers.get('X-Telegram-Bot-Api-Secret-Token')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const update = await request.json();
  // --- for debugging ---
  // TODO: 2025/5/10 don't forget to close
  // await postToTelegramApi(botToken, 'sendMessage', {
  //   chat_id: ownerUid,
  //   text: `DEBUG MESSAGE! update: ${JSON.stringify(update)}`,
  // });
  // --- for debugging ---

  if (update.edited_message) {
    try {
      const messageEdited = update.edited_message
      const fromChat = messageEdited.chat;
      const fromUser = messageEdited.from;

      const check = await doCheckInit(botToken, ownerUid)
      if (!check.failed) {
        const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
        const {
          superGroupChatId,
          topicToFromChat,
          fromChatToTopic,
          bannedTopics,
          topicToCommentName,
          fromChatToCommentName
        } = parseMetaDataMessage(metaDataMessage);
        if (false) {
          // ignore message types
          return new Response('OK');
        } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
            && fromChat.is_forum) {
          // topic ER send to others.
          await processPMEditSent(botToken, messageEdited, superGroupChatId, topicToFromChat);
        } else {
          // topic ER receive from others.
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processPMEditReceived(botToken, ownerUid, messageEdited, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
          }
        }
        return new Response('OK');
      }
      return new Response('OK');
    } catch (error) {
      // --- for debugging ---
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `Error! You can send the message to developer for getting help : ${error.message} Stack: ${error.stack} origin: ${JSON.stringify(update)}`,
      });
      // --- for debugging ---
      return new Response('OK');
    }
  }

  if (update.message_reaction) {
    try {
      // message_reaction EMOJI REACT(ER)
      const messageReaction = update.message_reaction
      const fromChat = messageReaction.chat;
      const fromUser = messageReaction.user;

      const check = await doCheckInit(botToken, ownerUid)
      if (!check.failed) {
        const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
        const {
          superGroupChatId,
          topicToFromChat,
          fromChatToTopic,
          bannedTopics,
          topicToCommentName,
          fromChatToCommentName
        } = parseMetaDataMessage(metaDataMessage);
        if (false) {
          // ignore message types
          return new Response('OK');
        } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
            && fromChat.is_forum) {
          // topic ER send to others.
          await processERSent(botToken, messageReaction, topicToFromChat);
        } else {
          // topic ER receive from others.
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processERReceived(botToken, ownerUid, fromUser, messageReaction, superGroupChatId, bannedTopics);
          }
        }
        return new Response('OK');
      }
      return new Response('OK');
    } catch (error) {
      // --- for debugging ---
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `Error! You can send the message to developer for getting help : ${error.message} Stack: ${error.stack} origin: ${JSON.stringify(update)}`,
      });
      // --- for debugging ---
      return new Response('OK');
    }
  }

  if (!update.message) {
    return new Response('OK');
  }
  const message = update.message;
  const fromChat = message.chat;
  const fromUser = message.from;

  if (childBotUrl) {
    // --- delivery children bots ---
    return await motherBotCommands(botToken, ownerUid, message, childBotUrl, childBotSecretToken);
  }

  // --- commands ---
  try {
    if (fromUser.id.toString() === ownerUid && fromChat.is_forum
        && message.text?.startsWith(".!") && message.text?.endsWith("!.")) {
      if (!message.is_topic_message) {
        // --- commands in General topic ---
        if (message.text === ".!pm_RUbot_checkInit!.") {
          return await checkInit(botToken, ownerUid, message);
        } else if (message.text === ".!pm_RUbot_doInit!.") {
          return await init(botToken, ownerUid, message);
        } else if (message.text === ".!pm_RUbot_doReset!.") {
          return await reset(botToken, ownerUid, message, false);
        }
      } else {
        // --- commands in PM topic ---
        const check = await doCheckInit(botToken, ownerUid)
        if (!check.failed) {
          const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
          const {
            superGroupChatId,
            topicToFromChat,
            fromChatToTopic,
            bannedTopics,
            topicToCommentName,
            fromChatToCommentName
          } = parseMetaDataMessage(metaDataMessage);
          if (fromChat.id !== superGroupChatId) {
            await postToTelegramApi(botToken, 'sendMessage', {
              chat_id: fromChat.id,
              text: `Only can work in your PM super group`,
            });
            return new Response('OK');
          }
          if (message.text === (".!pm_RUbot_ban!.")) {
            return await banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, false);
          } else if (message.text === (".!pm_RUbot_unban!.")) {
            return await unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, false);
          } else if (message.text === (".!pm_RUbot_silent_ban!.")) {
            return await banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, true);
          } else if (message.text === (".!pm_RUbot_silent_unban!.")) {
            return await unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, true);
          }
        }
      }
      return new Response('OK');
    } else if (fromUser.id.toString() === ownerUid && fromChat.id.toString() === ownerUid
        && message.text?.startsWith(".!") && message.text?.endsWith("!.")) {
      // --- commands in Owner Chat ---
      if (message.text === ".!pm_RUbot_doReset!.") {
        return await reset(botToken, ownerUid, message, true);
      }
    }
  } catch (error) {
    // --- for debugging ---
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `Error! You can send the message to developer for getting help : ${error.message} Stack: ${error.stack} origin: ${JSON.stringify(update)}`,
    });
    // --- for debugging ---
    return new Response('OK');
  }
  // --- commands ---

  try {
    if ("/start" === message.text) {
      // Introduction words for various scenarios
      let introduction = "👋 *欢迎使用 LuDan AI 双向沟通机器人* 🤖" +
          "\n**>*💬 使用说明*" +
          "\n>请直接发送消息，客服将在工作时间为您回复。" +
          "\n>🙏 感谢您的耐心等待，我们会尽快处理您的问题。||" +
          "\n" +
          "\n👋 *Welcome to LuDan AI Two\\-Way Bot* 🤖" +
          "\n**>*💬 How to use*" +
          "\n>Just send your message and our support team will reply during working hours\\." +
          "\n>🙏 Thanks for your patience, we'll get back to you soon\\.||";
      if (fromUser.id.toString() === ownerUid) {
        // for owner only
        introduction += "\n" +
            "\n*The contents below are ONLY visible and valid for bot owner\\(YOU\\)\\.*" +
            "\n" +
            "\n**>DELETE MESSAGE:" +
            "\n>  I can delete both your messages and mine in the group since I have the necessary permissions\\." +
            "\n" +
            "\n*For Help*" +
            "\nThis bot is totally *open source* and *free* to use\\. You can mail to *vivalavida@linux\\.do* for getting help\\. " +
            "\nOr you can connect on [Linux Do](https://linux.do/t/topic/620510?u=ru_sirius)\\." +
            "\n";
        if (fromChat.is_forum && message.is_topic_message) {
          // commands in PM topic
          introduction +=
              "\n*Commands in other places:*" +
              "\nIn a personal chat with the bot:" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\nIn the general topic of the PM chat super group:" +
              "\n`.!pm_RUbot_checkInit!.`" +
              "\n`.!pm_RUbot_doInit!.`" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\n" +
              "\n*Valid commands in here:*" +
              "\n*BAN THIS TOPIC*" +
              "\n➡️`.!pm_RUbot_ban!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n**>DESCRIPTION:" +
              "\n>Block the topic where the command was sent," +
              " stop forwarding messages from the corresponding chat," +
              " and send a message to inform the other party that they have been banned\\.||" +
              "\n➡️`.!pm_RUbot_unban!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n**>DESCRIPTION:" +
              "\n>Unblock the topic where the command was sent," +
              " and send a message to inform the other party that they have been unbanned\\.||" +
              "\n➡️`.!pm_RUbot_silent_ban!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n**>DESCRIPTION:" +
              "\n>Block the topic where the command was sent\\." +
              " stop forwarding messages from the corresponding chat\\.||" +
              "\n➡️`.!pm_RUbot_silent_unban!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n**>DESCRIPTION:" +
              "\n>Unblock the topic where the command was sent\\.||";
        } else if (fromChat.is_forum) {
          // commands in General topic
          introduction +=
              "\n*Commands in other places:*" +
              "\nIn a personal chat with the bot:" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\nIn the corresponding PM chat Topic:" +
              "\n`.!pm_RUbot_ban!.`" +
              "\n`.!pm_RUbot_unban!.`" +
              "\n`.!pm_RUbot_silent_ban!.`" +
              "\n`.!pm_RUbot_silent_unban!.`" +
              "\n" +
              "\n*Valid commands in here:*" +
              "\n➡️`.!pm_RUbot_checkInit!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n>Check the initialization status, and the result reply is in the personal chat with the robot\\." +
              "\n➡️`.!pm_RUbot_doInit!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n>Perform initial settings, and the result reply is in the personal chat with the robot\\." +
              "\n➡️`.!pm_RUbot_doReset!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n>Reset the settings, and the result reply is in the personal chat with the robot\\." +
              "\n";
        } else {
          // commands in bot chat
          introduction +=
              "\n*Commands in other places:*" +
              "\nIn the general topic of the PM chat super group:" +
              "\n`.!pm_RUbot_checkInit!.`" +
              "\n`.!pm_RUbot_doInit!.`" +
              "\n`.!pm_RUbot_doReset!.`" +
              "\nIn the corresponding PM chat Topic:" +
              "\n`.!pm_RUbot_ban!.`" +
              "\n`.!pm_RUbot_unban!.`" +
              "\n`.!pm_RUbot_silent_ban!.`" +
              "\n`.!pm_RUbot_silent_unban!.`" +
              "\n " +
              "\n*Valid commands in here:*" +
              "\n➡️`.!pm_RUbot_doReset!.`⬅️" +
              "\n↗️*Press or Click to copy:*⬆️" +
              "\n>Reset the settings\\." +
              "\n";
        }
      }
      const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: fromChat.id,
        text: introduction,
        message_thread_id: message.message_thread_id,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })).json();
      if (sendMessageResp.ok) {
        await postToTelegramApi(botToken, 'setMessageReaction', {
          chat_id: fromChat.id,
          message_id: sendMessageResp.result.message_id,
          reaction: [{ type: "emoji", emoji: "🕊" }]
        });
      } else {
        // for parse_mode test
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: fromChat.id,
          message_thread_id: message.message_thread_id,
          text: `resp: ${JSON.stringify(sendMessageResp)}`,
        })
      }
      return new Response('OK');
    }


    const reply = message.reply_to_message;
    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      const metaDataMessage = check.checkMetaDataMessageResp.result.pinned_message;
      const {
        superGroupChatId,
        topicToFromChat,
        fromChatToTopic,
        bannedTopics,
        topicToCommentName,
        fromChatToCommentName
      } = parseMetaDataMessage(metaDataMessage);
      if (message.forum_topic_created || message.pinned_message) {
        // ignore message types
        return new Response('OK');
      } else if (fromUser.id.toString() === ownerUid && fromChat.id === superGroupChatId
          && fromChat.is_forum && message.is_topic_message) {
        // send message in super group
        if (message.forum_topic_edited?.name) {
          // comment name for topic
          await processTopicCommentNameEdit(
              botToken,
              ownerUid,
              message.message_thread_id,
              topicToFromChat.get(message.message_thread_id),
              message.forum_topic_edited?.name,
              metaDataMessage);
        } else if (message.text === "#del" && reply?.message_id && reply?.from.id === fromUser.id && reply?.message_id !== message.message_thread_id) {
          // delete message
          await processPMDeleteSent(botToken, message, reply, superGroupChatId, topicToFromChat);
        } else {
          // topic PM send to others
          await processPMSent(botToken, message, topicToFromChat);
        }
      } else {
        // send message to bot via chat
        if (message.forum_topic_edited?.name) {
        } else if (message.text === "#fixpin" && reply?.message_id && fromUser.id.toString() === ownerUid) {
          // fix pined message
          await fixPinMessage(botToken, message.chat.id, reply.text, reply.message_id);
        } else if (message.text === "#del" && reply?.message_id && reply?.from.id === fromUser.id) {
          // delete message
          if (!bannedTopics.includes(fromChatToTopic.get(fromChat.id))) {
            await processPMDeleteReceived(botToken, ownerUid, message, reply, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage);
          }
        } else {
          // topic PM receive from others. Always receive first.
          await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName);
        }
      }
      return new Response('OK');
    }

    if (reply && fromChat.id.toString() === ownerUid) {
      if (message.text === "#fixpin" && reply?.message_id && fromUser.id.toString() === ownerUid) {
        // fix pined message
        await fixPinMessage(botToken, message.chat.id, reply.text, reply.message_id);
        return new Response('OK');
      }

      const rm = reply.reply_markup;
      if (rm && rm.inline_keyboard && rm.inline_keyboard.length > 0) {
        let senderUid = rm.inline_keyboard[0][0].callback_data;
        if (!senderUid) {
          senderUid = rm.inline_keyboard[0][0].url.split('tg://user?id=')[1];
        }

        await postToTelegramApi(botToken, 'copyMessage', {
          chat_id: parseInt(senderUid),
          from_chat_id: fromChat.id,
          message_id: message.message_id
        });
      }

      return new Response('OK');
    }

    const sender = fromChat;
    const senderUid = sender.id.toString();
    const senderName = sender.username ? `@${sender.username}` : [sender.first_name, sender.last_name].filter(Boolean).join(' ');

    const copyMessage = async function (withUrl = false) {
      const ik = [[{
        text: `🔏 From: ${senderName} (${senderUid})`,
        callback_data: senderUid,
      }]];

      if (withUrl) {
        ik[0][0].text = `🔓 From: ${senderName} (${senderUid})`
        ik[0][0].url = `tg://user?id=${senderUid}`;
      }

      return await postToTelegramApi(botToken, 'copyMessage', {
        chat_id: parseInt(ownerUid),
        from_chat_id: fromChat.id,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: ik }
      });
    }

    const response = await copyMessage(true);
    if (!response.ok) {
      await copyMessage();
    }

    return new Response('OK');
  } catch (error) {
    // --- for debugging ---
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `Error! You can send the message to developer for getting help : ${error.message} Stack: ${error.stack} origin: ${JSON.stringify(update)}`,
    });
    // --- for debugging ---
    return new Response('OK');
  }
}

export async function handleRequest(request, config) {
  const { prefix, secretToken, childBotUrl, childBotSecretToken } = config;

  const url = new URL(request.url);
  const path = url.pathname;

  const INSTALL_PATTERN = new RegExp(`^/${prefix}/install/([^/]+)/([^/]+)$`);
  const UNINSTALL_PATTERN = new RegExp(`^/${prefix}/uninstall/([^/]+)$`);
  const WEBHOOK_PATTERN = new RegExp(`^/${prefix}/webhook/([^/]+)/([^/]+)$`);

  let match;

  if (match = path.match(INSTALL_PATTERN)) {
    return handleInstall(request, match[1], match[2], prefix, secretToken);
  }

  if (match = path.match(UNINSTALL_PATTERN)) {
    return handleUninstall(match[1], secretToken);
  }

  if (match = path.match(WEBHOOK_PATTERN)) {
    return handleWebhook(request, match[1], match[2], secretToken, childBotUrl, childBotSecretToken);
  }

  return new Response('Not Found', { status: 404 });
}
