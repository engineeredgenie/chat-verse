import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import Swal from 'sweetalert2';
import {AudioPlayerComponent} from '../audio-player/audio-player.component';
import {FormsModule} from '@angular/forms';
import {NgClass} from '@angular/common';
import { MessageInterface, UserInterface } from '../interfaces';
import {AppwriteService} from '../services/appwrite.service';
import { HeaderComponent } from "../header/header.component";

@Component({
  selector: 'app-chat',
  imports: [AudioPlayerComponent, FormsModule, NgClass, HeaderComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit, OnDestroy{

  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  audioUrl: string = '';
  isRecording = false;

  message: string = '';
  messages: MessageInterface[] = [];

  searchTerm: string = '';
  users: UserInterface[] = [];
  private stopPresence?: () => void;
  private unsubscribePresence?: () => void;

  // Sticky date header
  currentStickyDate: string = '';
  showStickyHeader: boolean = false;
  stickyDateIndex: number = -1; // Index of the message that should be sticky

  // WhatsApp-style scroll behavior
  isAtBottom: boolean = true;
  showScrollToBottomButton: boolean = false;
  unreadMessageCount: number = 0;

  // Online status tracking
  private onlineStatusInterval?: number;
  private readonly OFFLINE_THRESHOLD = 30000; // 30 seconds

  get filteredUsers(): UserInterface[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.users;
    return this.users.filter(u =>
      u.name.toLowerCase().includes(term) ||
      u.lastMessage.toLowerCase().includes(term)
    );
  }

  selectedUserId: string | null = null;

  get selectedUser(): UserInterface | null {
    return this.users.find(u => u.id === this.selectedUserId) ?? null;
  }

  // WhatsApp-style date formatting
  formatDateHeader(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = today.getTime() - messageDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays >= 2 && diffDays <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

  // Check if we need to show a date header before this message
  shouldShowDateHeader(currentIndex: number): boolean {
    if (currentIndex === 0) return true; // Always show for first message
    
    const currentMessage = this.messages[currentIndex];
    const previousMessage = this.messages[currentIndex - 1];
    
    if (!currentMessage || !previousMessage) return false;
    
    const currentDate = new Date(currentMessage.fullDate.getFullYear(), currentMessage.fullDate.getMonth(), currentMessage.fullDate.getDate());
    const previousDate = new Date(previousMessage.fullDate.getFullYear(), previousMessage.fullDate.getMonth(), previousMessage.fullDate.getDate());
    
    return currentDate.getTime() !== previousDate.getTime();
  }

  // Handle scroll to update sticky header - WhatsApp style
  onScroll(event: Event) {
    const scrollContainer = event.target as HTMLElement;
    const containerRect = scrollContainer.getBoundingClientRect();
    
    // Check if user is at bottom (with small threshold)
    const isAtBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 10;
    this.isAtBottom = isAtBottom;
    
    // Hide scroll button if user is at bottom
    if (isAtBottom && this.showScrollToBottomButton) {
      this.showScrollToBottomButton = false;
      this.unreadMessageCount = 0;
      this.cdr.detectChanges();
    }
    
    // Find all visible messages
    const messageElements = scrollContainer.querySelectorAll('[data-message-index]');
    const visibleMessages: { index: number; date: string }[] = [];
    
    for (let i = 0; i < messageElements.length; i++) {
      const element = messageElements[i] as HTMLElement;
      const rect = element.getBoundingClientRect();
      
      // Check if message is visible in the viewport
      if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
        const index = parseInt(element.getAttribute('data-message-index') || '0');
        if (index >= 0 && index < this.messages.length) {
          const message = this.messages[index];
          const date = this.formatDateHeader(message.fullDate);
          visibleMessages.push({ index, date });
        }
      }
    }
    
    if (visibleMessages.length === 0) return;
    
    // Get unique dates in visible messages
    const visibleDates = [...new Set(visibleMessages.map(m => m.date))];
    
    if (visibleDates.length === 1) {
      // Only one date visible - hide sticky header
      if (this.showStickyHeader) {
        this.showStickyHeader = false;
        this.cdr.detectChanges();
      }
    } else {
      // Multiple dates visible - show sticky header for the first date
      const firstDate = visibleDates[0];
      
      // Only update if the sticky date has actually changed
      if (!this.showStickyHeader || this.currentStickyDate !== firstDate) {
        this.currentStickyDate = firstDate;
        this.showStickyHeader = true;
        // Find the index of the first message with this date
        const firstMessageWithDate = visibleMessages.find(m => m.date === firstDate);
        this.stickyDateIndex = firstMessageWithDate?.index || 0;
        this.cdr.detectChanges();
      }
    }
  }

  // Get the current sticky date for display
  getCurrentStickyDate(): string {
    return this.currentStickyDate;
  }

  // Scroll to bottom of chat
  scrollToBottom() {
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container') as HTMLElement;
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
        this.isAtBottom = true;
        this.showScrollToBottomButton = false;
        this.unreadMessageCount = 0;
      }
    }, 100); // Small delay to ensure DOM is updated
  }

  // Handle new message received (WhatsApp style)
  onNewMessageReceived() {
    if (this.isAtBottom) {
      // User is at bottom, scroll immediately
      this.scrollToBottom();
    } else {
      // User is reading older messages, show CTA button
      this.unreadMessageCount++;
      this.showScrollToBottomButton = true;
      this.cdr.detectChanges();
    }
  }

  // Handle new message sent
  onNewMessageSent() {
    // Always scroll when user sends a message
    this.scrollToBottom();
  }

  // Check if a message should show a static date header (WhatsApp style)
  shouldShowStaticDateHeader(currentIndex: number): boolean {
    // Don't show if this is the first message
    if (currentIndex === 0) return false;
    
    const currentMessage = this.messages[currentIndex];
    const previousMessage = this.messages[currentIndex - 1];
    
    if (!currentMessage || !previousMessage) return false;
    
    const currentDate = this.formatDateHeader(currentMessage.fullDate);
    const previousDate = this.formatDateHeader(previousMessage.fullDate);
    
    // Only show static header if dates are different
    if (currentDate !== previousDate) {
      // If we have a sticky header showing, only show static header for dates that are NOT sticky
      if (this.showStickyHeader && this.currentStickyDate) {
        return currentDate !== this.currentStickyDate;
      }
      // If no sticky header, show static header for all date changes
      return true;
    }
    
    return false;
  }

  ngOnDestroy() {
    if (this.unsubscribeRealtime) this.unsubscribeRealtime();
    if (this.unsubscribePresence) this.unsubscribePresence();
    if (this.stopPresence) this.stopPresence();
    if (this.onlineStatusInterval) {
      clearInterval(this.onlineStatusInterval);
    }
  }

  selectUser(user: UserInterface) {
    this.selectedUserId = user.id;
    this.loadMessagesForSelectedUser();
  }

  private unsubscribeRealtime?: () => void;

  constructor(private cdr: ChangeDetectorRef, private appWrite: AppwriteService) {
  }

  ngOnInit() {
    this.appWrite.getUser().then(async (user) => {
      // Ensure user has a name before connecting to realtime/presence
      let displayName = (user as any).name;
      if (!displayName || displayName.trim().length === 0) {
        const result = await Swal.fire({
          title: 'Set your name',
          input: 'text',
          inputLabel: 'Please enter a display name',
          inputPlaceholder: 'Your name',
          allowOutsideClick: false,
          allowEscapeKey: false,
          inputValidator: (value: string) => {
            if (!value || value.trim().length < 2) {
              return 'Please enter at least 2 characters';
            }
            return undefined;
          },
          confirmButtonText: 'Save'
        });
        if (result.isConfirmed && result.value) {
          const updated = await this.appWrite.ensureUserName(result.value.trim());
          displayName = (updated as any).name;
        }
      }
      // Start presence heartbeat and initial load (no-op if not configured)
      this.stopPresence = await this.appWrite.startPresenceHeartbeat();
      await this.loadOnlineUsers();
      // Subscribe to presence updates (no-op if not configured)
      this.unsubscribePresence = this.appWrite.subscribeToPresence(() => {
        this.loadOnlineUsers();
      });
    })
  }

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];
    this.isRecording = true;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioUrl = URL.createObjectURL(audioBlob);
      this.sendAudioMsg(this.audioUrl)
    };

    this.mediaRecorder.start();
  }

  async stopRecording() {
    this.mediaRecorder?.stop();
    this.isRecording = false;

    // Stop all microphone streams
    this.mediaRecorder?.stream?.getTracks().forEach((track) => track.stop());
  }

  private async loadOnlineUsers() {
    try {
      const [docs, me] = await Promise.all([
        this.appWrite.listOnlineUsers(60),
        this.appWrite.getUser().catch(() => null)
      ]);
      const myId = me?.$id ?? null;
      const now = new Date();
      
      this.users = docs
        .filter((d: any) => (myId ? d.userId !== myId : true))
        .map((d: any) => {
          const lastSeen = new Date(d.lastSeen);
          const timeDiff = now.getTime() - lastSeen.getTime();
          const isOnline = timeDiff < this.OFFLINE_THRESHOLD;
          
          return {
            id: d.userId,
            name: d.name || 'User',
            avatarUrl: d.avatarUrl || 'assets/images/profile.jpeg',
            lastMessage: '',
            lastActiveTime: lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isOnline: isOnline
          };
        });
      
      this.cdr.detectChanges();
      
      // Start periodic online status checking
      this.startOnlineStatusChecking();
    } catch (e) {
      console.error('Failed to load online users', e);
    }
  }

  private startOnlineStatusChecking() {
    // Clear existing interval
    if (this.onlineStatusInterval) {
      clearInterval(this.onlineStatusInterval);
    }
    
    // Check online status every 10 seconds
    this.onlineStatusInterval = window.setInterval(() => {
      this.updateOnlineStatus();
    }, 10000);
  }

  private updateOnlineStatus() {
    const now = new Date();
    let hasChanges = false;
    
    this.users.forEach(user => {
      const wasOnline = user.isOnline;
      
      // Check if user should be considered offline
      // This is a simplified check - in production you'd have more sophisticated logic
      // For now, we'll simulate offline detection by checking if the user is still in the online users list
      this.checkUserOnlineStatus(user).then(isOnline => {
        if (user.isOnline !== isOnline) {
          user.isOnline = isOnline;
          hasChanges = true;
        }
      });
    });
    
    if (hasChanges) {
      this.cdr.detectChanges();
    }
  }

  private async checkUserOnlineStatus(user: UserInterface): Promise<boolean> {
    try {
      // In a real implementation, you'd check the user's last activity
      // For now, we'll simulate by checking if they're still in the recent online users
      const docs = await this.appWrite.listOnlineUsers(60);
      const userDoc = docs.find((d: any) => d.userId === user.id);
      
      if (!userDoc) {
        return false; // User not in online list, consider offline
      }
      
      // Check if last seen is within threshold
      const lastSeen = new Date(userDoc.lastSeen);
      const timeDiff = new Date().getTime() - lastSeen.getTime();
      return timeDiff < this.OFFLINE_THRESHOLD;
    } catch (e) {
      console.error('Failed to check user online status', e);
      return user.isOnline; // Keep current status on error
    }
  }

  async sendTextMessage() {
    const text = this.message.trim();
    if (!text) return;
    if (!this.selectedUserId) {
      console.warn('No user selected. Select a user to start chatting.');
      return;
    }

    const now = new Date();
    const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Optimistic UI update
    const tempId = 'temp-' + now.getTime();
    const currentUser = await this.appWrite.getUser().catch(() => null);
    const myId = currentUser?.$id ?? 'anonymous';
    this.messages.push({
      id: tempId,
      type: 'text',
      data: text,
      dateTime: localTime,
      fullDate: now,
      isSentByMe: true,
      senderId: myId
    });
    this.message = '';
    
    // Handle new message sent
    this.onNewMessageSent();

    try {
      const created = await this.appWrite.createTextMessage({
        chatId: this.selectedUserId ?? 'default',
        senderId: myId,
        text,
        sentAt: now.toISOString()
      });

      // Replace temp message id with real document id
      const idx = this.messages.findIndex(m => m.id === tempId);
      if (idx !== -1) {
        this.messages[idx].id = created.$id;
      }
      // Realtime delivery handled by Appwrite subscription
    } catch (err) {
      console.error('Failed to persist message to Appwrite', err);
      // Optionally revert optimistic update
    }
  }

  private async loadMessagesForSelectedUser() {
    if (!this.selectedUserId) return;
    try {
      // Setup realtime subscription for current chat
      if (this.unsubscribeRealtime) {
        this.unsubscribeRealtime();
        this.unsubscribeRealtime = undefined;
      }
      const [currentUser] = await Promise.all([
        this.appWrite.getUser().catch(() => null)
      ]);

      const myId = currentUser?.$id ?? null;

      // Load both directions: messages where chatId is either me or selected user
      const docs = await this.appWrite.listMessages(this.selectedUserId, myId || undefined);
      this.messages = docs.map((d: any) => {
        const isAudio = d.type === 'audio';
        const sentDate = new Date(d.sentAt);
        return {
          id: d.$id,
          type: isAudio ? 'audio' : 'text',
          data: isAudio ? d.url : d.text,
          dateTime: sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fullDate: sentDate,
          isSentByMe: myId ? d.senderId === myId : false,
          senderId: d.senderId
        } as MessageInterface;
      });
      
      // Initialize sticky header with first message
      if (this.messages.length > 0) {
        this.currentStickyDate = this.formatDateHeader(this.messages[0].fullDate);
        this.showStickyHeader = true;
      }
      
      this.cdr.detectChanges();
      
      // Scroll to bottom when messages are loaded
      this.scrollToBottom();

      // subscribe after initial load to avoid duplicating loaded docs
      if (myId) {
        this.unsubscribeRealtime = this.appWrite.subscribeToConversation(this.selectedUserId, myId, async (doc: any) => {
          // Ignore duplicates for messages we just optimistically added: if exists by id, skip
          if (this.messages.some(m => m.id === doc.$id)) return;
          const me = await this.appWrite.getUser().catch(() => null);
          const myId2 = me?.$id ?? null;
          const isAudio = doc.type === 'audio';
          const payload = isAudio ? doc.url : doc.text;
          const sentDate = new Date(doc.sentAt);
          this.messages.push({
            id: doc.$id,
            type: isAudio ? 'audio' : 'text',
            data: payload,
            dateTime: sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fullDate: sentDate,
            isSentByMe: myId2 ? doc.senderId === myId2 : false,
            senderId: doc.senderId
          });
          this.cdr.detectChanges();
          
          // Handle new message received (WhatsApp style)
          this.onNewMessageReceived();
        });
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendTextMessage();
    }
  }

  async sendAudioMsg(audioDataUrl: string) {
    const now = new Date();
    const localTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentUser = await this.appWrite.getUser().catch(() => null);
    const myId = currentUser?.$id ?? 'anonymous';

    // Optimistic UI: show local blob URL
    const tempId = 'temp-audio-' + now.getTime();
    this.messages.push({
      id: tempId,
      type: 'audio',
      data: audioDataUrl,
      dateTime: localTime,
      fullDate: now,
      isSentByMe: true,
      senderId: myId
    });
    this.cdr.detectChanges();
    
    // Handle new message sent
    this.onNewMessageSent();

    try {
      // Convert local blob URL to Blob
      const audioBlob = await (await fetch(audioDataUrl)).blob();
      const created = await this.appWrite.uploadAudioAndCreateMessage({
        chatId: this.selectedUserId ?? 'default',
        senderId: myId,
        audioBlob,
        sentAt: now.toISOString()
      });

      // Replace temp message with remote URL
      const idx = this.messages.findIndex(m => m.id === tempId);
      if (idx !== -1) {
        this.messages[idx].id = created.doc.$id;
        this.messages[idx].data = created.url;
      }
    } catch (e) {
      console.error('Failed to upload audio message', e);
    }
  }
}
