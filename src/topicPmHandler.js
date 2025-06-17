import { allowed_updates, postToTelegramApi } from './core';

// ---------------------------------------- MOTHER BOT ----------------------------------------

export async function motherBotCommands(botToken, ownerUid, message, childBotUrl, childBotSecretToken) {
  const sendRespMessage = async function (chat_id, text) {
    return await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: chat_id,
      text: text,
    });
  }

  try {
    if (message.text.startsWith("/install ")) {
      const childBotOwnerId = message.from.id.toString();
      const childBotToken = message.text.split("/install ")[1];
      const setWebhookResp = await (await postToTelegramApi(childBotToken, 'setWebhook', {
        url: `${childBotUrl.endsWith('/') ? childBotUrl.slice(0, -1) : childBotUrl}/webhook/${childBotOwnerId}/${childBotToken}`,
        allowed_updates: allowed_updates,
        secret_token: childBotSecretToken
      })).json();
      if (setWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} install failed! ${JSON.stringify(setWebhookResp)}`);
      }
    } else if (message.text.startsWith("/uninstall ")) {
      const childBotToken = message.text.split("/uninstall ")[1];
      const deleteWebhookResp = await (await postToTelegramApi(childBotToken, 'deleteWebhook', {})).json();
      if (deleteWebhookResp.ok) {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall success!`);
      } else {
        await sendRespMessage(message.chat.id, `bot ${childBotToken} uninstall failed! ${JSON.stringify(deleteWebhookResp)}`);
      }
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: message.chat.id,
        text: `Has no this command! Try '/install {{botToken}}' OR '/uninstall {{botToken}}'`,
      });
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- SETTINGS ----------------------------------------

export async function init(botToken, ownerUid, message) {
  try {
    const supergroupId = message.chat.id;
    const metaDataMessage = supergroupId.toString();

    let failed = false;
    let failedMessage = "init failed, please try again";
    let sendMetaDataMessageResp;
    let pinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "already init!",
      });
      return new Response('OK');
    }

    sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: metaDataMessage,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: ownerUid,
        message_id: sendMetaDataMessageResp.result.message_id,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
    return checkInit(botToken, ownerUid, message, failed, failedMessage);
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function checkInit(botToken, ownerUid, message, failed, failedMessage) {
  try {
    const supergroupId = message.chat.id;

    failed = failed || false;
    failedMessage = failedMessage || "init check failed, please do init or try again";
    let checkMetaDataMessageResp;
    if (!failed) {
      const doCheckInitRet = await doCheckInit(botToken, ownerUid, failedMessage, failed);
      checkMetaDataMessageResp = doCheckInitRet.checkMetaDataMessageResp;
      failedMessage = doCheckInitRet.failedMessage;
      failed = doCheckInitRet.failed;
    }
    if (failed) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `GROUP ${supergroupId}: ${failedMessage}`,
      });
    } else {
      const { superGroupChatId: superGroupIdFromMetaDataMessage }
          = parseMetaDataMessage(checkMetaDataMessageResp.result.pinned_message);
      if (superGroupIdFromMetaDataMessage !== supergroupId) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init failed! Cause already init GROUP ${superGroupIdFromMetaDataMessage}`,
        });
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `GROUP ${supergroupId}: init success!`,
        });
      }
    }
    return new Response('OK');
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

export async function doCheckInit(botToken, ownerUid, failedMessage, failed) {
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: ownerUid,
  })).json();

  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  } else {
    const dateSecondTimestamp = checkMetaDataMessageResp.result.pinned_message?.date;
    if (dateSecondTimestamp) {
      const pinnedMessage = checkMetaDataMessageResp.result.pinned_message;
      const currentSeconds = Math.floor(Date.now() / 1000);
      const dateDiff = currentSeconds - dateSecondTimestamp;
      const days = Math.floor(dateDiff / 60 / 60 / 24);
      if (days > 7) {
        await fixPinMessage(botToken, pinnedMessage.chat.id, pinnedMessage.text, pinnedMessage.message_id)

        const pmGroupId = pinnedMessage.text.split(";")[0];
        const pmGroupChatResp = await (await postToTelegramApi(botToken, 'getChat', {
          chat_id: pmGroupId,
        })).json();
        if (pmGroupChatResp.ok && pmGroupChatResp.result.pinned_message?.text) {
          const pmGroupPinnedMessage = pmGroupChatResp.result.pinned_message;
          await fixPinMessage(botToken, pmGroupPinnedMessage.chat.id, pmGroupPinnedMessage.text, pmGroupPinnedMessage.message_id)
        }
      }
    }
  }
  return { checkMetaDataMessageResp, failedMessage, failed };
}

export function parseMetaDataMessage(metaDataMessage) {
  const metaDataSplit = metaDataMessage.text.split(";");
  const superGroupChatId = parseInt(metaDataSplit[0]);
  const topicToFromChat = new Map;
  const fromChatToTopic = new Map;
  const topicToCommentName = new Map;
  const fromChatToCommentName = new Map;
  const bannedTopics = [];
  if (metaDataSplit.length > 1) {
    for (let i = 1; i < metaDataSplit.length; i++) {
      const topicToFromChatSplit = metaDataSplit[i].split(":");
      const topic = parseInt(topicToFromChatSplit[0]);
      if (!topic) continue
      let fromChat;
      if (topicToFromChatSplit[1].startsWith('b')) {
        bannedTopics.push(topic);
        fromChat = parseInt(topicToFromChatSplit[1].substring(1));
      } else {
        fromChat = parseInt(topicToFromChatSplit[1]);
      }
      topicToFromChat.set(topic, fromChat);
      fromChatToTopic.set(fromChat, topic);
      if (topicToFromChatSplit[2]) {
        topicToCommentName.set(topic, topicToFromChatSplit[2]);
        fromChatToCommentName.set(fromChat, topicToFromChatSplit[2]);
      }
    }
  }
  return { superGroupChatId, topicToFromChat, fromChatToTopic, bannedTopics, topicToCommentName, fromChatToCommentName };
}

async function addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId) {
  const newText = `${metaDataMessage.text};${topicId}:${fromChatId}`
  return await editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText);
}

async function cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId) {
  const oldText = metaDataMessage.text;
  let itemStartIndex = oldText.indexOf(`;${topicId}:`) + 1;
  if (itemStartIndex === 0) return { messageText: oldText };
  let itemEndIndex = oldText.indexOf(';', itemStartIndex);
  let newText = itemEndIndex === -1 ? oldText.substring(0, itemStartIndex - 1)
      : oldText.replace(oldText.substring(itemStartIndex, itemEndIndex + 1), '');
  return await editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText);
}

async function editMetaDataMessage(botToken, ownerUid, metaDataMessage, newText) {
  // TODO: 2025/5/10 MAX LENGTH 4096
  const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  })).json();
  if (!editMessageTextResp.ok) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `editMetaDataMessage: editMessageTextResp: ${JSON.stringify(editMessageTextResp)}`,
    });
  }
  metaDataMessage.text = editMessageTextResp.result.text;
  return { messageText: editMessageTextResp.result.text };
}

async function banTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId) {
  const oldText = metaDataMessage.text;
  if (oldText.includes(`;${topicId}:b`)) {
    return { isBannedBefore: true, messageText: oldText };
  }
  const newText = oldText.replace(`;${topicId}:`, `;${topicId}:b`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { isBannedBefore: false, messageText: newText };
}

async function unbanTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId) {
  const oldText = metaDataMessage.text;
  if (!oldText.includes(`;${topicId}:b`)) {
    return { isNotBannedBefore: true, messageText: oldText };
  }
  const newText = oldText.replace(`;${topicId}:b`, `;${topicId}:`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
  return { isNotBannedBefore: false, messageText: newText };
}

export async function reset(botToken, ownerUid, message, inOwnerChat) {
  try {
    const supergroupId = message.chat.id;

    let unpinMetaDataMessageResp;

    const check = await doCheckInit(botToken, ownerUid)
    if (!check.failed) {
      const { superGroupChatId: superGroupChatIdFromMetaData }
          = parseMetaDataMessage(check.checkMetaDataMessageResp.result.pinned_message)
      if (inOwnerChat || superGroupChatIdFromMetaData === supergroupId) {
        unpinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'unpinAllChatMessages', {
          chat_id: ownerUid,
        })).json();
        if (!unpinMetaDataMessageResp.ok) {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `Reset failed!`,
          });
        } else {
          await postToTelegramApi(botToken, 'sendMessage', {
            chat_id: ownerUid,
            text: `Reset success!`,
          });
        }
      } else {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `Can't reset from group isn't current using!`,
        });
      }
      return new Response('OK');
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: "not init yet!",
      });
      return new Response('OK');
    }
  } catch (error) {
    console.error('Error handling webhook:', error.message);
    // // --- for debugging ---
    // await postToTelegramApi(botToken, 'sendMessage', {
    //     chat_id: ownerUid,
    //     text: `Error handling webhook: ${error.message}`,
    // });
    // // --- for debugging ---
    return new Response('OK');
  }
}

// ---------------------------------------- PRIVATE MESSAGE ----------------------------------------

function parseMdReserveWord(str) {
  return str
      .replaceAll("_", "\\_")
      .replaceAll("*", "\\*")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)")
      .replaceAll("~", "\\~")
      .replaceAll("`", "\\`")
      .replaceAll(">", "\\>")
      .replaceAll("#", "\\#")
      .replaceAll("+", "\\+")
      .replaceAll("-", "\\-")
      .replaceAll("=", "\\=")
      .replaceAll("|", "\\|")
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}")
      .replaceAll(".", "\\.")
      .replaceAll("!", "\\!");
}

export async function processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName) {
  const fromChat = message.chat;
  const fromChatId = fromChat.id;
  const pmMessageId = message.message_id;
  let topicId = fromChatToTopic.get(fromChatId);
  let isNewTopic = false;
  let commentName = fromChatToCommentName.get(fromChatId) ?
      `${fromChatToCommentName.get(fromChatId)} | ` : '';
  const maxTopicNameLen = 127;
  const maxFromChatNameLen = maxTopicNameLen - (commentName.length + `${fromChatId}`.length + 6);
  const maxCommentNameLen = maxTopicNameLen - (`${fromChatId}`.length + 6);
  commentName = commentName.substring(0, maxCommentNameLen);
  let fromChatName = fromChat.username ?
      `@${fromChat.username}` : [fromChat.first_name, fromChat.last_name].filter(Boolean).join(' ');
  fromChatName = fromChatName.substring(0, maxFromChatNameLen);
  fromChatName = fromChatName.replace(/\|/g, '｜');

  const lengthCheckDo = function (topicName, newTopicName) {
    if (topicName.length > 128) {
      return newTopicName;
    } else {
      return topicName;
    }
  }
  let topicName = `${commentName}${fromChatName} ${fromChatId === message.from.id ? `(${fromChatId})` : `(${fromChatId})(${message.from.id})`}`;
  topicName = lengthCheckDo(topicName, `${commentName}${fromChatName} (${fromChatId})`);
  topicName = lengthCheckDo(topicName, `${commentName} (${fromChatId})`);
  topicName = lengthCheckDo(topicName, `(${fromChatId})`.substring(0, maxTopicNameLen));

  if (!topicId) {
    const createTopicResp = await (await postToTelegramApi(botToken, 'createForumTopic', {
      chat_id: superGroupChatId,
      name: topicName,
    })).json();
    topicId = createTopicResp.result?.message_thread_id
    if (!createTopicResp.ok || !topicId) {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `DEBUG MESSAGE! chatId: ${superGroupChatId} topicName: ${topicName} createTopicResp: ${JSON.stringify(createTopicResp)}`,
      });
      return;
    }
    await addTopicToFromChatOnMetaData(botToken, metaDataMessage, ownerUid, topicId, fromChatId);
    isNewTopic = true;
  }

  const isTopicExists = await (async function () {
    const reopenForumTopicResp = await (await postToTelegramApi(botToken, 'editForumTopic', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      name: topicName,
    })).json();
    return reopenForumTopicResp.ok || !reopenForumTopicResp.description.includes("TOPIC_ID_INVALID");
  })()

  // topic has been banned
  if (bannedTopics.includes(topicId) && isTopicExists) {
    return { success: false }
  }

  if (!isTopicExists) {
    // clean metadata message
    await cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId);
    fromChatToTopic.delete(fromChatId)
    // resend the message
    return await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  }

  // forwardMessage to topic
  const forwardMessageResp = await (await postToTelegramApi(botToken, 'forwardMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    from_chat_id: fromChatId,
    message_id: pmMessageId,
  })).json();

  if (forwardMessageResp.ok) {
    const topicMessageId = forwardMessageResp.result.message_id;

    // replay
    const replayPmMsgId = message.reply_to_message?.message_id
    if (replayPmMsgId) {
      const checkMessageConnectionMetaDataResp =
          await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
              `Can't find ORIGIN message for message EDITING.`, ownerUid);
      let replayedMessageId;
      const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
      if (messageConnectionTextSplit) {
        for (let i = 0; i < messageConnectionTextSplit.length; i++) {
          const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
          if (replayPmMsgId === parseInt(messageConnectionTextSplitSplit[1])) {
            const topicMessageMetaData = messageConnectionTextSplitSplit[0];
            const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
            replayedMessageId = parseInt(topicMessageMetaDataSplit[1]);
            break;
          }
        }
      }

      let newMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
      if (superGroupChatId.toString().startsWith("-100")) {
        newMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`;
      }
      let text = `*⬆️⬆️⬆️[REPLAY](${newMessageLink})⬆️⬆️⬆️*`;
      const sendReplayMessageBody = {
        chat_id: superGroupChatId,
        message_thread_id: topicId,
        text: text,
        parse_mode: "MarkdownV2"
      };
      let sendMessageResp;
      if (replayedMessageId) {
        sendReplayMessageBody.reply_parameters = {
          message_id: replayedMessageId,
          chat_id: superGroupChatId
        }
        sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', sendReplayMessageBody)).json();
      }
      if (!sendMessageResp || !sendMessageResp?.ok) {
        delete sendReplayMessageBody.reply_parameters;
        sendReplayMessageBody.text = `*⬆️⬆️⬆️[REPLAY](${newMessageLink})⬇️⬇️⬇️*`;
        if (message.reply_to_message.text) {
          sendReplayMessageBody.text += `\n\`\`\`\n`;
          sendReplayMessageBody.text += message.reply_to_message.text
              .substring(0, 128)
              .replace(/`/g, '\\`');
          sendReplayMessageBody.text += `\n\`\`\``;
        } else {
          sendReplayMessageBody.text += `\n*❎❎❎UNKNOWN❎❎❎*`;
        }
        await postToTelegramApi(botToken, 'sendMessage', sendReplayMessageBody)
      }
    }

    if (isNewTopic) {
      // send PM to bot owner for the bad notification on super group for first message
      let messageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
      if (superGroupChatId.toString().startsWith("-100")) {
        messageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`
      }
      const parsedFromChatName = parseMdReserveWord(fromChatName)
      const text = `${messageLink
          ? `New PM chat from ${parsedFromChatName}` +
          `\n[Click the to view it in your SUPERGROUP](${messageLink})`
          : `New PM chat from ${parsedFromChatName}` +
          `\nGo view it in your SUPERGROUP`}`
      const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: text,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })).json();
      if (!sendMessageResp.ok) {
        await postToTelegramApi(botToken, 'sendMessage', {
          chat_id: ownerUid,
          text: `New PM chat notify error, text: ${text} resp: ${JSON.stringify(sendMessageResp)}`,
        })
      }
    }
    // save messageId connection to superGroupChat pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: fromChatId,
      message_id: pmMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
    return {
      success: true,
      targetChatId: superGroupChatId,
      targetTopicId: topicId,
      originChatId: fromChatId,
      originMessageId: pmMessageId,
      newMessageId: topicMessageId
    }
  } else if (forwardMessageResp.description.includes('message thread not found')) {
    // clean metadata message
    await cleanItemOnMetaData(botToken, metaDataMessage, ownerUid, topicId);
    fromChatToTopic.delete(fromChatId)
    // resend the message
    return await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  }
  return { success: false }
}

export async function processPMSent(botToken, message, topicToFromChat, noReplay) {
  const ownerUid = message.from.id;
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;
  const topicMessageId = message.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id)

  // replay
  let replayPmMessageId;
  let replayText;
  if (!noReplay && message.reply_to_message && message.reply_to_message?.message_id !== topicId) {
    replayText = message.reply_to_message?.text;
    const checkMessageConnectionMetaDataResp =
        await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
            `Can't find TARGET message for sending message REPLAY.`, ownerUid);
    if (!checkMessageConnectionMetaDataResp.failed) {
      const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
      for (let i = 0; i < messageConnectionTextSplit.length; i++) {
        const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
        const topicMessageMetaData = messageConnectionTextSplitSplit[0];
        const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
        if (message.reply_to_message?.message_id === parseInt(topicMessageMetaDataSplit[1])) {
          replayPmMessageId = messageConnectionTextSplitSplit[1];
          break;
        }
      }
    }
  }

  const copyMessageBody = {
    chat_id: pmChatId,
    from_chat_id: superGroupChatId,
    message_id: topicMessageId
  };
  if (replayPmMessageId) {
    copyMessageBody.reply_parameters = {
      message_id: replayPmMessageId,
      chat_id: pmChatId
    }
  }
  const copyMessageResp = await (await postToTelegramApi(botToken, 'copyMessage', copyMessageBody)).json();
  if (copyMessageResp.ok) {
    const pmMessageId = copyMessageResp.result.message_id
    // save messageId connection to group pin message
    await saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid);
    // send replay message
    if (!replayPmMessageId && replayText) {
      const replayTextLines = replayText.split('\n');
      let sendReplayText = `⬆️⬆️⬆️REPLAY⬇️⬇️⬇️`;
      for (const replayTextLine of replayTextLines) {
        sendReplayText += `\n>${parseMdReserveWord(replayTextLine)}`;
      }
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: pmChatId,
        text: sendReplayText,
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      })
    }
    // notify sending status by MessageReaction
    await postToTelegramApi(botToken, 'setMessageReaction', {
      chat_id: superGroupChatId,
      message_id: topicMessageId,
      reaction: [{ type: "emoji", emoji: "🕊" }]
    });
  } else if (copyMessageResp.description.includes("message to be replied not found") || copyMessageResp.description.includes("repl")) {
    await processPMSent(botToken, message, topicToFromChat, true);
  } else {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `SEND MESSAGE ERROR! copyMessageResp: ${JSON.stringify(copyMessageResp)} message: ${JSON.stringify(message)}`,
    });
  }
}

// ---------------------------------------- MESSAGE CONNECTION ----------------------------------------

async function checkMessageConnectionMetaData(botToken, superGroupChatId, failedMessage, failed) {
  let metaDataMessageId;
  let metaDataMessageText;
  let metaDataMessage;
  failedMessage = failedMessage || '';
  failed = failed || false;
  const checkMetaDataMessageResp = await (await postToTelegramApi(botToken, 'getChat', {
    chat_id: superGroupChatId,
  })).json();
  if (!checkMetaDataMessageResp.ok || !checkMetaDataMessageResp.result.pinned_message?.text) {
    failedMessage += " checkMetaDataMessageResp: " + JSON.stringify(checkMetaDataMessageResp);
    failed = true;
  } else {
    metaDataMessage = checkMetaDataMessageResp.result.pinned_message;
    metaDataMessageId = checkMetaDataMessageResp.result.pinned_message.message_id;
    metaDataMessageText = checkMetaDataMessageResp.result.pinned_message.text;
  }
  return { failedMessage, failed, metaDataMessageId, metaDataMessageText, metaDataMessage };
}

async function checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, failedMessage, failedMessageChatId) {
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage);
  if (checkMessageConnectionMetaDataResp.failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: failedMessageChatId,
      text: failedMessage,
    });
  }
  return checkMessageConnectionMetaDataResp;
}

async function saveMessageConnection(botToken, superGroupChatId, topicId, topicMessageId, pmMessageId, ownerUid) {
  let failed = false;
  let failedMessage = "Chat message connect failed, can't do emoji react, edit, delete.";
  const checkMessageConnectionMetaDataResp = await checkMessageConnectionMetaData(
      botToken, superGroupChatId, failedMessage, failed);
  failedMessage = checkMessageConnectionMetaDataResp.failedMessage;
  failed = checkMessageConnectionMetaDataResp.failed;
  let metaDataMessageId = checkMessageConnectionMetaDataResp.metaDataMessageId;
  let metaDataMessageText = checkMessageConnectionMetaDataResp.metaDataMessageText;
  if (failed) {
    // new message connection in superGroupChat pinned message
    failed = false;
    metaDataMessageText = `${topicId}-${topicMessageId}:${pmMessageId}`;
    const sendMetaDataMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      text: metaDataMessageText,
    })).json();
    if (!sendMetaDataMessageResp.ok) {
      failedMessage += " sendMetaDataMessageResp: " + JSON.stringify(sendMetaDataMessageResp);
      failed = true;
    }
    if (!failed) {
      metaDataMessageId = sendMetaDataMessageResp.result.message_id;
      const pinMetaDataMessageResp = await (await postToTelegramApi(botToken, 'pinChatMessage', {
        chat_id: superGroupChatId,
        message_id: metaDataMessageId,
      })).json();
      if (!pinMetaDataMessageResp.ok) {
        failedMessage += " pinMetaDataMessageResp: " + JSON.stringify(pinMetaDataMessageResp);
        failed = true;
      }
    }
  } else {
    // add message connection in superGroupChat pinned message
    metaDataMessageText = `${metaDataMessageText};${topicId}-${topicMessageId}:${pmMessageId}`;
    // text message max length 4096
    const processForTextMessageMaxLength = function (text, process) {
      if (text.length > 4096) {
        text = process(text);
        text = processForTextMessageMaxLength(text, process);
      }
      return text;
    }
    metaDataMessageText = processForTextMessageMaxLength(
        metaDataMessageText, (metaDataMessageText) => metaDataMessageText.split(';').slice(1).join(';'));
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: superGroupChatId,
      message_id: metaDataMessageId,
      text: metaDataMessageText,
    })).json();
    if (!editMessageTextResp.ok) {
      failedMessage += " editMessageTextResp: " + JSON.stringify(editMessageTextResp);
      failed = true;
    }
  }
  if (failed) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: ownerUid,
      text: `GROUP ${superGroupChatId} MESSAGE ${topicId}-${topicMessageId}:${pmMessageId}: ${failedMessage}`,
    });
  }
}

// ---------------------------------------- EMOJI REACTION ----------------------------------------

export async function processERReceived(botToken, ownerUid, fromUser, messageReaction, superGroupChatId, bannedTopics) {
  const pmMessageId = messageReaction.message_id;
  let topicId;
  let topicMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "Can't sent EMOJI REACTION.", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    if (pmMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
      const topicMessageMetaData = messageConnectionTextSplitSplit[0];
      const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
      topicId = parseInt(topicMessageMetaDataSplit[0]);
      topicMessageId = parseInt(topicMessageMetaDataSplit[1]);
      break;
    }
  }

  if (bannedTopics.includes(topicId)) return;

  if (!topicMessageId) {
    return;
  }

  if (reaction.length === 0 && fromUser.id === ownerUid) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, superGroupChatId, topicMessageId, reaction, ownerUid);
}

export async function processERSent(botToken, messageReaction, topicToFromChat) {
  const ownerUid = messageReaction.user.id;
  const superGroupChatId = messageReaction.chat.id;
  let topicId;
  const topicMessageId = messageReaction.message_id;
  let pmChatId;
  let pmMessageId;
  let reaction = messageReaction.new_reaction;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId, "Can't sent EMOJI REACTION.", ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (topicMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      topicId = topicMessageMetaDataSplit[0];
      pmMessageId = messageConnectionTextSplitSplit[1];
      pmChatId = topicToFromChat.get(parseInt(topicId));
      break;
    }
  }

  if (!pmMessageId) {
    return;
  }

  // TODO: 2025/5/10 if react on owner's message, there's no need for a 🕊
  if (reaction.length === 0) {
    reaction = [
      {
        "type": "emoji",
        "emoji": "🕊"
      }
    ]
  }

  await sendEmojiReaction(botToken, pmChatId, pmMessageId, reaction, ownerUid);
}

async function sendEmojiReaction(botToken, targetChatId, targetMessageId, reaction, ownerUid) {
  const setMessageReactionResp = await (await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: targetChatId,
    message_id: targetMessageId,
    reaction: reaction
  })).json();
  if (!setMessageReactionResp.ok) {
    if (setMessageReactionResp.description.includes('REACTIONS_TOO_MANY')) {
      await postToTelegramApi(botToken, 'setMessageReaction', {
        chat_id: targetChatId,
        message_id: targetMessageId,
        reaction: reaction.slice(-1)
      });
    } else if (setMessageReactionResp.description.includes('REACTION_INVALID')) {
    } else {
      // --- for debugging ---
      // await postToTelegramApi(botToken, 'sendMessage', {
      //   chat_id: ownerUid,
      //   text: `setMessageReactionResp : ${JSON.stringify(setMessageReactionResp)}`,
      // });
      // --- for debugging ---
    }
  }
}

// ---------------------------------------- EDIT MESSAGE ----------------------------------------

export async function processPMEditReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName) {
  const { success: isForwardSuccess, targetChatId, targetTopicId, originChatId, originMessageId, newMessageId } =
      await processPMReceived(botToken, ownerUid, message, superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage, fromChatToCommentName)
  if (isForwardSuccess) {
    const checkMessageConnectionMetaDataResp =
        await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
            `Can't find ORIGIN message for message EDITING.`, ownerUid);

    let newMessageLink = `https://t.me/c/${targetChatId}/${targetTopicId}/${newMessageId}`;
    if (targetChatId.toString().startsWith("-100")) {
      newMessageLink = `https://t.me/c/${targetChatId.toString().substring(4)}/${targetTopicId}/${newMessageId}`;
    }

    let oldMessageId;
    let oldMessageLink;
    const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
    if (messageConnectionTextSplit) {
      for (let i = 0; i < messageConnectionTextSplit.length; i++) {
        const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
        if (originMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
          const topicMessageMetaData = messageConnectionTextSplitSplit[0];
          const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
          oldMessageId = parseInt(topicMessageMetaDataSplit[1]);
          break;
        }
      }
      oldMessageLink = oldMessageId ? `https://t.me/c/${targetChatId}/${targetTopicId}/${oldMessageId}` : '';
      if (oldMessageId && targetChatId.toString().startsWith("-100")) {
        oldMessageLink = `https://t.me/c/${targetChatId.toString().substring(4)}/${targetTopicId}/${oldMessageId}`;
      }
    }

    let text = `⬆️⬆️⬆️⬆️⬆️⬆️`;
    if (oldMessageLink) {
      text += `\n*[Message](${newMessageLink}) edited from [MESSAGE](${oldMessageLink})*`;
    } else {
      text += `\n*[Message](${newMessageLink}) edited from unknown*`;
    }
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: targetChatId,
      message_thread_id: targetTopicId,
      text: text,
      parse_mode: "MarkdownV2",
    });
    await notifyMessageEditForward(botToken, originChatId, originMessageId);
  }
}

export async function processPMEditSent(botToken, message, superGroupChatId, topicToFromChat) {
  const ownerUid = message.from.id;
  const topicId = message.message_thread_id;
  const topicMessageId = message.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id);
  let pmMessageId;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `Can't find TARGET message for sending message editing.`, ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (topicMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      pmMessageId = messageConnectionTextSplitSplit[1];
      break;
    }
  }

  let oldMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${topicMessageId}`;
  if (superGroupChatId.toString().startsWith("-100")) {
    oldMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${topicMessageId}`;
  }
  if (!pmMessageId) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `Can't find TARGET message for sending [message](${oldMessageLink}) EDITING\\.`,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (message.text) {
    const editMessageTextResp = await (await postToTelegramApi(botToken, 'editMessageText', {
      chat_id: pmChatId,
      message_id: pmMessageId,
      text: message.text,
      parse_mode: message.parse_mode,
      entities: message.entities,
    })).json();
    if (editMessageTextResp.ok) {
      // notify sending status by MessageReaction
      await notifyMessageEditForward(botToken, superGroupChatId, topicMessageId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: ownerUid,
        text: `SEND EDITED MESSAGE ERROR! editMessageTextResp: ${JSON.stringify(editMessageTextResp)} message: ${JSON.stringify(message)}.` +
            `\nYou can send this to developer for getting help, or just delete this message.`,
      });
    }
  } else if (false) {
    // TODO: 2025/5/10 editMessageCaption
  } else if (false) {
    // TODO: 2025/5/10 editMessageMedia
  } else if (false) {
    // TODO: 2025/5/10 editMessageLiveLocation
  } else if (false) {
    // TODO: 2025/5/10 stopMessageLiveLocation
  }
}

async function notifyMessageEditForward(botToken, fromChatId, fromMessageId) {
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: fromMessageId,
    reaction: [{ type: "emoji", emoji: "🦄" }]
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: fromMessageId,
    reaction: [{ type: "emoji", emoji: "🕊" }]
  });
}

// ---------------------------------------- DELETE MESSAGE ----------------------------------------

export async function processPMDeleteReceived(botToken, ownerUid, message, reply,
                                              superGroupChatId, fromChatToTopic, bannedTopics, metaDataMessage) {
  const commandMessageId = message.message_id;
  const targetChatId = superGroupChatId;
  const originMessageId = reply.message_id;
  const fromChat = message.chat;
  const fromChatId = fromChat.id;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `Can't find ORIGIN message for message DELETING.`, ownerUid);

  let targetMessageId;
  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText?.split(';');
  if (messageConnectionTextSplit) {
    for (let i = 0; i < messageConnectionTextSplit.length; i++) {
      const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
      if (originMessageId === parseInt(messageConnectionTextSplitSplit[1])) {
        const topicMessageMetaData = messageConnectionTextSplitSplit[0];
        const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
        targetMessageId = parseInt(topicMessageMetaDataSplit[1]);
        break;
      }
    }
  }

  if (message.text) {
    const deleteMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
      chat_id: targetChatId,
      message_id: targetMessageId,
    })).json();
    if (deleteMessageResp.ok) {
      await notifyMessageDeleteForward(botToken, fromChatId, originMessageId, commandMessageId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: fromChatId,
        text: `SEND DELETING MESSAGE ERROR! deleteMessageResp: ${JSON.stringify(deleteMessageResp)} message: ${JSON.stringify(message)}.` +
            `\nYou can send this to developer for getting help, or just delete this message.`,
      });
    }
  }
}

export async function processPMDeleteSent(botToken, message, reply, superGroupChatId, topicToFromChat) {
  const ownerUid = message.from.id;
  const commandMessageId = message.message_id;
  const topicId = message.message_thread_id;
  const deleteOriginMessageId = reply.message_id;
  const pmChatId = topicToFromChat.get(message.message_thread_id);
  let deleteTargetMessageId;

  const checkMessageConnectionMetaDataResp =
      await checkMessageConnectionMetaDataForAction(botToken, superGroupChatId,
          `Can't find TARGET message for sending message DELETING.`, ownerUid);
  if (checkMessageConnectionMetaDataResp.failed) return;

  const messageConnectionTextSplit = checkMessageConnectionMetaDataResp.metaDataMessageText.split(';').reverse();
  for (let i = 0; i < messageConnectionTextSplit.length; i++) {
    const messageConnectionTextSplitSplit = messageConnectionTextSplit[i].split(':');
    const topicMessageMetaData = messageConnectionTextSplitSplit[0];
    const topicMessageMetaDataSplit = topicMessageMetaData.split('-');
    if (deleteOriginMessageId === parseInt(topicMessageMetaDataSplit[1])) {
      deleteTargetMessageId = messageConnectionTextSplitSplit[1];
      break;
    }
  }

  let originMessageLink = `https://t.me/c/${superGroupChatId}/${topicId}/${deleteOriginMessageId}`;
  if (superGroupChatId.toString().startsWith("-100")) {
    originMessageLink = `https://t.me/c/${superGroupChatId.toString().substring(4)}/${topicId}/${deleteOriginMessageId}`;
  }
  if (!deleteTargetMessageId) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `Can't find TARGET message for sending [message](${originMessageLink}) DELETING\\.`,
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (message.text) {
    const deleteMessageResp = await (await postToTelegramApi(botToken, 'deleteMessage', {
      chat_id: pmChatId,
      message_id: deleteTargetMessageId,
    })).json();
    if (deleteMessageResp.ok) {
      await notifyMessageDeleteForward(botToken, superGroupChatId, deleteOriginMessageId, commandMessageId, topicId);
    } else {
      await postToTelegramApi(botToken, 'sendMessage', {
        chat_id: superGroupChatId,
        message_thread_id: topicId,
        text: `SEND DELETING MESSAGE ERROR! deleteMessageResp: ${JSON.stringify(deleteMessageResp)} message: ${JSON.stringify(message)}.` +
            `\nYou can send this to developer for getting help, or just delete this message.`,
      });
    }
  }
}

async function notifyMessageDeleteForward(botToken, fromChatId, fromMessageId, commandMessageId, fromTopicId) {
  await postToTelegramApi(botToken, 'setMessageReaction', {
    chat_id: fromChatId,
    message_id: commandMessageId,
    reaction: [{ type: "emoji", emoji: "🗿" }]
  });
  if (fromTopicId) {
    let originMessageLink = `https://t.me/c/${fromChatId}/${fromTopicId ? `${fromTopicId}/` : ''}${fromMessageId}`;
    if (fromChatId.toString().startsWith("-100")) {
      originMessageLink = `https://t.me/c/${fromChatId.toString().substring(4)}/${fromTopicId ? `${fromTopicId}/` : ''}${fromMessageId}`;
    }
    let commandMessageLink = `https://t.me/c/${fromChatId}/${fromTopicId ? `${fromTopicId}/` : ''}${commandMessageId}`;
    if (fromChatId.toString().startsWith("-100")) {
      commandMessageLink = `https://t.me/c/${fromChatId.toString().substring(4)}/${fromTopicId ? `${fromTopicId}/` : ''}${commandMessageId}`;
    }
    const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: fromChatId,
      message_thread_id: fromTopicId,
      text: `*[MESSAGE](${originMessageLink}) has been DELETED*\\.` +
          `These three Message will be deleted after 1s automatically\\.` +
          `\nOr You can delete the *[ORIGIN MESSAGE](${originMessageLink})*` +
          ` and *[COMMAND MESSAGE](${commandMessageLink})*` +
          ` and *\\[THIS MESSAGE\\]* for yourself\\.`,
      parse_mode: "MarkdownV2",
    })).json();
    if (sendMessageResp.ok) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      // delete origin message
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: fromMessageId,
      });
      // delete command message
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: commandMessageId,
      });
      await postToTelegramApi(botToken, 'deleteMessage', {
        chat_id: fromChatId,
        message_id: sendMessageResp.result.message_id,
      });
    }
  } else {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: fromChatId,
      message_thread_id: fromTopicId,
      text: `*Message has been DELETED*\\.` +
          `\nYou can delete the *\\[ORIGIN MESSAGE\\]*` +
          ` and *\\[COMMAND MESSAGE\\]*` +
          ` and *\\[THIS MESSAGE\\]* for yourself\\.` +
          ` Limited by TG I can't do it for you, sorry\\.`,
      parse_mode: "MarkdownV2",
    });
  }
}

// ---------------------------------------- BAN TOPIC ----------------------------------------

export async function banTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, isSilent) {
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;

  const { isBannedBefore } =
      await banTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId);
  if (isBannedBefore) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `This topic already been BANNED!`,
    });
    return new Response('OK');
  }

  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    text: `Successfully BAN this topic for receiving private message!`,
  });

  if (isSilent) return new Response('OK');
  const chatId = topicToFromChat.get(topicId)
  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `You have been BANNED for sending messages!`,
  });
  return new Response('OK');
}

export async function unbanTopic(botToken, ownerUid, message, topicToFromChat, metaDataMessage, isSilent) {
  const topicId = message.message_thread_id;
  const superGroupChatId = message.chat.id;

  const { isNotBannedBefore } =
      await unbanTopicOnMetaData(botToken, ownerUid, metaDataMessage, topicId);
  if (isNotBannedBefore) {
    await postToTelegramApi(botToken, 'sendMessage', {
      chat_id: superGroupChatId,
      message_thread_id: topicId,
      text: `This topic has NOT benn banned!`,
    });
    return new Response('OK');
  }

  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: superGroupChatId,
    message_thread_id: topicId,
    text: `Successfully UN-BAN this topic for receiving private message!`,
  });

  if (isSilent) return new Response('OK');
  const chatId = topicToFromChat.get(topicId)
  await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `You have been UN-BANNED for sending messages!`,
  });
  return new Response('OK');
}

// ---------------------------------------- FIX SETTING ----------------------------------------

export async function fixPinMessage(botToken, chatId, text, oldPinMsgId) {
  await postToTelegramApi(botToken, 'unpinChatMessage', {
    chat_id: chatId,
    message_id: oldPinMsgId,
  });

  const sendMessageResp = await (await postToTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: text,
  })).json();
  if (sendMessageResp.ok) {
    await postToTelegramApi(botToken, 'pinChatMessage', {
      chat_id: chatId,
      message_id: sendMessageResp.result.message_id,
    });
  }
}

// ---------------------------------------- TOPIC COMMENT NAME ----------------------------------------

export async function processTopicCommentNameEdit(botToken, ownerUid, topicId, fromChatId, newTotalName, metaDataMessage) {
  if (!newTotalName) return;
  const oldText = metaDataMessage.text;
  let commentName = newTotalName.includes('|') ?
      newTotalName.split('|')[0].trim().replace(/[:;]/g, '') : '';

  const escapeRegExp = str => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const checkRegex = new RegExp(`;${topicId}:b?${fromChatId}:${escapeRegExp(commentName)}(?:[;^])`, 'g');
  const isMatch = checkRegex.test(oldText);
  if (isMatch) {
    return;
  }
  const replaceRegex = new RegExp(`;${topicId}:(b?)${fromChatId}(?::[^;]*)?`, 'g');
  const newText = oldText.replace(replaceRegex, `;${topicId}:$1${fromChatId}:${commentName}`);
  await postToTelegramApi(botToken, 'editMessageText', {
    chat_id: ownerUid,
    message_id: metaDataMessage.message_id,
    text: newText,
  });
}
