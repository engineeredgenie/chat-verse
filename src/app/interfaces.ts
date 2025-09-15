export interface MessageInterface {
  id: string;
  type: 'text' | 'image' | 'audio';
  data: any; // text or URL for audio/image
  dateTime: string;
  isSentByMe: boolean;
  senderId?: string;
  fullDate: Date;
}

export interface UserInterface {
  id: string; // Appwrite account ID
  userId: string; // Custom unique user ID
  name: string;
  avatarUrl: string;
  lastMessage: string;
  lastActiveTime: string;
  isOnline: boolean;
  lastMessageTimestamp?: Date;
  unreadCount?: number;
}

export interface FriendshipInterface {
  id: string;
  requesterId: string; // userId of the user who sent the request
  addresseeId: string; // userId of the user who received the request
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  requestedAt: Date;
  acceptedAt?: Date;
  blockedAt?: Date;
}
