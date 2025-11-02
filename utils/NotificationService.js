// utils/NotificationService.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const NotificationService = {
  async initialize() {
    console.log('✅ Notification service initialized');
    await this.requestPermissions();
  },

  async requestPermissions() {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Permission not granted for notifications');
        return;
      }
    } else {
      console.log('⚠️ Must use physical device for Push Notifications');
    }
  },

  async sendTestNotification() {
    console.log('📨 Sending test notification...');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Test Reminder',
        body: 'This is a test notification from Smart Pipeline CRM!',
        sound: 'notificationtone.mp3',
      },
      trigger: { seconds: 5 },
    });
  },

  async scheduleFollowUpNotification(leadName, followUpDate) {
    console.log('📅 Scheduling follow-up notification for:', leadName, 'at:', followUpDate);

    const followUpTime = new Date(followUpDate);
    const now = new Date();

    if (followUpTime <= now) {
      console.log('⚠️ Follow-up time is in the past or now, not scheduling notification');
      return null;
    }

    // Check if notification is already scheduled for this lead and time
    const existingNotifications = await this.getScheduledNotifications();
    const existingNotification = existingNotifications.find(notification => {
      const triggerDate = notification.trigger?.date;
      return triggerDate && new Date(triggerDate).getTime() === followUpTime.getTime() &&
             notification.content?.body?.includes(leadName);
    });

    if (existingNotification) {
      console.log('⚠️ Notification already scheduled for this lead and time');
      return existingNotification.identifier;
    }

    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 Follow-up Reminder',
          body: `Time to follow up with ${leadName}`,
          sound: 'notificationtone.mp3',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: followUpTime,
      });

      console.log('✅ Follow-up notification scheduled successfully:', identifier);
      return identifier;
    } catch (error) {
      console.error('❌ Error scheduling follow-up notification:', error);
      return null;
    }
  },

  async cancelNotification(identifier) {
    if (!identifier) return;

    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      console.log('✅ Notification cancelled:', identifier);
    } catch (error) {
      console.error('❌ Error cancelling notification:', error);
    }
  },

  async getScheduledNotifications() {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log('📋 Scheduled notifications:', notifications.length);
      return notifications;
    } catch (error) {
      console.error('❌ Error getting scheduled notifications:', error);
      return [];
    }
  },
};

export default NotificationService;
