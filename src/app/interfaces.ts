export interface MessageInterface {
  id: string;
  type: 'text' | 'image' | 'audio';
  data: any;
  dateTime: string;
  isSentByMe: boolean;
}
