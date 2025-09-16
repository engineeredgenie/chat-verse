import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import Swal from 'sweetalert2';
import {AudioPlayerComponent} from '../audio-player/audio-player.component';
import {FormsModule} from '@angular/forms';
import {NgClass, DatePipe, JsonPipe} from '@angular/common';
import { environment } from '../../environments/environment';
import { Query } from 'appwrite';
import { MessageInterface, UserInterface } from '../interfaces';
import {AppwriteService} from '../services/appwrite.service';
import { HeaderComponent } from "../header/header.component";

@Component({
  selector: 'app-chat',
  imports: [AudioPlayerComponent, FormsModule, NgClass, HeaderComponent, DatePipe, JsonPipe],
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
  private readonly OFFLINE_THRESHOLD_SECONDS = 60; // seconds; must exceed heartbeat interval (20s) with buffer
  
  // Debounce mechanism for message checking to prevent interference with online status
  private messageCheckTimeouts: Map<string, number> = new Map();

  // Emoji picker state
  isEmojiPickerOpen: boolean = false;
  emojiList: string[] = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '💋', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤'
  ];

  // Friends UI state
  isRequestsOpen: boolean = false;
  pendingRequests: Array<{ $id: string; requesterId: string; requestedAt?: string }> = [];

  // Files slide-over
  isFilesOpen: boolean = false;
  filesByType: { images: any[]; audio: any[]; documents: any[] } = { images: [], audio: [], documents: [] };

  // Friends Manager
  isFriendsManagerOpen: boolean = false;
  friendsList: string[] = [];
  outgoingRequests: any[] = [];
  blockedUsers: any[] = [];
  isChatBlocked: boolean = false;
  isFriendsWithSelected: boolean = true;

  get filteredUsers(): UserInterface[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.users;
    return this.users.filter(u =>
      u.name.toLowerCase().includes(term) ||
      u.lastMessage.toLowerCase().includes(term)
    );
  }

  // Selected chat partner's custom userId (not Appwrite account id)
  selectedUserId: string | null = null;

  get selectedUser(): UserInterface | null {
    return this.users.find(u => u.userId === this.selectedUserId) ?? null;
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
    if (this.unsubscribeFriendsRealtime) this.unsubscribeFriendsRealtime();
    if (this.stopPresence) this.stopPresence();
    if (this.onlineStatusInterval) {
      clearInterval(this.onlineStatusInterval);
    }
    // Clean up message check timeouts
    this.messageCheckTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.messageCheckTimeouts.clear();
  }

  selectUser(user: UserInterface) {
    // Use custom userId for chat identification
    this.selectedUserId = user.userId;
    // Reset unread count when opening a chat
    const idx = this.users.findIndex(u => u.userId === user.userId);
    if (idx !== -1) this.users[idx].unreadCount = 0;
    // Record last read timestamp for this chat
    try {
      const map = JSON.parse(localStorage.getItem('chat_last_read_ts') || '{}');
      map[user.userId] = Date.now();
      localStorage.setItem('chat_last_read_ts', JSON.stringify(map));
    } catch {}
    this.persistUnreadCounts();
    this.loadMessagesForSelectedUser();
    // Recompute unread counts after switching
    this.recomputeUnreadCountsFromMessages();
  }

  private unsubscribeRealtime?: () => void;
  private unsubscribeFriendsRealtime?: () => void;

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
      await this.recomputeUnreadCountsFromMessages();
      // Subscribe to presence updates (no-op if not configured)
      this.unsubscribePresence = this.appWrite.subscribeToPresence(() => {
        this.loadOnlineUsers();
      });
      // Global friendship realtime to update composer and manager
      this.unsubscribeFriendsRealtime = this.appWrite.subscribeToFriends(async (doc: any, events: string[]) => {
        const meNow = await this.appWrite.getUser().catch(() => null);
        const myCustom = (meNow as any)?.prefs?.userId;
        if (!myCustom) return;
        const involvesMeOrActive = [doc?.requesterId, doc?.addresseeId].some((v: any) => v === myCustom || v === this.selectedUserId);
        if (!involvesMeOrActive) return;
        
        // Refresh pending requests count when friend requests change
        await this.refreshPendingRequests();
        
        if (this.selectedUserId) {
          this.isChatBlocked = await this.appWrite.isBlocked(this.selectedUserId, myCustom);
        }
        if (this.isFriendsManagerOpen) await this.loadFriendsData();
        this.cdr.detectChanges();
      });
      // Global message subscription to keep chat list lastMessage/unread fresh even when chat not active
      this.unsubscribeGlobalMessages = this.appWrite.subscribeToAllMessages(async (doc: any) => {
        const meNow = await this.appWrite.getUser().catch(() => null);
        const myCustom = (meNow as any)?.prefs?.userId;
        if (!myCustom) return;
        // Only consider messages where I'm a participant
        if (!(doc.chatId === myCustom || doc.senderId === myCustom)) return;
        
        // Handle delete events
        if ((doc as any)._op === 'delete') {
          // When a message is deleted, we need to update the user list
          // Determine the other participant in this conversation
          const otherParticipantId = doc.chatId === myCustom ? doc.senderId : doc.chatId;
          const userIndex = this.users.findIndex(u => u.userId === otherParticipantId);
          
          if (userIndex !== -1) {
            // Check if this was the last message by comparing timestamps
            const messageTimestamp = new Date(doc.sentAt);
            const currentLastMessageTimestamp = this.users[userIndex].lastMessageTimestamp;
            
            // If this message matches the current last message timestamp, or if there's no current last message,
            // we should check if there are any remaining messages
            if (!currentLastMessageTimestamp || 
                Math.abs(currentLastMessageTimestamp.getTime() - messageTimestamp.getTime()) < 1000) {
              // This was likely the last message, verify by checking if there are any remaining messages
              this.checkAndUpdateLastMessageForUser(otherParticipantId, myCustom);
            }
          }
          return;
        }
        
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
        this.appWrite.listOnlineUsers(120),
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
          const isOnline = timeDiff < this.OFFLINE_THRESHOLD_SECONDS * 1000;
          
          return {
            id: d.appwriteUserId || d.userId,
            userId: d.userId,
            name: d.name || 'User',
            avatarUrl: d.avatarUrl || 'assets/images/profile.jpeg',
            // Keep existing lastMessage if we already have this user to avoid flicker
            lastMessage: this.users.find(u => u.userId === d.userId)?.lastMessage || '',
            lastActiveTime: lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isOnline: isOnline,
            lastMessageTimestamp: this.users.find(u => u.userId === d.userId)?.lastMessageTimestamp || undefined,
            unreadCount: this.users.find(u => u.userId === d.userId)?.unreadCount || 0
          };
        });

      // Load past chats and get last messages for sorting (use custom userId for message mapping)
      await this.loadPastChatsAndSort(allUsers, myCustomUserId ?? null);
      // After users loaded, restore unread counts from storage
      this.restoreUnreadCounts();
      // Ensure global subscription keeps lastMessage fresh; avoid stale overwrites
      
      this.cdr.detectChanges();
      
      // Start periodic online status checking
      this.startOnlineStatusChecking();
    } catch (e) {
      console.error('Failed to load online users', e);
    }
  }

  private async loadPastChatsAndSort(users: UserInterface[], myCustomUserIdForMsgs: string | null) {
    if (!myCustomUserIdForMsgs) {
      this.users = users;
      return;
    }

    try {
      // Get all unique chat partners from messages
      const allMessages = await this.appWrite.listAllMessages(myCustomUserIdForMsgs);
      const chatPartners = new Map<string, { lastMessage: string; lastMessageTimestamp: Date }>();

      // Process messages to find last message for each chat partner
      allMessages.forEach((msg: any) => {
        const sentAt = new Date(msg.sentAt);
        // Normalize key to ALWAYS be the other participant's custom userId
        const partnerId = msg.chatId === myCustomUserIdForMsgs ? msg.senderId : msg.chatId;
        
        if (!chatPartners.has(partnerId) || chatPartners.get(partnerId)!.lastMessageTimestamp < sentAt) {
          chatPartners.set(partnerId, {
            lastMessage: msg.type === 'audio' ? 'Audio message' : msg.text || '',
            lastMessageTimestamp: sentAt
          });
        }
      });

      // Update users with last message info
      const updatedUsers = users.map(user => {
        // Prefer matching by custom userId; fall back to id only if missing userId
        const key = user.userId || user.id;
        const chatInfo = chatPartners.get(key);
        if (chatInfo) {
          return {
            ...user,
            lastMessage: chatInfo.lastMessage,
            lastMessageTimestamp: chatInfo.lastMessageTimestamp
          };
        }
        return user;
      });

      // Add users who have chat history but aren't in presence (include even if not currently friends)
      chatPartners.forEach((chatInfo, partnerId) => {
        const exists = updatedUsers.find(u => u.userId === partnerId || u.id === partnerId);
        if (!exists) {
          updatedUsers.push({
            id: partnerId,
            userId: partnerId,
            name: 'User',
            avatarUrl: 'assets/images/profile.jpeg',
            lastMessage: chatInfo.lastMessage,
            lastActiveTime: chatInfo.lastMessageTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isOnline: false,
            lastMessageTimestamp: chatInfo.lastMessageTimestamp,
            unreadCount: 0
          } as unknown as UserInterface);
        }
      });

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

      // Hydrate missing names/avatars from presence for users added from history
      try {
        const toHydrate = this.users.filter(u => !u.name || u.name === 'User');
        if (toHydrate.length > 0) {
          const hydrated = await Promise.all(toHydrate.map(async (u) => {
            try {
              const doc = await this.appWrite.findUserByCustomId(u.userId);
              if (doc) {
                u.name = (doc as any).name || u.name;
                u.avatarUrl = (doc as any).avatarUrl || u.avatarUrl;
              }
            } catch {}
            return u;
          }));
          this.cdr.detectChanges();
        }
      } catch {}

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
    // Fetch once and update all users atomically to avoid status flapping
    this.appWrite.listOnlineUsers(120).then((docs: any[]) => {
      const now = new Date();
      const onlineSet = new Set<string>();
      docs.forEach((d: any) => {
        const lastSeen = new Date(d.lastSeen);
        const timeDiff = now.getTime() - lastSeen.getTime();
        if (timeDiff < this.OFFLINE_THRESHOLD_SECONDS * 1000) {
          onlineSet.add(d.userId);
        }
      });
      let changed = false;
      this.users.forEach(u => {
        const next = onlineSet.has(u.userId);
        if (u.isOnline !== next) {
          u.isOnline = next;
          changed = true;
        }
      });
      if (changed) this.cdr.detectChanges();
    }).catch((e) => {
      console.error('Failed to update online status:', e);
    });
  }

  private async checkUserOnlineStatus(user: UserInterface): Promise<boolean> {
    try {
      // In a real implementation, you'd check the user's last activity
      // For now, we'll simulate by checking if they're still in the recent online users
      const docs = await this.appWrite.listOnlineUsers(120);
      const userDoc = docs.find((d: any) => d.userId === user.userId);
      
      if (!userDoc) {
        return false; // User not in online list, consider offline
      }
      
      // Check if last seen is within threshold
      const lastSeen = new Date(userDoc.lastSeen);
      const timeDiff = new Date().getTime() - lastSeen.getTime();
      return timeDiff < this.OFFLINE_THRESHOLD_SECONDS * 1000;
    } catch (e) {
      console.error('Failed to check user online status', e);
      return user.isOnline; // Keep current status on error
    }
  }

  // Refresh presence heartbeat to ensure it's still active
  private async refreshPresenceHeartbeat() {
    try {
      // Stop the current heartbeat
      if (this.stopPresence) {
        this.stopPresence();
      }
      // Restart the heartbeat
      this.stopPresence = await this.appWrite.startPresenceHeartbeat();
    } catch (e) {
      console.error('Failed to refresh presence heartbeat:', e);
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

  // Clear chat for both users
  async clearChat() {
    if (!this.selectedUserId) return;
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    try {
      const confirm = await Swal.fire({
        title: 'Clear chat for both users?',
        text: 'This will delete all messages in this conversation for everyone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel'
      });
      if (!confirm.isConfirmed) return;

      // Clear local messages immediately for better UX
      this.messages = [];
      const idx = this.users.findIndex(u => u.userId === this.selectedUserId);
      if (idx !== -1) {
        this.users[idx].lastMessage = '';
        this.users[idx].lastMessageTimestamp = undefined;
        this.users[idx].unreadCount = 0;
      }
      this.persistUnreadCounts();
      this.cdr.detectChanges();

      // Delete from server (realtime will handle the rest)
      await this.appWrite.deleteConversation(this.selectedUserId, myCustomId);
      
      // Refresh online status after deletion to ensure it's not affected
      setTimeout(() => {
        this.updateOnlineStatus();
        // Also refresh the presence heartbeat to ensure it's still active
        this.refreshPresenceHeartbeat();
      }, 1000);
    } catch (e) {
      console.error('Failed to clear chat', e);
      // Show error message to user
      Swal.fire({
        title: 'Error',
        text: 'Failed to clear chat. Please try again.',
        icon: 'error'
      });
    }
  }

  toggleFiles() {
    this.isFilesOpen = !this.isFilesOpen;
    if (this.isFilesOpen) {
      this.loadFilesForConversation();
    }
  }

  toggleFriendsManager() {
    this.isFriendsManagerOpen = !this.isFriendsManagerOpen;
    if (this.isFriendsManagerOpen) {
      this.loadFriendsData();
    }
  }

  private async loadFriendsData() {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    this.friendsList = await this.appWrite.getFriends(myCustomId);
    this.blockedUsers = await this.appWrite.listBlockedUsers(myCustomId);
    // Outgoing pending
    this.outgoingRequests = await this.appWrite.getOutgoingFriendRequests(myCustomId);
    this.cdr.detectChanges();
  }

  async blockUser(userId: string) {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    await this.appWrite.blockUser(myCustomId, userId);
    await this.loadFriendsData();
  }

  async unblockUser(userId: string) {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    await this.appWrite.unblockUser(myCustomId, userId);
    await this.loadFriendsData();
  }

  async cancelOutgoing(addresseeId: string) {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    await this.appWrite.cancelOutgoingRequest(myCustomId, addresseeId);
    await this.loadFriendsData();
  }

  async unfriend(userId: string) {
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    await this.appWrite.unfriend(myCustomId, userId);
    await this.loadFriendsData();
  }

  async unfriendUser() {
    if (!this.selectedUserId) return;
    
    const confirm = await Swal.fire({
      title: 'Unfriend User?',
      text: `Are you sure you want to unfriend ${this.selectedUser?.name || this.selectedUserId}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, unfriend',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });
    
    if (!confirm.isConfirmed) return;
    
    try {
      await this.unfriend(this.selectedUserId);
      Swal.fire({
        title: 'Unfriended',
        text: 'User has been unfriended successfully.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
      
      // Don't remove user from chat list - keep past chat history
      // Just clear the current chat and show the "not friends" message
      this.messages = [];
      this.cdr.detectChanges();
    } catch (e: any) {
      Swal.fire({
        title: 'Error',
        text: e?.message || 'Failed to unfriend user',
        icon: 'error'
      });
    }
  }

  async resendFriendRequest() {
    try {
      if (!this.selectedUserId) return;
      await this.appWrite.sendFriendRequest(this.selectedUserId);
      Swal.fire({ title: 'Friend request sent', icon: 'success', timer: 1500, showConfirmButton: false });
      // Refresh manager data if open
      if (this.isFriendsManagerOpen) await this.loadFriendsData();
    } catch (e: any) {
      Swal.fire({ title: 'Error', text: e?.message || 'Failed to send request', icon: 'error' });
    }
  }

  private async loadFilesForConversation() {
    if (!this.selectedUserId) return;
    const me = await this.appWrite.getUser().catch(() => null);
    const myCustomId = (me as any)?.prefs?.userId;
    if (!myCustomId) return;
    const docs = await this.appWrite.listMessages(this.selectedUserId, myCustomId, 500);
    const images: any[] = [];
    const audio: any[] = [];
    const documents: any[] = [];
    docs.forEach((d: any) => {
      if (d.type === 'audio' && d.url) {
        audio.push(d);
      }
      // naive image detection if implemented later
      if (d.type === 'image' && d.url) {
        images.push(d);
      }
      if (d.type === 'file' && d.url) {
        documents.push(d);
      }
    });
    this.filesByType = { images, audio, documents };
    this.cdr.detectChanges();
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

      // Load both directions using custom userIds
      const docs = await this.appWrite.listMessages(this.selectedUserId, myId || undefined);
      // Check blocking both ways to gate composer
      this.isChatBlocked = myId ? await this.appWrite.isBlocked(this.selectedUserId, myId) : false;
      this.isFriendsWithSelected = myId ? await this.appWrite.isFriends(this.selectedUserId, myId) : false;
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
          // Handle delete events first
          if ((doc as any)._op === 'delete') {
            // Remove the deleted message from local array
            const messageIndex = this.messages.findIndex(m => m.id === doc.$id);
            if (messageIndex !== -1) {
              this.messages.splice(messageIndex, 1);
              this.cdr.detectChanges();
            }
            return;
          }

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
          // Persist unread counts after realtime update
          this.persistUnreadCounts();
          // If message belongs to active chat, update lastRead to now so unread elsewhere isn't affected
          try {
            const map = JSON.parse(localStorage.getItem('chat_last_read_ts') || '{}');
            if (this.selectedUserId) {
              map[this.selectedUserId] = Date.now();
              localStorage.setItem('chat_last_read_ts', JSON.stringify(map));
            }
          } catch {}
          // Friendship might have changed via realtime; refresh composer gate
          const me2 = await this.appWrite.getUser().catch(() => null);
          const myCustom2 = (me2 as any)?.prefs?.userId;
          if (myCustom2) {
            this.isFriendsWithSelected = await this.appWrite.isFriends(this.selectedUserId!, myCustom2);
            this.isChatBlocked = await this.appWrite.isBlocked(this.selectedUserId!, myCustom2);
            this.cdr.detectChanges();
          }
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

  onKeydown(event: KeyboardEvent) {
    // Close emoji picker with Escape key
    if (event.key === 'Escape' && this.isEmojiPickerOpen) {
      this.closeEmojiPicker();
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
    // chatId here represents the custom userId
    const userIndex = this.users.findIndex(u => u.userId === chatId);
    if (userIndex !== -1) {
      // Only update if newer than what we have
      const prevTs = this.users[userIndex].lastMessageTimestamp;
      if (!prevTs || prevTs.getTime() <= timestamp.getTime()) {
        this.users[userIndex].lastMessage = messageText;
        this.users[userIndex].lastMessageTimestamp = timestamp;
      }
      this.users[userIndex].lastActiveTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Re-sort the users array
      this.sortUsers();
      this.cdr.detectChanges();
      this.persistUnreadCounts();
    }
  }

  private updateUserListWithNewMessage(doc: any, myId: string | null) {
    if (!myId) return;
    
    const chatId = doc.chatId === myId ? doc.senderId : doc.chatId;
    const messageText = doc.type === 'audio' ? 'Audio message' : doc.text || '';
    const timestamp = new Date(doc.sentAt);
    
    // Find by custom userId for stability
    const userIndex = this.users.findIndex(u => u.userId === chatId);
    if (userIndex !== -1) {
      // Only update last message if this message is newer
      const prevTs = this.users[userIndex].lastMessageTimestamp;
      if (!prevTs || prevTs.getTime() <= timestamp.getTime()) {
        this.users[userIndex].lastMessage = messageText;
        this.users[userIndex].lastMessageTimestamp = timestamp;
      }
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
        userId: chatId, // Fallback when we don't have presence mapping
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
    this.persistUnreadCounts();
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

  // Check if there are any remaining messages for a user and update lastMessage accordingly
  private async checkAndUpdateLastMessageForUser(chatId: string, myCustomId: string) {
    // Clear any existing timeout for this user
    const existingTimeout = this.messageCheckTimeouts.get(chatId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Debounce the check to prevent interference with online status updates
    const timeoutId = window.setTimeout(async () => {
      try {
        // Get all remaining messages for this conversation
        const remainingMessages = await this.appWrite.listMessages(chatId, myCustomId, 1);
        
        const userIndex = this.users.findIndex(u => u.userId === chatId);
        if (userIndex !== -1) {
          if (remainingMessages.length === 0) {
            // No messages left, clear the lastMessage
            this.users[userIndex].lastMessage = '';
            this.users[userIndex].lastMessageTimestamp = undefined;
          } else {
            // Update with the actual last message
            const lastMsg = remainingMessages[0];
            this.users[userIndex].lastMessage = lastMsg['type'] === 'audio' ? 'Audio message' : lastMsg['text'] || '';
            this.users[userIndex].lastMessageTimestamp = new Date(lastMsg['sentAt']);
          }
          this.cdr.detectChanges();
        }
      } catch (e) {
        console.error('Failed to check remaining messages for user', chatId, e);
        // On error, still try to clear the lastMessage as a fallback
        const userIndex = this.users.findIndex(u => u.userId === chatId);
        if (userIndex !== -1) {
          this.users[userIndex].lastMessage = '';
          this.users[userIndex].lastMessageTimestamp = undefined;
          this.cdr.detectChanges();
        }
      } finally {
        // Clean up the timeout reference
        this.messageCheckTimeouts.delete(chatId);
      }
    }, 500); // 500ms debounce
    
    this.messageCheckTimeouts.set(chatId, timeoutId);
  }

  // Persist and restore unread counts across refreshes using localStorage
  private persistUnreadCounts() {
    try {
      const map: Record<string, number> = {};
      this.users.forEach(u => { if (u.userId) map[u.userId] = u.unreadCount || 0; });
      localStorage.setItem('chat_unread_counts', JSON.stringify(map));
    } catch {}
  }

  private restoreUnreadCounts() {
    try {
      const raw = localStorage.getItem('chat_unread_counts');
      if (!raw) return;
      const map = JSON.parse(raw || '{}') as Record<string, number>;
      this.users.forEach(u => {
        if (u.userId && map[u.userId] !== undefined) {
          u.unreadCount = map[u.userId];
        }
      });
    } catch {}
  }

  // Compute unread counts based on last seen message timestamp per chat
  private async recomputeUnreadCountsFromMessages() {
    try {
      const me = await this.appWrite.getUser().catch(() => null);
      const myCustomId = (me as any)?.prefs?.userId;
      if (!myCustomId) return;
      const all = await this.appWrite.listAllMessages(myCustomId, 1000);
      const lastRead = JSON.parse(localStorage.getItem('chat_last_read_ts') || '{}') as Record<string, number>;
      const counts: Record<string, number> = {};
      // Count only messages sent by partner after lastRead
      all.forEach((m: any) => {
        const partnerId = m.chatId === myCustomId ? m.senderId : m.chatId;
        const ts = new Date(m.sentAt).getTime();
        const last = lastRead[partnerId] || 0;
        const sentByPartner = m.senderId !== myCustomId;
        if (sentByPartner && ts > last) {
          counts[partnerId] = (counts[partnerId] || 0) + 1;
        }
      });
      // Apply to users; active chat always 0 and bump its lastRead to now
      this.users.forEach(u => {
        if (this.selectedUserId === u.userId) {
          u.unreadCount = 0;
          lastRead[u.userId!] = Date.now();
        } else {
          u.unreadCount = counts[u.userId!] || 0;
        }
      });
      localStorage.setItem('chat_last_read_ts', JSON.stringify(lastRead));
      this.persistUnreadCounts();
      this.cdr.detectChanges();
    } catch {}
  }

  // Friend Management Methods
  async addFriend() {
    const result = await Swal.fire({
      title: 'Add Friend',
      input: 'text',
      inputLabel: 'Enter your friend\'s User ID',
      inputPlaceholder: 'e.g., john_doe123',
      allowOutsideClick: true,
      allowEscapeKey: true,
      showCancelButton: true,
      cancelButtonText: 'Cancel',
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
      // Get the requester ID before accepting the request
      const request = this.pendingRequests.find(req => req.$id === reqId);
      const requesterId = request?.requesterId;
      
      await this.appWrite.acceptFriendRequest(reqId);
      await this.refreshPendingRequests();
      await this.loadOnlineUsers();
      
      // If the accepted user is currently selected, update friendship status and show composer
      if (requesterId && this.selectedUserId === requesterId) {
        // Update friendship status for the selected user
        this.isFriendsWithSelected = true;
        this.isChatBlocked = false;
      }
      
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

  // Emoji picker methods
  toggleEmojiPicker() {
    this.isEmojiPickerOpen = !this.isEmojiPickerOpen;
  }

  closeEmojiPicker() {
    this.isEmojiPickerOpen = false;
  }

  insertEmoji(emoji: string) {
    // Insert emoji at cursor position in textarea
    const textarea = document.querySelector('textarea[ngModel="message"]') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = this.message;
      
      // Insert emoji at cursor position
      this.message = text.substring(0, start) + emoji + text.substring(end);
      
      // Set cursor position after the emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      // Fallback: append emoji to end of message
      this.message += emoji;
    }
    
    // Close emoji picker
    this.closeEmojiPicker();
  }
}
