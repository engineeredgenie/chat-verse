import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import Swal from 'sweetalert2';
import {AudioPlayerComponent} from '../audio-player/audio-player.component';
import {FormsModule} from '@angular/forms';
import {NgClass, DatePipe} from '@angular/common';
import { MessageInterface, UserInterface } from '../interfaces';
import {AppwriteService} from '../services/appwrite.service';
import { HeaderComponent } from "../header/header.component";

@Component({
  selector: 'app-chat',
  imports: [AudioPlayerComponent, FormsModule, NgClass, HeaderComponent, DatePipe],
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
  private unsubscribeGlobalMessages?: () => void;

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
  private readonly OFFLINE_THRESHOLD = 5; // 5 seconds

  // Friends UI state
  isRequestsOpen: boolean = false;
  pendingRequests: Array<{ $id: string; requesterId: string; requestedAt?: string }> = [];

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
    if (this.unsubscribeGlobalMessages) this.unsubscribeGlobalMessages();
    if (this.stopPresence) this.stopPresence();
    if (this.onlineStatusInterval) {
      clearInterval(this.onlineStatusInterval);
    }
  }

  selectUser(user: UserInterface) {
    this.selectedUserId = user.id;
    // Reset unread count when opening a chat
    const idx = this.users.findIndex(u => u.id === user.id);
    if (idx !== -1) this.users[idx].unreadCount = 0;
    this.loadMessagesForSelectedUser();
  }

  private unsubscribeRealtime?: () => void;

  constructor(private cdr: ChangeDetectorRef, private appWrite: AppwriteService) {
  }

  ngOnInit() {
    this.appWrite.getUser().then(async (user) => {
      // Ensure user has a name and userId before connecting to realtime/presence
      let displayName = (user as any).name;
      let userCustomId = (user as any).prefs?.userId;
      
      if (!displayName || displayName.trim().length === 0 || !userCustomId) {
        const result = await Swal.fire({
          title: 'Complete Your Profile',
          html: `
            <div style="text-align: left;">
              <label for="swal-input1" style="display: block; margin-bottom: 5px; font-weight: bold;">Display Name:</label>
              <input id="swal-input1" class="swal2-input" placeholder="Your name" value="${displayName || ''}">
              
              <label for="swal-input2" style="display: block; margin: 15px 0 5px 0; font-weight: bold;">User ID:</label>
              <input id="swal-input2" class="swal2-input" placeholder="Your unique user ID" value="${userCustomId || ''}">
              <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">
                This will be your unique identifier for friends to find you
              </small>
            </div>
          `,
          allowOutsideClick: false,
          allowEscapeKey: false,
          preConfirm: () => {
            const nameInput = document.getElementById('swal-input1') as HTMLInputElement;
            const userIdInput = document.getElementById('swal-input2') as HTMLInputElement;
            
            const name = nameInput?.value?.trim();
            const userId = userIdInput?.value?.trim();
            
            if (!name || name.length < 2) {
              Swal.showValidationMessage('Please enter at least 2 characters for your name');
              return false;
            }
            
            if (!userId || userId.length < 3) {
              Swal.showValidationMessage('Please enter at least 3 characters for your User ID');
              return false;
            }
            
            // Check for valid characters (alphanumeric and underscore only)
            if (!/^[a-zA-Z0-9_]+$/.test(userId)) {
              Swal.showValidationMessage('User ID can only contain letters, numbers, and underscores');
              return false;
            }
            
            return { name, userId };
          },
          confirmButtonText: 'Save Profile'
        });
        
        if (result.isConfirmed && result.value) {
          const { name, userId } = result.value;
          const updated = await this.appWrite.ensureUserNameAndId(name, userId);
          displayName = (updated as any).name;
          userCustomId = (updated as any).prefs?.userId;
        }
      }
      // Start presence heartbeat and initial load (no-op if not configured)
      this.stopPresence = await this.appWrite.startPresenceHeartbeat();
      await this.loadOnlineUsers();
      // Subscribe to presence updates (no-op if not configured)
      this.unsubscribePresence = this.appWrite.subscribeToPresence(() => {
        this.loadOnlineUsers();
      });
      // Global message subscription to keep chat list lastMessage fresh even when chat not active
      this.unsubscribeGlobalMessages = this.appWrite.subscribeToAllMessages(async (doc: any) => {
        const meNow = await this.appWrite.getUser().catch(() => null);
        const myCustom = (meNow as any)?.prefs?.userId;
        if (!myCustom) return;
        // Only consider messages where I'm a participant
        if (!(doc.chatId === myCustom || doc.senderId === myCustom)) return;
        this.updateUserListWithNewMessage(doc, myCustom);
        this.cdr.detectChanges();
      });
      // Preload pending requests badge
      await this.refreshPendingRequests();
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
      const myCustomUserId = (me as any).prefs?.userId;
      const now = new Date();
      
      if (!myCustomUserId) {
        console.warn('Custom userId not found. Cannot load friends.');
        return;
      }
      
      // Get friends list
      const friendUserIds = await this.appWrite.getFriends(myCustomUserId);
      
      // Get all users from presence (online and recent offline) and filter to friends only
      const allUsers = docs
        .filter((d: any) => {
          // Filter out self and only include friends
          return d.userId !== myCustomUserId && friendUserIds.includes(d.userId);
        })
        .map((d: any) => {
          const lastSeen = new Date(d.lastSeen);
          const timeDiff = now.getTime() - lastSeen.getTime();
          const isOnline = timeDiff < this.OFFLINE_THRESHOLD;
          
          return {
            id: d.appwriteUserId || d.userId, // Use Appwrite account ID for chat compatibility
            userId: d.userId, // Custom userId
            name: d.name || 'User',
            avatarUrl: d.avatarUrl || 'assets/images/profile.jpeg',
            lastMessage: '',
            lastActiveTime: lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isOnline: isOnline,
            lastMessageTimestamp: undefined
          };
        });

      // Load past chats and get last messages for sorting
      await this.loadPastChatsAndSort(allUsers, myId);
      // Ensure global subscription keeps lastMessage fresh; avoid stale overwrites
      
      this.cdr.detectChanges();
      
      // Start periodic online status checking
      this.startOnlineStatusChecking();
    } catch (e) {
      console.error('Failed to load online users', e);
    }
  }

  private async loadPastChatsAndSort(users: UserInterface[], myId: string | null) {
    if (!myId) {
      this.users = users;
      return;
    }

    try {
      // Get all unique chat partners from messages
      const allMessages = await this.appWrite.listAllMessages(myId);
      const chatPartners = new Map<string, { lastMessage: string; lastMessageTimestamp: Date }>();

      // Process messages to find last message for each chat partner
      allMessages.forEach((msg: any) => {
        const chatId = msg.chatId;
        const sentAt = new Date(msg.sentAt);
        
        if (!chatPartners.has(chatId) || chatPartners.get(chatId)!.lastMessageTimestamp < sentAt) {
          chatPartners.set(chatId, {
            lastMessage: msg.type === 'audio' ? 'Audio message' : msg.text || '',
            lastMessageTimestamp: sentAt
          });
        }
      });

      // Update users with last message info
      const updatedUsers = users.map(user => {
        const chatInfo = chatPartners.get(user.id);
        if (chatInfo) {
          return {
            ...user,
            lastMessage: chatInfo.lastMessage,
            lastMessageTimestamp: chatInfo.lastMessageTimestamp
          };
        }
        return user;
      });

      // Add users who have chat history but aren't in presence (only if they're friends)
      const me = await this.appWrite.getUser().catch(() => null);
      const myCustomUserId = (me as any).prefs?.userId;
      
      if (myCustomUserId) {
        const friendUserIds = await this.appWrite.getFriends(myCustomUserId);
        
        chatPartners.forEach((chatInfo, appwriteUserId) => {
          if (!users.find(u => u.id === appwriteUserId)) {
            // Check if this user is a friend by looking up their custom userId
            // For now, we'll skip adding offline users without presence data
            // In a full implementation, you'd need to store the mapping between appwriteUserId and customUserId
          }
        });
      }

      // Sort by last message timestamp (most recent first), then by online status
      this.users = updatedUsers.sort((a, b) => {
        // Online users first
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        
        // Then by last message timestamp
        if (a.lastMessageTimestamp && b.lastMessageTimestamp) {
          return b.lastMessageTimestamp.getTime() - a.lastMessageTimestamp.getTime();
        }
        if (a.lastMessageTimestamp && !b.lastMessageTimestamp) return -1;
        if (!a.lastMessageTimestamp && b.lastMessageTimestamp) return 1;
        
        // Finally by name
        return a.name.localeCompare(b.name);
      });

    } catch (e) {
      console.error('Failed to load past chats', e);
      this.users = users;
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
    const myId = (currentUser as any)?.prefs?.userId ?? 'anonymous';
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
    
    // Update user list optimistically
    this.updateUserListOptimistically(this.selectedUserId, text, now);
    
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
      // Prevent duplicate when realtime arrives: we already guard above by id check
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

      const myId = (currentUser as any)?.prefs?.userId ?? null;

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
          // Deduplicate: ignore if a message with same id already exists
          if (this.messages.some(m => m.id === doc.$id)) return;
          const me = await this.appWrite.getUser().catch(() => null);
          const myId2 = (me as any)?.prefs?.userId ?? null;
          const isAudio = doc.type === 'audio';
          const payload = isAudio ? doc.url : doc.text;
          const sentDate = new Date(doc.sentAt);

          // 1) If this is my own message, merge with the optimistic temp one
          if (myId2 && doc.senderId === myId2) {
            const tempIndex = this.messages.findIndex(m => m.id.startsWith('temp-') && m.isSentByMe === true);
            if (tempIndex !== -1) {
              this.messages[tempIndex].id = doc.$id;
              this.messages[tempIndex].data = payload;
              this.messages[tempIndex].fullDate = sentDate;
              this.messages[tempIndex].dateTime = sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              this.cdr.detectChanges();
              // Update user list to reflect new message and re-sort
              this.updateUserListWithNewMessage(doc, myId2);
              // Handle new message received (WhatsApp style)
              this.onNewMessageReceived();
              return;
            }
          }

          // 2) If a message with same sender and timestamp already exists, skip (network race)
          if (this.messages.some(m => m.senderId === doc.senderId && Math.abs(m.fullDate.getTime() - sentDate.getTime()) < 1000 && m.data === payload)) {
            return;
          }

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
          
          // Update user list to reflect new message and re-sort
          this.updateUserListWithNewMessage(doc, myId2);
          
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
    const myId = (currentUser as any)?.prefs?.userId ?? 'anonymous';

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
    
    // Update user list optimistically
    this.updateUserListOptimistically(this.selectedUserId ?? 'default', 'Audio message', now);
    
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    const allowedExtensions = [
      'doc', 'docx', 'xls', 'xlsx', 'pdf',
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'
    ];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      alert('Invalid file type!');
      return;
    }
    // TODO: Handle file upload logic here
    console.log('Selected file:', file);
  }

  private updateUserListOptimistically(chatId: string, messageText: string, timestamp: Date) {
    const userIndex = this.users.findIndex(u => u.id === chatId);
    if (userIndex !== -1) {
      this.users[userIndex].lastMessage = messageText;
      this.users[userIndex].lastMessageTimestamp = timestamp;
      this.users[userIndex].lastActiveTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Re-sort the users array
      this.sortUsers();
      this.cdr.detectChanges();
    }
  }

  private updateUserListWithNewMessage(doc: any, myId: string | null) {
    if (!myId) return;
    
    const chatId = doc.chatId === myId ? doc.senderId : doc.chatId;
    const messageText = doc.type === 'audio' ? 'Audio message' : doc.text || '';
    const timestamp = new Date(doc.sentAt);
    
    const userIndex = this.users.findIndex(u => u.id === chatId);
    if (userIndex !== -1) {
      this.users[userIndex].lastMessage = messageText;
      this.users[userIndex].lastMessageTimestamp = timestamp;
      this.users[userIndex].lastActiveTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      // Increment unread count if this chat is not currently active and message is not mine
      if (this.selectedUserId !== chatId && doc.senderId !== myId) {
        const current = this.users[userIndex].unreadCount || 0;
        this.users[userIndex].unreadCount = current + 1;
      }
    } else {
      // Add new user if they don't exist in the list
      this.users.push({
        id: chatId,
        userId: chatId, // For new users, we'll use the chatId as userId for now
        name: 'User', // We don't have name info for new users
        avatarUrl: 'assets/images/profile.jpeg',
        lastMessage: messageText,
        lastActiveTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOnline: false,
        lastMessageTimestamp: timestamp,
        unreadCount: (this.selectedUserId !== chatId && doc.senderId !== myId) ? 1 : 0
      });
    }
    
    // Re-sort the users array
    this.sortUsers();
    this.cdr.detectChanges();
  }

  private sortUsers() {
    this.users.sort((a, b) => {
      // Online users first
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      
      // Then by last message timestamp
      if (a.lastMessageTimestamp && b.lastMessageTimestamp) {
        return b.lastMessageTimestamp.getTime() - a.lastMessageTimestamp.getTime();
      }
      if (a.lastMessageTimestamp && !b.lastMessageTimestamp) return -1;
      if (!a.lastMessageTimestamp && b.lastMessageTimestamp) return 1;
      
      // Finally by name
      return a.name.localeCompare(b.name);
    });
  }

  // Friend Management Methods
  async addFriend() {
    const result = await Swal.fire({
      title: 'Add Friend',
      input: 'text',
      inputLabel: 'Enter your friend\'s User ID',
      inputPlaceholder: 'e.g., john_doe123',
      allowOutsideClick: false,
      allowEscapeKey: false,
      inputValidator: (value: string) => {
        if (!value || value.trim().length < 3) {
          return 'Please enter at least 3 characters';
        }
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return 'User ID can only contain letters, numbers, and underscores';
        }
        return undefined;
      },
      confirmButtonText: 'Send Request'
    });

    if (result.isConfirmed && result.value) {
      try {
        await this.appWrite.sendFriendRequest(result.value.trim());
        Swal.fire({
          title: 'Success!',
          text: 'Friend request sent successfully!',
          icon: 'success',
          timer: 2000
        });
      } catch (error: any) {
        Swal.fire({
          title: 'Error',
          text: error.message || 'Failed to send friend request',
          icon: 'error'
        });
      }
    }
  }

  async showFriendRequests() {
    // Toggle slide-over panel
    this.isRequestsOpen = !this.isRequestsOpen;
    if (this.isRequestsOpen) {
      await this.refreshPendingRequests();
      this.cdr.detectChanges();
    }
  }

  private async refreshPendingRequests() {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomUserId = (me as any).prefs?.userId;
    if (!myCustomUserId) return;
    const pending = await this.appWrite.getPendingFriendRequests(myCustomUserId);
    this.pendingRequests = pending.map((p: any) => ({ $id: p.$id, requesterId: p.requesterId, requestedAt: p.requestedAt }));
  }

  async acceptRequest(reqId: string) {
    try {
      await this.appWrite.acceptFriendRequest(reqId);
      await this.refreshPendingRequests();
      await this.loadOnlineUsers();
      this.cdr.detectChanges();
      Swal.fire({ title: 'Friend added!', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ title: 'Error', text: e.message || 'Failed to accept request', icon: 'error' });
    }
  }

  async declineRequest(reqId: string) {
    try {
      await this.appWrite.declineFriendRequest(reqId);
      await this.refreshPendingRequests();
      this.cdr.detectChanges();
      Swal.fire({ title: 'Request declined', icon: 'info', timer: 1000, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ title: 'Error', text: e.message || 'Failed to decline request', icon: 'error' });
    }
  }
}
