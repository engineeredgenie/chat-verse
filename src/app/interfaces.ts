export interface MessageInterface {
  id: string;
  type: 'text' | 'image' | 'audio';
  data: any; // text or URL for audio/image
  dateTime: string;
  isSentByMe: boolean;
  senderId?: string;
}

export interface UserInterface {
  id: string;
  name: string;
  avatarUrl: string;
  lastMessage: string;
  lastActiveTime: string;
}
