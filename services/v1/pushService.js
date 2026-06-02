const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Send push notifications to an array of Expo push tokens.
 * @param {Array} tokens - Array of valid Expo Push Tokens
 * @param {String} title - Notification Title
 * @param {String} body - Notification Body
 * @param {Object} data - Additional data payload
 */
exports.sendPushNotification = async (tokens, title, body, data = {}) => {
    let messages = [];

    for (let pushToken of tokens) {
        // Check that all your push tokens appear to be valid Expo push tokens
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }

        // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
        messages.push({
            to: pushToken,
            sound: 'default',
            title: title,
            body: body,
            data: data,
        });
    }

    // The Expo push notification service accepts batches of notifications
    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];

    for (let chunk of chunks) {
        try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('Error sending push notification chunk:', error);
        }
    }

    return tickets;
};
