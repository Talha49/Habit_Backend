const Message = require('../../models/v1/Message');
const socketService = require('../../services/v1/socketService');

// Fetch Squad Messages
exports.getSquadMessages = async (req, res) => {
    try {
        const { squadId } = req.params;
        const messages = await Message.find({ squadId })
            .populate('sender', 'fullName')
            .sort({ createdAt: -1 })
            .limit(50);
            
        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Fetch Direct Messages
exports.getDirectMessages = async (req, res) => {
    try {
        const { targetUserId } = req.params;
        const currentUserId = req.user._id;

        const messages = await Message.find({
            $or: [
                { sender: currentUserId, receiver: targetUserId },
                { sender: targetUserId, receiver: currentUserId }
            ]
        })
        .populate('sender', 'fullName')
        .sort({ createdAt: -1 })
        .limit(50);

        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send a Message
exports.sendMessage = async (req, res) => {
    try {
        const { squadId, receiverId, content, messageType } = req.body;
        const senderId = req.user._id;

        if (!squadId && !receiverId) {
            return res.status(400).json({ success: false, message: 'Squad ID or Receiver ID is required' });
        }

        const messageData = {
            sender: senderId,
            content,
            messageType: messageType || 'text',
            readBy: [senderId]
        };

        if (squadId) {
            messageData.squadId = squadId;
        } else {
            messageData.receiver = receiverId;
        }

        let message = await Message.create(messageData);
        message = await message.populate('sender', 'fullName');

        // Broadcast via Socket.io
        if (squadId) {
            socketService.emitToSquad(squadId, 'new_message', message);
            
            // Create in-app notifications for squad members
            try {
                const Squad = require('../../models/v1/Squad');
                const notificationController = require('./notificationController');
                const squad = await Squad.findById(squadId);
                if (squad && squad.members) {
                    for (const memberId of squad.members) {
                        if (memberId.toString() !== senderId.toString()) {
                            await notificationController.createNotification({
                                userId: memberId,
                                type: 'chat',
                                title: squad.name,
                                message: `${message.sender.fullName}: ${content}`,
                                relatedEntity: squadId,
                                entityModel: 'SquadV1'
                            });
                        }
                    }
                }
            } catch (notifyErr) {
                console.error('Failed to send squad notifications:', notifyErr);
            }
        } else {
            socketService.emitToUser(receiverId, 'new_message', message);
            // Optionally, emit back to sender to confirm
            socketService.emitToUser(senderId, 'new_message', message);

            // Create in-app notification for the direct receiver
            try {
                const notificationController = require('./notificationController');
                await notificationController.createNotification({
                    userId: receiverId,
                    type: 'chat',
                    title: message.sender.fullName,
                    message: content,
                    relatedEntity: senderId, // So we can navigate to chat with sender
                    entityModel: 'User'
                });
            } catch (notifyErr) {
                console.error('Failed to send DM notification:', notifyErr);
            }
        }

        res.status(201).json({ success: true, message });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// React to a message
exports.addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        // Check if user already reacted with the same emoji
        const existingReaction = message.reactions.find(r => r.userId.toString() === userId.toString() && r.emoji === emoji);
        if (existingReaction) {
            // Remove reaction
            message.reactions = message.reactions.filter(r => !(r.userId.toString() === userId.toString() && r.emoji === emoji));
        } else {
            // Add reaction
            message.reactions.push({ emoji, userId });
        }

        await message.save();

        // Broadcast updated message
        if (message.squadId) {
            socketService.emitToSquad(message.squadId, 'message_updated', message);
        } else {
            socketService.emitToUser(message.receiver, 'message_updated', message);
            socketService.emitToUser(message.sender, 'message_updated', message);
        }

        res.json({ success: true, message });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
