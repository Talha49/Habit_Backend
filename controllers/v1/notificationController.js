const Notification = require('../../models/v1/Notification');
const socketService = require('../../services/v1/socketService');
const User = require('../../models/v1/User');

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
            
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, userId: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, notification });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Internal utility function to send a notification
exports.createNotification = async ({ userId, type, title, message, relatedEntity = null, entityModel = null }) => {
    try {
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            relatedEntity,
            entityModel
        });

        // 1. Send via WebSocket (In-App)
        socketService.emitToUser(userId, 'new_notification', notification);

        // Push Notifications are disabled as per request, but we keep in-app.

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};
